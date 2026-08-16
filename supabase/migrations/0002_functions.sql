-- =============================================================================
-- Funciones del servidor
--
-- TODO el proceso de una tirada corre como UNA sola llamada a Postgres, no como
-- varias consultas seguidas desde Next.js. Razón: Supabase usa un pooler en
-- modo transacción, y desde ahí no se puede sostener una transacción de varios
-- pasos con garantía — cada consulta puede caer en una conexión distinta.
-- Una llamada = una transacción implícita = atómico de verdad.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Límite de tasa por ventana fija
-- -----------------------------------------------------------------------------
create or replace function app.rate_hit(
  p_bucket text,
  p_key    text,
  p_window interval,
  p_limit  integer
) returns boolean               -- true = permitido
language plpgsql
as $$
declare
  v_secs  numeric := extract(epoch from p_window);
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / v_secs) * v_secs);
  v_count integer;
begin
  insert into app.rate_events (bucket, key, window_start, count)
  values (p_bucket, p_key, v_start, 1)
  on conflict (bucket, key, window_start)
    do update set count = app.rate_events.count + 1
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

-- -----------------------------------------------------------------------------
-- Número al azar criptográfico en [0, 1)
-- -----------------------------------------------------------------------------
create or replace function app.crypto_random()
returns numeric
language sql
volatile
as $$
  select (('x' || encode(gen_random_bytes(6), 'hex'))::bit(48)::bigint)::numeric
         / 281474976710656::numeric;   -- 2^48
$$;

-- -----------------------------------------------------------------------------
-- Sembrar el premio de un día
--
-- El instante se escoge PONDERADO POR TRÁFICO, no plano sobre las 24 horas.
-- Si fuera plano, casi siempre caería de madrugada cuando no hay nadie jugando
-- y ganaría el primero que tire por la mañana — un patrón que los clientes
-- regulares notan. Ponderándolo, todos tienen la misma oportunidad real.
--
-- p_from_hour permite el modo degradado: si por lo que sea no se sembró el día
-- por adelantado, se siembra solo sobre las horas que faltan, nunca hacia atrás.
-- Sembrar hacia atrás le regalaría la victoria al primero que tire.
-- -----------------------------------------------------------------------------
create or replace function app.seed_slot(
  p_date      date,
  p_source    text default 'cron',
  p_from_hour smallint default 0
)
returns app.daily_winner_slots
language plpgsql
as $$
declare
  v_hour   smallint;
  v_sec    integer;
  v_moment timestamptz;
  v_nonce  bytea := gen_random_bytes(16);
  v_row    app.daily_winner_slots;
begin
  select w.hour_local into v_hour
  from (
    select hour_local,
           sum(weight) over (order by hour_local) as cum,
           sum(weight) over ()                    as total
    from app.traffic_weights
    where hour_local >= p_from_hour and weight > 0
  ) w
  where w.cum >= app.crypto_random() * w.total
  order by w.hour_local
  limit 1;

  -- Si no quedan horas con peso (p. ej. siembra degradada a las 11:50 p.m.),
  -- se usa la hora actual para que el premio siga siendo alcanzable hoy.
  if v_hour is null then
    v_hour := greatest(p_from_hour, 0)::smallint;
  end if;

  v_sec := floor(app.crypto_random() * 3600)::integer;

  v_moment := (p_date::timestamp
               + make_interval(hours => v_hour, secs => v_sec))
              at time zone 'America/Puerto_Rico';

  insert into app.daily_winner_slots
    (gaming_date, winning_moment_at, commitment_sha256, reveal_nonce, seeded_by)
  values
    (p_date, v_moment,
     digest(v_nonce || convert_to(v_moment::text, 'UTF8'), 'sha256'),
     v_nonce, p_source)
  on conflict (gaming_date) do nothing
  returning * into v_row;

  -- Otro proceso lo sembró primero: nos quedamos con el suyo.
  if v_row.gaming_date is null then
    select * into v_row from app.daily_winner_slots where gaming_date = p_date;
  end if;

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ejecutar una tirada
-- -----------------------------------------------------------------------------
create or replace function app.execute_spin(
  p_player_id    uuid,
  p_device_id    uuid,
  p_ip           inet,
  p_user_agent   text,
  p_reels_lose   smallint[],
  p_reels_win    smallint[],
  p_voucher_code text,
  p_voucher_days integer default 7
)
returns table (
  out_spin_id      uuid,
  out_gaming_date  date,
  out_is_winner    boolean,
  out_reels        smallint[],
  out_replayed     boolean,
  out_voucher_code text,
  out_voucher_exp  timestamptz
)
language plpgsql
security definer
set search_path = app, public, pg_catalog
as $$
declare
  v_now     timestamptz := now();   -- consistente en toda la transacción
  v_date    date        := app.gaming_date(v_now);
  v_spin    app.spins;
  v_slot    app.daily_winner_slots;
  v_win_id  uuid;
  v_vcode   text;
  v_vexp    timestamptz;
  v_claimed boolean := false;
