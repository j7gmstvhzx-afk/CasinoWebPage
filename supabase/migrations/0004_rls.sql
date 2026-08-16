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
