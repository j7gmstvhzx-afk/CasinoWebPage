#!/usr/bin/env bash
# =============================================================================
# Prueba de concurrencia de la tragamonedas.
#
# Esta es LA prueba del sistema. Dispara cientos de tiradas realmente
# simultáneas contra Postgres y verifica que salga exactamente un ganador.
# Es la única forma de comprobar la garantía de "un premio por día": un test
# secuencial nunca reproduce la condición de carrera que se quiere descartar.
#
#   ./scripts/test-concurrency.sh [clientes] [tiradas]
#
# Requiere: un Postgres con las migraciones aplicadas.
#   PGHOST / PGPORT / PGUSER / PGDATABASE, o DATABASE_URL.
# =============================================================================
set -euo pipefail

CLIENTS="${1:-50}"
SPINS="${2:-200}"
DB="${PGDATABASE:-cam}"
PSQL=(psql -d "$DB" -v ON_ERROR_STOP=1 -tAq)

fail() { echo "  ✗ $1"; FAILURES=$((FAILURES + 1)); }
pass() { echo "  ✓ $1"; }
FAILURES=0

echo "=== Preparando: $SPINS jugadores, $CLIENTS clientes simultáneos ==="

"${PSQL[@]}" >/dev/null <<SQL
truncate app.voucher_events, app.vouchers, app.wins, app.spins,
         app.daily_winner_slots, app.risk_events, app.rate_events
         restart identity cascade;
delete from app.players;

drop table if exists t_players;
create table t_players (n bigint primary key, id uuid not null);
drop sequence if exists spin_seq;
create sequence spin_seq;

-- Jugadores de prueba: +1787555XXXX
insert into app.players (phone_e164, full_name, municipality_id)
select '+1787555' || lpad(g::text, 4, '0'), 'Jugador Prueba ' || g, 47
from generate_series(1, $SPINS) g;

insert into t_players (n, id)
select row_number() over (order by phone_e164), id from app.players;

-- Premio de hoy, con el instante ganador YA pasado: así TODAS las tiradas son
-- candidatas al mismo tiempo y la carrera es máxima.
insert into app.daily_winner_slots (gaming_date, winning_moment_at, seeded_by)
values (app.gaming_date(now()), now() - interval '1 hour', 'test');
SQL

# Ojo con `n = nextval(...)` a secas: nextval es VOLATILE y dentro de un filtro
# Postgres la evalúa UNA VEZ POR FILA, consumiendo 200 valores por consulta y no
# coincidiendo casi nunca. Envuelta en una subconsulta escalar no correlacionada
# se convierte en InitPlan y se evalúa una sola vez por sentencia.
cat > /tmp/cam_spin.sql <<'SQL'
select * from app.execute_spin(
  (select id from t_players where n = (select nextval('spin_seq'))),
  gen_random_uuid(),
  ('10.0.' || (random()*250)::int || '.' || (random()*250)::int)::inet,
  'pgbench',
  array[0,1,2]::smallint[],
  array[3,3,3]::smallint[],
  upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10))
);
SQL

echo "=== Disparando $SPINS tiradas simultáneas ==="
pgbench -d "$DB" -n -f /tmp/cam_spin.sql -c "$CLIENTS" -j 4 -t $((SPINS / CLIENTS)) 2>&1 \
  | grep -E "number of (transactions|failed)|latency average" || true

echo
echo "=== Resultados ==="

check() { # nombre, sql, esperado
  local got
  got=$("${PSQL[@]}" -c "$2")
  if [ "$got" = "$3" ]; then pass "$1 ($got)"; else fail "$1: esperado $3, obtenido $got"; fi
}

check "Exactamente 1 ganador"            "select count(*) from app.spins where is_winner" 1
check "Exactamente 1 premio registrado"  "select count(*) from app.wins" 1
check "Exactamente 1 voucher emitido"    "select count(*) from app.vouchers" 1
check "El premio del día está reclamado" "select count(*) from app.daily_winner_slots where winning_spin_id is not null" 1
check "Todas las tiradas se guardaron"   "select count(*) from app.spins" "$SPINS"
check "Sin conflictos de restricción"    "select count(*) from app.risk_events where kind = 'claim_constraint_conflict'" 0

# El ganador, el premio y el voucher tienen que apuntar a la misma tirada.
check "Ganador / premio / voucher coherentes" \
  "select count(*) from app.spins s
     join app.wins w     on w.spin_id = s.id
     join app.vouchers v on v.win_id  = w.id
     join app.daily_winner_slots d on d.winning_spin_id = s.id
    where s.is_winner" 1