begin
  ---------------------------------------------------------------------------
  -- 1. INSERCIÓN IDEMPOTENTE
  --
  -- unique(player_id, gaming_date) es la llave de idempotencia. Doble clic,
  -- reintento tras respuesta perdida, segunda pestaña, botón de atrás, y el
  -- usuario que borró cookies y se registró de nuevo con el mismo celular
  -- convergen todos aquí y reciben la MISMA tirada y el MISMO voucher.
  ---------------------------------------------------------------------------
  insert into app.spins (player_id, gaming_date, created_at, is_winner,
                         reels, device_id, ip_inet, user_agent)
  values (p_player_id, v_date, v_now, false,
          p_reels_lose, p_device_id, p_ip, p_user_agent)
  on conflict (player_id, gaming_date) do nothing
  returning * into v_spin;

  if v_spin.id is null then
    -- ON CONFLICT DO NOTHING bloquea hasta que la transacción rival confirme o
    -- aborte, así que bajo READ COMMITTED este SELECT (snapshot nuevo por
    -- sentencia) tiene garantizado ver la fila.
    select * into v_spin
      from app.spins
     where player_id = p_player_id and gaming_date = v_date;

    select v.code, v.expires_at into v_vcode, v_vexp
      from app.vouchers v
      join app.wins w on w.id = v.win_id
     where w.spin_id = v_spin.id and v.status <> 'void';

    return query select v_spin.id, v_spin.gaming_date, v_spin.is_winner,
                        v_spin.reels, true, v_vcode, v_vexp;
    return;
  end if;

  ---------------------------------------------------------------------------
  -- 2. SIEMBRA DEGRADADA
  --
  -- El día debería estar sembrado por cron. Si no lo está, se siembra sobre
  -- las horas que QUEDAN (nunca hacia atrás) y se marca como incidente.
  ---------------------------------------------------------------------------
  select * into v_slot from app.daily_winner_slots where gaming_date = v_date;
  if v_slot.gaming_date is null then
    v_slot := app.seed_slot(
      v_date, 'lazy_degraded',
      extract(hour from (v_now at time zone 'America/Puerto_Rico'))::smallint
    );
    insert into app.risk_events (kind, score, detail)
    values ('slot_not_preseeded', 50, jsonb_build_object('gaming_date', v_date));
  end if;

  ---------------------------------------------------------------------------
  -- 3. EL RECLAMO ATÓMICO
  --
  -- Este UPDATE es el punto de serialización. Si diez personas tiran en el
  -- mismo milisegundo, la primera toma el candado de la fila; las otras nueve
  -- esperan, y al liberarse READ COMMITTED reevalúa el WHERE contra la fila ya
  -- confirmada (EvalPlanQual), ve que winning_spin_id dejó de ser NULL, y
  -- actualiza CERO filas. Sin candados manuales, sin reintentos, sin
  -- comprobar-y-luego-actuar desde la aplicación.
  --
  -- Las condiciones de elegibilidad van DENTRO del WHERE a propósito. Si
  -- fueran un chequeo previo, un jugador no elegible que llegue justo después
  -- del instante secreto se comería el premio del día y NADIE ganaría ese día.
  -- Así simplemente no califica y el premio sigue disponible para el próximo.
  ---------------------------------------------------------------------------
  begin
    update app.daily_winner_slots s
       set winning_spin_id = v_spin.id,
           claimed_at      = v_now
     where s.gaming_date      = v_date
       and s.winning_spin_id is null              -- nadie ha ganado hoy
       and v_now             >= s.winning_moment_at
       and not exists (                           -- no ganó en los últimos 30 días
             select 1 from app.wins w
              where w.player_id = p_player_id
                and w.cooldown @> v_now)
       and exists (                               -- no está bloqueado
             select 1 from app.players p
              where p.id = p_player_id
                and p.blocked_at is null)
    returning * into v_slot;

    v_claimed := found;

    if v_claimed then
      -- Respaldo #1: el índice único parcial spins_one_winner_per_day.
      update app.spins
         set is_winner = true, reels = p_reels_win
       where id = v_spin.id
      returning * into v_spin;

      -- Respaldo #2: la restricción EXCLUDE wins_no_repeat_within_30d.
      insert into app.wins (player_id, spin_id, gaming_date, won_at, cooldown)
      values (p_player_id, v_spin.id, v_date, v_now,
              tstzrange(v_now, v_now + interval '30 days', '[)'))
      returning id into v_win_id;

      -- Vence al final del día, no a la hora exacta: "vence el sábado"
      -- significa todo el sábado, y así no hay discusión en el mostrador.
      v_vexp := ((v_date + p_voucher_days)::timestamp
                 + interval '1 day' - interval '1 second')
                at time zone 'America/Puerto_Rico';

      insert into app.vouchers (win_id, player_id, code, amount_cents, expires_at)
      values (v_win_id, p_player_id, p_voucher_code, v_slot.prize_cents, v_vexp);

      insert into app.voucher_events (voucher_id, event, detail)
      select id, 'issued', jsonb_build_object('spin_id', v_spin.id)
        from app.vouchers where code = p_voucher_code;

      v_vcode := p_voucher_code;
    end if;

  exception
    when unique_violation or exclusion_violation then
      -- Llegar aquí significa que los guardas del WHERE no coincidieron con
      -- las restricciones: es un bug de verdad. Se degrada a derrota, se
      -- conserva la tirada, y queda el rastro para la alerta.
      v_claimed := false;
      v_vcode   := null;
      v_vexp    := null;
      insert into app.risk_events (player_id, device_id, ip_inet, kind, score, detail)
      values (p_player_id, p_device_id, p_ip, 'claim_constraint_conflict', 100,
              jsonb_build_object('sqlstate', SQLSTATE, 'gaming_date', v_date));
  end;

  return query select v_spin.id, v_date, v_claimed,
                      case when v_claimed then p_reels_win else p_reels_lose end,
                      false, v_vcode, v_vexp;
