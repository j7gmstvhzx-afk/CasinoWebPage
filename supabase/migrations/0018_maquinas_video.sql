-- Video de YouTube en las máquinas nuevas.
--
-- La pestaña de Máquinas Nuevas enseña una foto fija de cada máquina. Una foto
-- de un gabinete de tragamonedas dice poco: todos se parecen. Lo que vende una
-- máquina es la función de bonos moviéndose, y ese video normalmente ya existe
-- —lo publica el fabricante— así que no hay que grabar nada, solo enlazarlo.
--
-- SE GUARDA EL IDENTIFICADOR, NO EL ENLACE.
--
-- Once caracteres, los que YouTube usa para nombrar un video. El personal pega
-- el enlace que le dé la gana (youtu.be, /shorts/, con ?si= detrás) y el panel
-- saca el identificador antes de guardar; ver src/lib/youtube.ts.
--
-- La restricción de abajo es la que hace que eso sea una garantía y no una
-- costumbre: si un día alguien escribe directamente en la tabla, o una ruta
-- nueva se salta la validación, la base lo rechaza. Lo que acaba dentro del
-- `src` de un iframe no puede ser una cadena arbitraria.
alter table app.new_machines
  add column if not exists video_id text;

comment on column app.new_machines.video_id is
  'Identificador de YouTube (11 caracteres), no el enlace completo. La página '
  'arma la dirección del reproductor; ver src/lib/youtube.ts.';

do $$
begin
  alter table app.new_machines
    add constraint new_machines_video_id_valido
    check (video_id is null or video_id ~ '^[A-Za-z0-9_-]{11}$');
exception
  when duplicate_object then null;
end $$;