# Los perdedores nunca pueden mostrar tres símbolos iguales.
check "Ningún perdedor con 3 iguales" \
  "select count(*) from app.spins
    where not is_winner and reels[1] = reels[2] and reels[2] = reels[3]" 0

echo
echo "=== Idempotencia: el mismo jugador tira otra vez ==="
BEFORE=$("${PSQL[@]}" -c "select count(*) from app.spins")
REPLAY=$("${PSQL[@]}" -c "
  select out_replayed from app.execute_spin(
    (select id from t_players where n = 1), gen_random_uuid(), '10.0.0.1'::inet,
    'replay', array[0,1,2]::smallint[], array[3,3,3]::smallint[], 'ZZZZZZZZZZ');")
AFTER=$("${PSQL[@]}" -c "select count(*) from app.spins")

[ "$REPLAY" = "t" ]        && pass "Se marca como repetición" || fail "Debió marcarse como repetición"
[ "$BEFORE" = "$AFTER" ]   && pass "No se creó tirada nueva"  || fail "Se creó una tirada extra"

echo
echo "=== Regla de 30 días ==="
# Se le fabrica a un perdedor un premio de hace 5 días, se libera el premio de
# hoy, y se le da otra tirada: no debe poder ganar, aunque sea el único
# candidato y el instante ganador ya haya pasado.
COOLED=$("${PSQL[@]}" -c "select id from t_players where n = 2")
"${PSQL[@]}" >/dev/null <<SQL
-- Tirada y premio de hace 5 días
with s as (
  insert into app.spins (player_id, gaming_date, is_winner, reels, created_at)
  values ('$COOLED', app.gaming_date(now()) - 5, true, array[3,3,3]::smallint[],
          now() - interval '5 days')
  returning id
)
insert into app.wins (player_id, spin_id, gaming_date, won_at, cooldown)
select '$COOLED', s.id, app.gaming_date(now()) - 5, now() - interval '5 days',
       tstzrange(now() - interval '5 days', now() + interval '25 days', '[)')
from s;

-- Se libera el premio de hoy y se borra su tirada de hoy (no la referencia
-- ningún premio, así que sale limpia).
update app.daily_winner_slots set winning_spin_id = null, claimed_at = null
 where gaming_date = app.gaming_date(now());
delete from app.spins
 where player_id = '$COOLED' and gaming_date = app.gaming_date(now());
SQL
RETRY=$("${PSQL[@]}" -c "
  select out_is_winner from app.execute_spin(
    '$COOLED'::uuid, gen_random_uuid(), '10.0.0.1'::inet, 'retry',
    array[0,1,2]::smallint[], array[3,3,3]::smallint[], 'YYYYYYYYYY');")
[ "$RETRY" = "f" ] && pass "Un ganador reciente no vuelve a ganar" \
                   || fail "Volvió a ganar dentro de los 30 días"

# Y el premio del día tiene que seguir DISPONIBLE: un jugador no elegible
# nunca debe consumir el premio y dejar el día sin ganador.
STILL=$("${PSQL[@]}" -c "select count(*) from app.daily_winner_slots
                          where gaming_date = app.gaming_date(now())
                            and winning_spin_id is null")
[ "$STILL" = "1" ] && pass "El no elegible no se comió el premio del día" \
                   || fail "El premio del día se consumió sin ganador"

echo
echo "=== Canje ==="
CODE=$("${PSQL[@]}" -c "select code from app.vouchers limit 1")
"${PSQL[@]}" >/dev/null -c "insert into app.staff (display_name, email) values ('Cajero Prueba','cajero@test.local') on conflict do nothing;"
STAFF=$("${PSQL[@]}" -c "select id from app.staff limit 1")
R1=$("${PSQL[@]}" -c "select ok from app.redeem_voucher('$CODE', '$STAFF'::uuid);")
R2=$("${PSQL[@]}" -c "select reason from app.redeem_voucher('$CODE', '$STAFF'::uuid);")
[ "$R1" = "t" ]            && pass "Primer canje aceptado"        || fail "El primer canje falló"
[ "$R2" = "YA_CANJEADO" ]  && pass "Segundo canje rechazado"      || fail "Segundo canje devolvió: $R2"

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "TODO PASÓ ✓"
else
  echo "$FAILURES PRUEBA(S) FALLARON ✗"
  exit 1
fi
