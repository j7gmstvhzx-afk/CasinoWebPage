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
