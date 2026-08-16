-- =============================================================================
-- Datos de demostración — SOLO PARA DESARROLLO Y PRUEBAS
--
-- Usa las máquinas y números de banco reales de la hoja "Tabla Premios App"
-- para que la vista previa se parezca al sitio de verdad. Los montos son
-- inventados excepto Lion Link, que es el que aparecía en el sitio en vivo.
--
--   psql -d cam -f scripts/seed-demo.sql
-- =============================================================================

begin;

-- Máquinas tal como vienen en la hoja. Ojo: el banco 12, 30, 37 y 38 aparecen
-- dos veces — hay varias máquinas por banco, y por eso la identidad es
-- (nombre, banco) y no el banco solo.
insert into app.machines (name, bank_number) values
  ('Lion Link', 9),
  ('Pan Chang', 11),
  ('Panda Power', 12),
  ('Cash Express', 12),
  ('All Aboard', 10),
  ('Tresure Ball', 17),
  ('Jin Dan', 22),
  ('Money Link 2', 24),
  ('Quick Hit II', 26),
  ('Spooky Link', 30),
  ('Bao Zhu Zhao Fu', 30),
  ('Money In The Bank', 31),
  ('Oriental Gongs', 38),
  ('Five Fortune', 37),
  ('Triples Toves', 37),
  ('Grand Fortune', 38),
  ('Star Watch Fire', 51),
  ('Lightning Link', 45)
on conflict (name, bank_number) do nothing;

-- Historial de 90 días con forma de DIENTE DE SIERRA, que es como se comporta
-- de verdad un jackpot progresivo: sube todos los días hasta que alguien lo
-- pega, y ahí vuelve a su base.
--
-- Importa que los datos de prueba tengan esta forma. Con una subida lineal,
-- toda máquina está siempre en su máximo y el badge CALIENTE se enciende en
-- las 19 a la vez — lo que hace parecer correcto un tablero que no dice nada.
insert into app.jackpot_readings (machine_id, amount_cents, reading_at)
select m.id,
       (base + ((d + desfase) % ciclo) * incremento)::bigint,
       now() - make_interval(days => 90 - d)
  from (
    select id, name,
           40000 + (abs(hashtext(name)) % 60000)          as base,
           3000  + (abs(hashtext(name || 'inc')) % 22000) as incremento,
           8     + (abs(hashtext(name || 'cic')) % 16)    as ciclo,
           abs(hashtext(name || 'des')) % 16              as desfase
      from app.machines
  ) m
 cross join generate_series(0, 89) d
on conflict do nothing;

-- Lectura de hoy: sigue la misma curva, para que la tendencia sea coherente
-- con el historial. Lion Link se fija al monto que se veía en el sitio en vivo.
insert into app.jackpot_readings (machine_id, amount_cents, reading_at)
select m.id,
       case when m.name = 'Lion Link' then 1220401
            else (base + ((90 + desfase) % ciclo) * incremento)::bigint end,
       now()
  from (
    select id, name,
           40000 + (abs(hashtext(name)) % 60000)          as base,
           3000  + (abs(hashtext(name || 'inc')) % 22000) as incremento,
           8     + (abs(hashtext(name || 'cic')) % 16)    as ciclo,
           abs(hashtext(name || 'des')) % 16              as desfase
      from app.machines
  ) m
on conflict do nothing;

-- Una máquina sin monto: comprueba que NO se publica en vez de salir "$0.00".
insert into app.machines (name, bank_number) values ('Buffalo Gold', 55)
on conflict (name, bank_number) do nothing;

insert into app.new_machines (name, description, arrived_on, bank_number) values
  ('Huff N'' Even More Puff', 'La secuela del favorito de la casa, con tres niveles de bonos.', current_date - 4, 45),
  ('Dragon Cash Panda', 'Jackpot progresivo enlazado en todo el banco.', current_date - 11, 22),
  ('Ultimate Fire Link', 'Cuatro versiones distintas, una al lado de la otra.', current_date - 26, 30)
on conflict do nothing;

insert into app.events (title, body, starts_on, ends_on, sort_order) values
  ('Sorteo de Cumpleaños del Mes',
   E'¿Cumples años este mes? Participa por premios en efectivo.\nRegístrate en Servicio al Cliente con tu identificación.',
   current_date - 6, current_date + 18, 10),
  ('Entérate Primero',
   'Síguenos en redes y sé el primero en saber de nuestras promociones.',
   current_date - 2, null, 20),
  ('Noche de Tragamonedas Calientes',
   'Multiplicadores en máquinas seleccionadas, de 7:00 p.m. a 11:00 p.m.',
   current_date + 5, current_date + 5, 30)
on conflict do nothing;

insert into app.menu_items (section_id, name, description, price_cents, sort_order) values
  (1, 'Alcapurrias', 'Cuatro unidades, rellenas de carne.', 700, 10),
  (1, 'Sorullitos de maíz', 'Con salsa de queso de la casa.', 650, 20),
  (2, 'Churrasco a la parrilla', 'Con tostones y ensalada.', 2400, 10),
  (2, 'Mofongo con camarones', 'Mofongo de plátano relleno, en salsa criolla.', 2100, 20),
  (2, 'Pechuga a la plancha', 'Con arroz blanco y habichuelas.', 1600, 30),
  (3, 'Picadera para compartir', 'Surtido de frituras para dos personas.', 1800, 10),
  (4, 'Cerveza local', null, 500, 10),
  (4, 'Refrescos', null, 300, 20),
  (4, 'Café puertorriqueño', null, 250, 30),
  (5, 'Flan de queso', null, 600, 10),
  (5, 'Tembleque', 'Postre de coco tradicional.', 550, 20)
on conflict do nothing;

commit;

select 'máquinas'      as tabla, count(*) from app.machines
union all select 'lecturas',      count(*) from app.jackpot_readings
union all select 'máq. nuevas',   count(*) from app.new_machines
union all select 'eventos',       count(*) from app.events
union all select 'menú',          count(*) from app.menu_items;