end;
$$;

-- -----------------------------------------------------------------------------
-- Canjear un voucher
--
-- NUNCA por GET. Si /premio/<codigo> mutara estado, los rastreadores de vista
-- previa de WhatsApp, iMessage y Facebook canjearían el cupón en silencio en
-- cuanto el ganador compartiera el enlace — y el prefetch del navegador
-- también. El cliente ve una página de solo lectura; el canje es POST desde
-- una sesión de empleado autenticada.
-- -----------------------------------------------------------------------------
create or replace function app.redeem_voucher(p_code text, p_staff_id uuid)
returns table (
  ok           boolean,
  reason       text,
  amount_cents integer,
  player_name  text,
  voucher_id   uuid
)
language plpgsql
security definer
set search_path = app, public, pg_catalog
as $$
declare
  v_id     uuid;
  v_amount integer;
  v_name   text;
  v_status app.voucher_status;
  v_exp    timestamptz;
begin
  -- Un solo UPDATE atómico. Dos terminales escaneando el mismo teléfono a la
  -- vez: la primera toma el candado y actualiza 1 fila; la segunda espera,
  -- reevalúa status='issued' contra la fila ya confirmada, y actualiza 0.
  update app.vouchers v
     set status      = 'redeemed',
         redeemed_at = now(),
         redeemed_by = p_staff_id
   where v.code       = p_code
     and v.status     = 'issued'
     and v.expires_at > now()
  returning v.id, v.amount_cents into v_id, v_amount;

  if found then
    select p.full_name into v_name
      from app.vouchers vv
      join app.players p on p.id = vv.player_id
     where vv.id = v_id;

    insert into app.voucher_events (voucher_id, event, actor_id)
    values (v_id, 'redeem_ok', p_staff_id);

    return query select true, 'OK'::text, v_amount, v_name, v_id;
    return;
  end if;

  -- Diagnosticar el fallo para que el empleado reciba un mensaje real y no
  -- un "inválido" genérico que no le dice qué hacer.
  select v.id, v.status, v.expires_at, p.full_name
    into v_id, v_status, v_exp, v_name
    from app.vouchers v
    join app.players p on p.id = v.player_id
   where v.code = p_code;

  if v_id is null then
    return query select false, 'NO_EXISTE'::text, null::integer, null::text, null::uuid;
    return;
  end if;

  insert into app.voucher_events (voucher_id, event, actor_id, detail)
  values (v_id, 'redeem_denied', p_staff_id, jsonb_build_object('status', v_status));

  return query select false,
    case when v_status = 'redeemed' then 'YA_CANJEADO'
         when v_status = 'void'     then 'ANULADO'
         when v_exp   <= now()      then 'VENCIDO'
         else 'NO_VALIDO' end,
    null::integer, v_name, v_id;
end;
$$;

revoke all on function app.execute_spin(uuid,uuid,inet,text,smallint[],smallint[],text,integer) from public;
revoke all on function app.redeem_voucher(text,uuid) from public;
revoke all on function app.seed_slot(date,text,smallint) from public;
