-- =============================================================================
-- Casino Atlántico Manatí — TODAS las migraciones en un solo archivo.
--
-- Generado a partir de supabase/migrations/. Pégalo completo en el editor SQL
-- de Supabase y dale RUN una sola vez.
--
-- Se puede volver a correr sin romper nada.
-- =============================================================================


-- ####################  0001_init.sql  ####################

-- =============================================================================
-- Casino Atlántico Manatí — esquema base
--
-- Todo vive en el esquema `app`, que NO se expone a la API pública de Supabase.
-- La llave `anon` viaja dentro del JavaScript del navegador; si estas tablas
-- fueran legibles desde ahí, cualquiera podría leer `winning_moment_at` y ganar
-- todos los días. Ver 0004_rls.sql.
-- =============================================================================

create extension if not exists pgcrypto;    -- gen_random_uuid, gen_random_bytes, digest
create extension if not exists btree_gist;  -- igualdad de uuid dentro de EXCLUDE
create extension if not exists pg_trgm;     -- similitud de nombres para revisión de abuso
create extension if not exists unaccent;    -- normalización de nombres

create schema if not exists app;

-- -----------------------------------------------------------------------------
-- Fecha "de juego"
--
-- Puerto Rico es AST (UTC-4) todo el año, sin horario de verano, así que el
-- corte de día es un desplazamiento fijo que nunca se mueve. Esta función es la
-- única fuente de verdad sobre "qué día es hoy" en todo el sistema.
--
-- Si algún día el casino quiere que el día "de negocio" empiece a las 4:00 a.m.
-- en vez de medianoche, se cambia solo esta línea.
-- -----------------------------------------------------------------------------
create or replace function app.gaming_date(ts timestamptz)
returns date
language sql
immutable
as $$
  select (ts at time zone 'America/Puerto_Rico')::date;
$$;

-- La forma de dos argumentos de unaccent() es IMMUTABLE; la de un argumento es
-- solo STABLE y Postgres la rechaza dentro de una columna generada.
create or replace function app.norm_name(t text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(unaccent('unaccent'::regdictionary, btrim(t))), '\s+', ' ', 'g');
$$;

-- -----------------------------------------------------------------------------
-- Municipios
--
-- Una llave foránea en vez de texto libre evita que la base termine con
-- "Manatí", "manati", "MANATI" y "manatí pr" como cuatro pueblos distintos,
-- que es lo que arruina la segmentación de mercadeo.
-- -----------------------------------------------------------------------------
create table app.municipalities (
  id    smallint primary key,
  name  text not null unique
);

-- -----------------------------------------------------------------------------
-- Jugadores
-- -----------------------------------------------------------------------------
create table app.players (
  id                uuid primary key default gen_random_uuid(),
  phone_e164        text not null,
  full_name         text not null,
  full_name_norm    text generated always as (app.norm_name(full_name)) stored,
  municipality_id   smallint not null references app.municipalities(id),
  consent_at        timestamptz not null default now(),
  -- Reservado: hoy no se verifica por SMS (decisión del negocio). La columna
  -- existe para poder activar OTP más adelante sin migración.
  phone_verified_at timestamptz,
  blocked_at        timestamptz,
  block_reason      text,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),

  constraint players_phone_key unique (phone_e164),
  constraint players_phone_fmt check (phone_e164 ~ '^\+1[2-9]\d{2}[2-9]\d{6}$'),
  constraint players_name_len  check (char_length(btrim(full_name)) between 3 and 120)
);

create index players_name_trgm_idx on app.players using gin (full_name_norm gin_trgm_ops);
create index players_created_idx   on app.players (created_at desc);
create index players_muni_idx      on app.players (municipality_id);

-- -----------------------------------------------------------------------------
-- Tiradas
-- -----------------------------------------------------------------------------
create table app.spins (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references app.players(id),
  gaming_date date not null,
  is_winner   boolean not null default false,
  reels       smallint[] not null,
  device_id   uuid,
  ip_inet     inet,
  user_agent  text,
  created_at  timestamptz not null default now(),

  -- UNA tirada por persona por día. Es además la llave de idempotencia del
  -- endpoint: doble clic, reintento tras timeout, segunda pestaña y botón de
  -- atrás caen todos aquí y devuelven la misma tirada.
  constraint spins_one_per_player_per_day unique (player_id, gaming_date),
  constraint spins_reels_len check (cardinality(reels) = 3)
);

