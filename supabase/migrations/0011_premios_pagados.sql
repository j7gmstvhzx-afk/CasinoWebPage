-- =============================================================================
-- Premios pagados por mes
--
-- Lo escribe el personal desde el panel, igual que los montos de los jackpots.
--
-- POR QUÉ NO SE DEDUCE DE LAS LECTURAS
-- ------------------------------------
-- Se puede: cuando un progresivo cae en picado, alguien lo pegó. Sobre los
-- datos de prueba salían 35 caídas este mes. Pero una caída también es un error
-- de tecleo corregido al día siguiente, una máquina reiniciada por
-- mantenimiento, o una que salió del salón — y esta cifra es una declaración
-- PÚBLICA de cuánto dinero paga el casino. Una cifra de pagos que no cuadra con
-- la caja no es un detalle de interfaz.
--
-- Así que la escribe quien la sabe. Es además la más impresionante: los pagos
-- reales del salón son mucho mayores que nada que se pueda deducir de aquí.
--
-- UNA FILA POR MES
-- ----------------
-- No un solo valor que se sobrescribe. Con el histórico, la página puede
-- enseñar SIEMPRE el último mes que tenga datos, con el nombre de ese mes: si
-- todavía no se ha escrito el de este mes, se lee "En agosto pagamos…" en vez
-- de una cifra vieja haciéndose pasar por la de hoy.
--
-- `mes` guarda el día 1 del mes, que es la forma normal de indexar un periodo
-- mensual en Postgres sin inventar un tipo nuevo.
-- =============================================================================

create table if not exists app.monthly_payouts (
  mes          date primary key,
  total_cents  bigint not null,
  premios      integer not null,
  nota         text,
  updated_at   timestamptz not null default now(),
  constraint monthly_payouts_dia_uno  check (extract(day from mes) = 1),
  constraint monthly_payouts_positivo check (total_cents >= 0 and premios >= 0),
  -- Tope de cordura: un dedo de más al teclear convierte $18,430 en $1,843,000
  -- y el casino publica que paga casi dos millones al mes. El tope no impide
  -- ninguna cifra real de un salón de este tamaño.
  constraint monthly_payouts_tope     check (total_cents <= 100000000 and premios <= 10000)
);

alter table app.monthly_payouts enable row level security;

comment on table app.monthly_payouts is
  'Premios pagados por mes. Lo escribe el personal desde el panel: es una declaración pública de dinero pagado y no se deduce de las lecturas.';
