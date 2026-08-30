-- =============================================================================
-- La pestaña Menú deja de fingir que hay un restaurante
--
-- LO QUE PASA DE VERDAD EN EL SALÓN
-- ---------------------------------
-- El casino NO tiene restaurante con carta. Lo que tiene, y que hasta ahora no
-- aparecía en ninguna parte del sitio, es mejor noticia: la comida y la bebida
-- son DE CORTESÍA mientras juegas — café, chocolate, desayuno (sándwich,
-- tortilla), cervezas y tragos. Y los fines de semana hay un menú especial que
-- se compra fuera.
--
-- Mientras tanto la pestaña estaba montada como la carta de un restaurante —
-- "Entradas", "Platos principales", "Postres", con precios— y en producción
-- tiene CERO platos, así que lo único que enseña es "Estamos actualizando el
-- menú". Un casino que regala el desayuno le está diciendo a la gente que no
-- tiene cocina.
--
-- Los casinos pequeños de Estados Unidos anuncian tragos a $5 y el plato del
-- día como su gancho principal para llenar el salón entre semana. Aquí es
-- gratis y no se decía.
--
-- QUÉ CAMBIA
-- ----------
-- 1. Las secciones saben si son de cortesía, y llevan una nota con su horario.
-- 2. Los platos pueden tener foto. La tabla no tenía columna de imagen, y
--    `/api/admin/contenido` marcaba `menu: false` en CON_IMAGEN. Un menú de fin
--    de semana sin fotos no vende nada.
-- 3. Las secciones por defecto pasan a ser las de este salón. Se RENOMBRAN las
--    que ya existen en vez de borrarlas: `menu_items.section_id` apunta a
--    ellas, y borrar una sección con platos dentro rompería la referencia. En
--    producción no hay ni un plato, pero la migración tiene que ser segura
--    también donde sí los haya.
-- =============================================================================

alter table app.menu_sections
  add column if not exists cortesia boolean not null default false,
  add column if not exists nota     text;

comment on column app.menu_sections.cortesia is
  'true = va por cuenta de la casa. La página lo pinta como "gratis" y no enseña precio.';
comment on column app.menu_sections.nota is
  'Horario o condición de la sección: "Mientras juegas, hasta las 11:00 a.m."';

alter table app.menu_items
  add column if not exists image_path text;

comment on column app.menu_items.image_path is
  'Foto del plato en el bucket `medios`. Sobre todo para el menú del fin de semana.';

-- -----------------------------------------------------------------------------
-- Las secciones de este salón
--
-- Se actualizan por NOMBRE y no por id: si alguien ya las renombró, esto no le
-- pisa el trabajo — simplemente no encuentra la fila y no hace nada.
-- -----------------------------------------------------------------------------
update app.menu_sections
   set name = 'Desayuno de cortesía', cortesia = true, sort_order = 1,
       nota = 'Mientras juegas, por la mañana'
 where name = 'Entradas';

update app.menu_sections
   set name = 'Barra de cortesía', cortesia = true, sort_order = 2,
       nota = 'Cervezas y tragos mientras juegas'
 where name = 'Bebidas';

update app.menu_sections
   set name = 'Menú especial del fin de semana', cortesia = false, sort_order = 3,
       nota = 'Viernes a domingo'
 where name = 'Platos principales';

update app.menu_sections set sort_order = 4 where name = 'Picadera';
update app.menu_sections set sort_order = 5 where name = 'Postres';

-- Por si la instalación es nueva y no existían.
insert into app.menu_sections (id, name, sort_order, cortesia, nota) values
  (1, 'Desayuno de cortesía',           1, true,  'Mientras juegas, por la mañana'),
  (2, 'Barra de cortesía',              2, true,  'Cervezas y tragos mientras juegas'),
  (3, 'Menú especial del fin de semana', 3, false, 'Viernes a domingo')
on conflict (id) do nothing;