-- =============================================================================
-- LA RESTRICCIÓN.
--
-- Este índice único parcial hace FÍSICAMENTE IMPOSIBLE guardar dos ganadores
-- en la misma fecha. No importa lo que haga la aplicación, un cron, una
-- migración, o un empleado desde la consola de Supabase: Postgres rechaza el
-- segundo. Todo lo demás en este diseño es coordinación; esto es la garantía.
-- =============================================================================
create unique index spins_one_winner_per_day
  on app.spins (gaming_date) where is_winner;

create index spins_day_idx    on app.spins (gaming_date, created_at);
create index spins_device_idx on app.spins (device_id, created_at desc) where device_id is not null;
create index spins_ip_idx     on app.spins (ip_inet, created_at desc);

-- -----------------------------------------------------------------------------
-- El premio del día — punto de serialización
--
-- Una fila por día con un instante secreto escogido al azar. La primera tirada
-- elegible en o después de ese instante se lleva el premio.
-- -----------------------------------------------------------------------------
create table app.daily_winner_slots (
  gaming_date       date primary key,
  winning_moment_at timestamptz not null,
  prize_cents       integer not null default 2500,
  winning_spin_id   uuid unique references app.spins(id),
  claimed_at        timestamptz,
  -- Compromiso publicable al inicio del día; se revela al cerrar para que
  -- cualquiera pueda comprobar que el instante se fijó ANTES de que empezara
  -- el día. Convierte "esto está arreglado" en algo verificable.
  commitment_sha256 bytea,
  reveal_nonce      bytea,
  seeded_by         text not null default 'cron',  -- 'cron' | 'lazy_degraded'
  created_at        timestamptz not null default now(),

  constraint slot_claim_consistent check (
    (winning_spin_id is null) = (claimed_at is null)
  )
);

-- -----------------------------------------------------------------------------
-- Premios ganados — aquí vive la regla de 30 días
-- -----------------------------------------------------------------------------
create table app.wins (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references app.players(id),
  spin_id     uuid not null unique references app.spins(id),
  gaming_date date not null,
  won_at      timestamptz not null,
  cooldown    tstzrange not null,

  -- Un jugador no puede tener dos ventanas de 30 días superpuestas.
  -- Dos premios separados por exactamente 30 días sí se permiten (el límite
  -- superior es exclusivo); 29 días lo rechaza la BASE DE DATOS, no el código.
  --
  -- Nota: `cooldown` NO puede ser columna generada. `timestamptz + interval`
  -- es STABLE, no IMMUTABLE, y Postgres la rechaza en un GENERATED. La llena
  -- la función que inserta.
  constraint wins_no_repeat_within_30d
    exclude using gist (player_id with =, cooldown with &&)
);

create index wins_player_idx on app.wins (player_id, won_at desc);

