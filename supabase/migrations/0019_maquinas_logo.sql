-- El logo del juego en las máquinas de jackpot.
--
-- El tablero de premios enseña dieciocho filas de texto: nombre, banco y monto.
-- Funciona, pero al cliente que entra buscando SU máquina le toca leer nombre
-- por nombre. Y el nombre de una tragamonedas no es lo que la gente recuerda —
-- recuerdan el arte: los cerditos dorados, los cohetes, el dragón. El logo del
-- juego convierte una lista en algo que se reconoce de un vistazo.
--
-- Es la misma columna, con el mismo nombre, que ya usan `events`,
-- `new_machines`, `gallery_items` y `menu_items`: la ruta dentro del bucket
-- público de Supabase Storage. No se guarda la URL completa a propósito, para
-- que cambiar de bucket o de dominio no obligue a reescribir filas.
alter table app.machines
  add column if not exists image_path text;

comment on column app.machines.image_path is
  'Ruta del logo del juego dentro del bucket de medios. La sube el personal '
  'desde /admin/jackpots; se encoge sola en el navegador antes de viajar '
  '(ver src/lib/encoger-imagen.ts).';
