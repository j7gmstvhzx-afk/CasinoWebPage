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