-- -----------------------------------------------------------------------------
-- Personal y vouchers
-- -----------------------------------------------------------------------------
create table app.staff (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null,
  email        text not null unique,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create type app.voucher_status as enum ('issued','redeemed','expired','void');

create table app.vouchers (
  id           uuid primary key default gen_random_uuid(),
  win_id       uuid not null references app.wins(id),
  player_id    uuid not null references app.players(id),
  -- Código en claro, no hasheado, a propósito: el cliente que cerró la pestaña
  -- necesita volver a ver su cupón, y no se puede volver a mostrar lo que solo
  -- se guardó hasheado. El premio es $25, de un solo uso, y se canjea en
  -- persona con identificación — un código filtrado vale $25 una vez y obliga
  -- a alguien a caminar hasta el casino. Si algún día sube el premio, revisar.
  code         text not null,
  amount_cents integer not null default 2500,
  status       app.voucher_status not null default 'issued',
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  redeemed_at  timestamptz,
  redeemed_by  uuid references app.staff(id),
  void_reason  text,

  constraint vouchers_code_key unique (code),
  constraint vouchers_code_fmt check (code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  constraint vouchers_redeem_consistent check (
    (status = 'redeemed') = (redeemed_at is not null)
  ),
  constraint vouchers_redeem_actor check (
    redeemed_at is null or redeemed_by is not null
  )
);

-- Un voucher vivo por premio. Es índice parcial y no restricción de tabla
-- porque un `constraint ... unique (...) where ...` no existe en Postgres.
-- Permite reemitir un cupón perdido: se anula el viejo y se emite otro.
create unique index vouchers_one_live_per_win
  on app.vouchers (win_id) where status <> 'void';

create index vouchers_status_expires_idx on app.vouchers (status, expires_at);
create index vouchers_player_idx         on app.vouchers (player_id, issued_at desc);

-- Rastro de auditoría: solo se agrega, nunca se actualiza ni se borra.
create table app.voucher_events (
  id         bigserial primary key,
  voucher_id uuid not null references app.vouchers(id),
  event      text not null,   -- issued | redeem_ok | redeem_denied | voided
  detail     jsonb not null default '{}'::jsonb,
  actor_id   uuid references app.staff(id),
  at         timestamptz not null default now()
);
create index voucher_events_voucher_idx on app.voucher_events (voucher_id, at desc);

-- -----------------------------------------------------------------------------
-- Jackpots — alimentado por el Excel "Tabla Premios App"
-- -----------------------------------------------------------------------------
create table app.machines (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  bank_number smallint not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),

  -- El # de banco NO es único: en la hoja real el 12, 30, 37 y 38 aparecen dos
  -- veces porque hay varias máquinas por banco. La identidad es nombre+banco.
  constraint machines_identity unique (name, bank_number)
);

create index machines_active_idx on app.machines (active) where active;

create table app.jackpot_readings (
  machine_id   uuid not null references app.machines(id) on delete cascade,
  amount_cents bigint,      -- NULL = sin dato; no se publica (mejor que "$0.00")
  reading_at   timestamptz not null default now(),
  primary key (machine_id, reading_at)
);

create index jackpot_readings_recent_idx on app.jackpot_readings (reading_at desc);

-- Guardar cada lectura con su fecha, en vez de sobrescribir un monto único, es
-- lo que después permite el badge "CALIENTE", la flecha de "subió desde ayer"
-- y el histórico — sin trabajo extra para el personal.
create view app.current_jackpots as
select distinct on (m.id)
  m.id, m.name, m.bank_number, r.amount_cents, r.reading_at
from app.machines m
join app.jackpot_readings r on r.machine_id = m.id
where m.active and r.amount_cents is not null
order by m.id, r.reading_at desc;

-- -----------------------------------------------------------------------------
-- Contenido editable por el personal
-- -----------------------------------------------------------------------------
create table app.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text,
  image_path   text,
  starts_on    date,
  ends_on      date,
  published    boolean not null default true,
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now()
);

