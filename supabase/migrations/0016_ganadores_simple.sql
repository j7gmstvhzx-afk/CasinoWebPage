-- =============================================================================
-- El muro de ganadores se queda en dos datos: PUEBLO y CANTIDAD
--
-- QUÉ CAMBIA
-- ----------
-- Fuera el nombre, la foto, la máquina y todo el aparato del consentimiento.
-- Una fila del muro pasa a ser: "Manatí — $1,200".
--
-- POR QUÉ ESTO ES MEJOR, Y NO SOLO MÁS SENCILLO
-- ---------------------------------------------
-- La versión anterior publicaba el nombre y la cara de una persona real, y por
-- eso llevaba tres capas de protección: `consentimiento_at not null` en la base,
-- `z.literal(true)` en la API y un recuadro aparte en el panel. Todo eso existía
-- para un solo problema — pedir permiso — y el problema desaparece cuando no se
-- publica ningún dato personal.
--
-- Un pueblo y una cantidad no identifican a nadie. Ya no hay permiso que
-- recoger, ni que guardar, ni que poder demostrar después si alguien reclama; y
-- el mostrador deja de tener que preguntar nada un sábado por la noche. La
-- prueba social se mantiene casi entera: "Vega Baja — $2,400" sigue diciendo
-- que aquí se paga y que le tocó a alguien de al lado.
--
-- SE BORRAN LAS COLUMNAS EN VEZ DE DEJARLAS NULABLES
-- --------------------------------------------------
-- Una columna `nombre` que ya nadie escribe pero sigue ahí es una invitación a
-- que dentro de seis meses alguien la rellene desde Supabase sin pasar por
-- ningún permiso. Si el dato no se debe guardar, el sitio donde guardarlo no
-- debe existir.
--
-- `if exists` en todo: 0015 puede no haberse llegado a aplicar en producción
-- (quedó pendiente de aprobación), así que esta migración tiene que funcionar
-- tanto sobre la tabla completa como sobre una recién creada.
-- =============================================================================

-- Por si 0015 nunca corrió: la tabla, ya en su forma simple.
create table if not exists app.ganadores (
  id          uuid primary key default gen_random_uuid(),
  pueblo      text not null,
  monto_cents bigint not null,
  gano_on     date not null,
  publicado   boolean not null default true,
  orden       smallint not null default 0,
  creado_en   timestamptz not null default now()
);

-- Y si 0015 sí corrió, se le quita lo que sobra.
alter table app.ganadores
  drop column if exists nombre,
  drop column if exists maquina,
  drop column if exists image_path,
  drop column if exists voucher_id,
  drop column if exists consentimiento_at,
  drop column if exists consentimiento_nota;

-- El pueblo y el monto pasan a ser obligatorios: son LO ÚNICO que queda, y una
-- fila sin uno de los dos no dice nada.
update app.ganadores set pueblo = 'Manatí' where pueblo is null;
update app.ganadores set monto_cents = 0    where monto_cents is null;

alter table app.ganadores
  alter column pueblo      set not null,
  alter column monto_cents set not null,
  alter column publicado   set default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ganadores_pueblo_cuerdo') then
    alter table app.ganadores
      add constraint ganadores_pueblo_cuerdo check (length(btrim(pueblo)) between 2 and 60);
  end if;
  -- Los dos topes de cordura de 0015 se mantienen, por si esta tabla se creó
  -- aquí y no allí: un dedo de más convierte $1,200 en $120,000, y no se puede
  -- anunciar un premio de mañana.
  if not exists (select 1 from pg_constraint where conname = 'ganadores_monto_cuerdo') then
    alter table app.ganadores
      add constraint ganadores_monto_cuerdo check (monto_cents >= 0 and monto_cents <= 100000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ganadores_fecha_cuerda') then
    alter table app.ganadores
      add constraint ganadores_fecha_cuerda
      check (gano_on <= (now() at time zone 'America/Puerto_Rico')::date + 1);
  end if;
end $$;

create index if not exists ganadores_muro_idx
  on app.ganadores (publicado, gano_on desc, orden);

comment on table app.ganadores is
  'Muro de ganadores: pueblo y cantidad, nada mas. Sin nombre ni foto no hay dato personal, y por eso no hace falta consentimiento.';

alter table app.ganadores enable row level security;
