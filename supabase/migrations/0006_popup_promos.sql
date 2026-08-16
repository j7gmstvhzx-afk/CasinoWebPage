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