create table app.new_machines (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  image_path   text,
  arrived_on   date not null,
  bank_number  smallint,
  published    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table app.gallery_items (
  id          uuid primary key default gen_random_uuid(),
  image_path  text not null,
  caption     text,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Límite de tasa y señales de abuso
-- -----------------------------------------------------------------------------
create table app.rate_events (
  bucket       text not null,   -- 'register_ip' | 'spin_ip'
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (bucket, key, window_start)
);
create index rate_events_gc_idx on app.rate_events (window_start);

create table app.risk_events (
  id        bigserial primary key,
  player_id uuid references app.players(id),
  device_id uuid,
  ip_inet   inet,
  kind      text not null,
  score     smallint not null default 0,
  detail    jsonb not null default '{}'::jsonb,
  at        timestamptz not null default now()
);
create index risk_events_at_idx on app.risk_events (at desc);

-- Distribución de tráfico por hora, usada para ponderar el instante ganador.
-- Se arranca con una curva razonable para un casino de 8am a 12am y después se
-- recalcula con datos reales.
create table app.traffic_weights (
  hour_local smallint primary key check (hour_local between 0 and 23),
  weight     numeric  not null check (weight >= 0)
);

-- ####################  0002_functions.sql  ####################

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

-- ####################  0003_seed.sql  ####################

-- =============================================================================
-- Datos base
-- =============================================================================

-- Los 78 municipios de Puerto Rico, en orden alfabético.
insert into app.municipalities (id, name) values
  (1,'Adjuntas'),(2,'Aguada'),(3,'Aguadilla'),(4,'Aguas Buenas'),(5,'Aibonito'),
  (6,'Añasco'),(7,'Arecibo'),(8,'Arroyo'),(9,'Barceloneta'),(10,'Barranquitas'),
  (11,'Bayamón'),(12,'Cabo Rojo'),(13,'Caguas'),(14,'Camuy'),(15,'Canóvanas'),
  (16,'Carolina'),(17,'Cataño'),(18,'Cayey'),(19,'Ceiba'),(20,'Ciales'),
  (21,'Cidra'),(22,'Coamo'),(23,'Comerío'),(24,'Corozal'),(25,'Culebra'),
  (26,'Dorado'),(27,'Fajardo'),(28,'Florida'),(29,'Guánica'),(30,'Guayama'),
  (31,'Guayanilla'),(32,'Guaynabo'),(33,'Gurabo'),(34,'Hatillo'),(35,'Hormigueros'),
  (36,'Humacao'),(37,'Isabela'),(38,'Jayuya'),(39,'Juana Díaz'),(40,'Juncos'),
  (41,'Lajas'),(42,'Lares'),(43,'Las Marías'),(44,'Las Piedras'),(45,'Loíza'),
  (46,'Luquillo'),(47,'Manatí'),(48,'Maricao'),(49,'Maunabo'),(50,'Mayagüez'),
  (51,'Moca'),(52,'Morovis'),(53,'Naguabo'),(54,'Naranjito'),(55,'Orocovis'),
  (56,'Patillas'),(57,'Peñuelas'),(58,'Ponce'),(59,'Quebradillas'),(60,'Rincón'),
  (61,'Río Grande'),(62,'Sabana Grande'),(63,'Salinas'),(64,'San Germán'),(65,'San Juan'),
  (66,'San Lorenzo'),(67,'San Sebastián'),(68,'Santa Isabel'),(69,'Toa Alta'),(70,'Toa Baja'),
  (71,'Trujillo Alto'),(72,'Utuado'),(73,'Vega Alta'),(74,'Vega Baja'),(75,'Vieques'),
  (76,'Villalba'),(77,'Yabucoa'),(78,'Yauco')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Curva de tráfico por hora (hora de Puerto Rico)
--
-- Punto de partida razonable para un casino de 8:00 a.m. a 12:00 a.m., con el
-- pico entre las 6 y las 10 de la noche. Las horas cerradas van en 0 para que
-- el instante ganador nunca caiga cuando no hay nadie jugando.
--
-- Se recalcula con datos reales una vez haya un mes de tiradas:
--   update app.traffic_weights w set weight = s.n
--   from (select extract(hour from created_at at time zone 'America/Puerto_Rico')::smallint h,
--                count(*) n from app.spins group by 1) s
--   where w.hour_local = s.h;
-- -----------------------------------------------------------------------------
insert into app.traffic_weights (hour_local, weight) values
  (0, 0.3),
  (1, 0), (2, 0), (3, 0), (4, 0), (5, 0), (6, 0), (7, 0),
  (8, 0.5), (9, 0.7), (10, 1.0), (11, 1.3),
  (12, 1.6), (13, 1.7), (14, 1.8), (15, 2.0),
  (16, 2.2), (17, 2.5), (18, 3.0), (19, 3.4),
  (20, 3.6), (21, 3.3), (22, 2.6), (23, 1.6)
on conflict (hour_local) do update set weight = excluded.weight;

-- ####################  0004_rls.sql  ####################

-- =============================================================================
-- Seguridad — defensa en profundidad
--
-- La llave `anon` de Supabase viaja DENTRO del JavaScript que descarga
-- cualquier visitante; así está diseñada. Una tabla accesible por PostgREST sin
-- RLS es legible y escribible por cualquiera que abra la consola del navegador.
--
-- Si `app.daily_winner_slots` fuera legible desde ahí, un visitante podría leer
-- `winning_moment_at` y GANAR TODOS LOS DÍAS.
--
-- Dos medidas, no una:
--   1. El esquema `app` no se expone a la API pública (Settings → API →
--      Exposed schemas: dejar solo `public`). Eso es configuración del panel.
--   2. RLS activado SIN NINGUNA política en todas las tablas. Cero políticas =
--      solo `service_role` (que salta RLS) entra. Esto es lo que este archivo
--      hace, y sigue protegiendo aunque alguien exponga el esquema por error.
-- =============================================================================

alter table app.municipalities     enable row level security;
alter table app.players            enable row level security;
alter table app.spins              enable row level security;
alter table app.daily_winner_slots enable row level security;
alter table app.wins               enable row level security;
alter table app.staff              enable row level security;
alter table app.vouchers           enable row level security;
alter table app.voucher_events     enable row level security;
alter table app.machines           enable row level security;
alter table app.jackpot_readings   enable row level security;
alter table app.events             enable row level security;
alter table app.new_machines       enable row level security;
alter table app.gallery_items      enable row level security;
alter table app.rate_events        enable row level security;
alter table app.risk_events        enable row level security;
alter table app.traffic_weights    enable row level security;

-- Sin políticas a propósito. No añadir ninguna sin volver a leer el comentario
-- de arriba: una política permisiva en daily_winner_slots rompe la promoción.

-- Los roles `anon` y `authenticated` solo existen en Supabase. En un Postgres
-- local (pruebas, CI) no están, así que el revoke se hace condicional en vez de
-- reventar la migración.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema app from %I', r);
      execute format('revoke all on all tables    in schema app from %I', r);
      execute format('revoke all on all functions in schema app from %I', r);
      execute format('revoke all on all sequences in schema app from %I', r);
    end if;
  end loop;
end;
$$;

-- ####################  0005_menu.sql  ####################

-- =============================================================================
-- Menú del restaurante
--
-- Se guarda por platos y no como una foto del menú, aunque una foto sería más
-- rápido de montar: una imagen no la lee un lector de pantalla, no la indexa
-- Google, y no se puede corregir un precio sin volver a diseñarla. Con esto,
-- cambiar un precio es escribir un número en el panel.
-- =============================================================================

create table app.menu_sections (
  id         smallint primary key,
  name       text not null,
  sort_order smallint not null default 0
);

create table app.menu_items (
  id          uuid primary key default gen_random_uuid(),
  section_id  smallint not null references app.menu_sections(id),
  name        text not null,
  description text,
  price_cents integer,        -- NULL = "precio del día"
  available   boolean not null default true,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

create index menu_items_section_idx on app.menu_items (section_id, sort_order);

alter table app.menu_sections enable row level security;
alter table app.menu_items    enable row level security;

insert into app.menu_sections (id, name, sort_order) values
  (1, 'Entradas', 10),
  (2, 'Platos principales', 20),
  (3, 'Picadera', 30),
  (4, 'Bebidas', 40),
  (5, 'Postres', 50)
on conflict (id) do nothing;

-- ####################  0006_popup_promos.sql  ####################

-- =============================================================================
-- Promociones del pop-up de entrada
--
-- El visitante ve el arte de las promociones del día ANTES de poder usar la
-- tragamonedas. La promoción es el gancho para que venga al casino; la
-- tragamonedas es el gancho para que vea la promoción.
--
-- Se marca cuáles salen, en vez de sacar todas las publicadas: en la página de
-- Eventos caben diez promociones, pero un pop-up con diez pantallas seguidas
-- lo cierra cualquiera. Aquí se escogen las una o dos que de verdad importan
-- hoy.
-- =============================================================================

alter table app.events
  add column if not exists show_in_popup boolean not null default false;

-- Índice parcial: la consulta del pop-up corre en CADA visita a la portada, y
-- casi siempre hay una o dos filas marcadas entre todas las promociones.
create index if not exists events_popup_idx
  on app.events (sort_order, created_at)
  where show_in_popup and published;

-- ####################  0007_search_path.sql  ####################

-- =============================================================================
-- search_path fijo en todas las funciones
--
-- Sin `search_path` fijo, una función se resuelve contra el search_path de quien
-- la llama. Un rol con permiso para crear objetos podría plantar su propia
-- `now()` o `digest()` en un esquema que vaya primero y secuestrar lo que hace
-- la función — incluido el sorteo del premio.
--
-- `execute_spin` y `redeem_voucher` ya lo traen (van con SECURITY DEFINER, donde
-- es obligatorio). Estas cinco faltaban.
--
-- Se usa ALTER FUNCTION y no CREATE OR REPLACE a propósito: `gaming_date` y
-- `norm_name` se usan dentro de una columna generada y de varios índices, y
-- recrearlas obligaría a reconstruirlos.
-- =============================================================================

alter function app.gaming_date(timestamptz)                set search_path = app, public, pg_catalog;
alter function app.norm_name(text)                         set search_path = app, public, pg_catalog;
alter function app.rate_hit(text, text, interval, integer)  set search_path = app, public, pg_catalog;
alter function app.crypto_random()                         set search_path = app, public, pg_catalog;
alter function app.seed_slot(date, text, smallint)         set search_path = app, public, pg_catalog;
