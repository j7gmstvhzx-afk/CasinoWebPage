-- La hora de la promoción, no solo el día.
--
-- `app.events` guarda `starts_on` y `ends_on` como FECHA SIN HORA, así que la
-- cartelera no puede decir lo único que la gente necesita saber para venir:
-- "el sábado a las 9:00 p.m.". Hoy el personal lo escribe dentro del texto
-- libre, donde nadie lo puede ordenar ni destacar, o no lo escribe.
--
-- POR QUÉ DOS COLUMNAS `time` Y NO UN `timestamptz`
-- -------------------------------------------------
-- Un `timestamptz` guarda un INSTANTE, y esto no es un instante: es "a las
-- nueve", la hora que sale en el flyer. Si se guardara como instante habría que
-- elegir un huso al escribirlo y volver a convertirlo al leerlo, y en un sitio
-- donde el servidor corre en UTC y el visitante puede estar en Nueva York, cada
-- conversión es una oportunidad de anunciar el evento cuatro horas antes. La
-- hora del salón es la hora del salón; se guarda tal cual y se enseña tal cual,
-- igual que ya hace `app.horario` desde la migración 0013.
--
-- LAS DOS SON NULABLES, Y ESO ES LA COMPATIBILIDAD
-- ------------------------------------------------
-- Una promoción de todo el día —"Cumpleaños del mes", que dura las dieciséis
-- horas que abre el salón— las deja vacías y se sigue viendo exactamente como
-- hoy. Nadie tiene que volver atrás a rellenar las cuatro que ya existen.
--
-- NO HAY RESTRICCIÓN DE QUE EL FIN SEA MAYOR QUE EL INICIO, A PROPÓSITO:
-- un evento de 9:00 p.m. a 1:00 a.m. cruza la medianoche, y es justo el horario
-- de la música en vivo. La misma regla que `app.horario`.
alter table app.events
  add column if not exists starts_at time,
  add column if not exists ends_at   time;

comment on column app.events.starts_at is
  'Hora de comienzo en hora de Puerto Rico, o null si es de todo el día. '
  'No es un instante: es la hora que sale en el flyer.';

comment on column app.events.ends_at is
  'Hora de fin en hora de Puerto Rico, o null. Puede ser MENOR que starts_at: '
  'eso significa que el evento cruza la medianoche.';
