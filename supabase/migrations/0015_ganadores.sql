-- =============================================================================
-- El muro de ganadores
--
-- POR QUÉ
-- -------
-- De todo lo que hacen los casinos pequeños de Estados Unidos, esto es lo
-- segundo más universal después del calendario de promociones: una página con
-- las fotos de quien se llevó un premio, con su nombre, su pueblo, la máquina y
-- la fecha. Lo tienen Big M, Two Kings, Prairie Knights, Red Wind y Valley
-- View, salones del tamaño de este.
--
-- Es la pieza de contenido más barata que existe —una foto y un pie— y la más
-- convincente para un casino de pueblo: la prueba de que aquí se paga no la da
-- una cifra, la da un vecino con un cheque en la mano.
--
-- POR QUÉ NO SE SACA SOLO DE `app.vouchers`
-- -----------------------------------------
-- Los ganadores del sorteo de $25 ya están en la base, pero los premios que de
-- verdad importan —un progresivo del salón— no pasan por la web y no hay forma
-- de deducirlos. Así que esta tabla acepta las dos cosas: `voucher_id` apunta al
-- cupón cuando el premio salió del sorteo, y es NULL cuando lo escribió el
-- personal.
--
-- EL CONSENTIMIENTO ES `not null` A PROPÓSITO
-- -------------------------------------------
-- Publicar la foto y el nombre de una persona no puede depender de que alguien
-- se acuerde de marcar una casilla. Que lo exija la base de datos significa que
-- una fila sin permiso NO SE PUEDE GUARDAR, y eso es más barato que confiar en
-- la memoria de quien está en el mostrador un sábado por la noche.
--
-- `publicado` es aparte: el permiso se pide una vez y la foto puede subirse
-- después, o retirarse sin borrar el registro.
-- =============================================================================

create table if not exists app.ganadores (
  id             uuid primary key default gen_random_uuid(),

  -- Cómo se publica, que no tiene por qué ser el nombre legal completo. En un
  -- pueblo, "María R." puede ser todo lo que la persona quiera que salga.
  nombre         text not null check (length(btrim(nombre)) between 2 and 80),
  pueblo         text,
  maquina        text,
  monto_cents    bigint check (monto_cents is null or monto_cents >= 0),
  gano_on        date not null,
  image_path     text,

  -- Si vino del sorteo de $25. Se pone a null si el cupón se borra: el registro
  -- del muro sigue siendo válido aunque el cupón desaparezca.
  voucher_id     uuid references app.vouchers(id) on delete set null,

  -- SIN ESTO NO SE PUBLICA. Ver la nota de arriba.
  consentimiento_at timestamptz not null,
  -- Quién recogió el permiso y cómo, por si alguien lo reclama después.
  consentimiento_nota text,

  publicado      boolean not null default false,
  orden          smallint not null default 0,
  creado_en      timestamptz not null default now(),

  -- Tope de cordura, igual que en monthly_payouts: un dedo de más convierte
  -- $1,200 en $120,000 y el casino publica un premio que no pagó.
  constraint ganadores_monto_cuerdo check (monto_cents is null or monto_cents <= 100000000),
  -- No se puede anunciar un premio de mañana.
  constraint ganadores_fecha_cuerda check (
    gano_on <= (now() at time zone 'America/Puerto_Rico')::date + 1
  )
);

comment on table app.ganadores is
  'Muro de ganadores. Acepta los del sorteo de $25 (voucher_id) y los jackpots del salon (escritos a mano). consentimiento_at es not null: sin permiso no se guarda.';

create index if not exists ganadores_muro_idx
  on app.ganadores (publicado, gano_on desc, orden);

alter table app.ganadores enable row level security;
