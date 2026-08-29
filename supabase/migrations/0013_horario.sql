-- =============================================================================
-- El horario y la programación del salón, editables
--
-- EL PROBLEMA
-- -----------
-- El horario vivía escrito a mano en `src/lib/site.ts`:
--
--     hours: 'Lunes a domingo, 8:00 a.m. – 12:00 a.m.'
--
-- Una cadena. Para cambiarla hay que tocar código y volver a desplegar, así que
-- el dueño no la puede cambiar. Y como es una cadena y no una hora, la página
-- tampoco puede contestar la única pregunta que de verdad le hace quien la
-- abre: ¿están abiertos AHORA?
--
-- Peor: el archivo lleva un comentario que dice que ese horario, el teléfono y
-- la dirección salieron de directorios públicos, no del casino. O sea que
-- además de no ser editable, puede no ser cierto.
--
-- DOS TABLAS PARA EL HORARIO, Y NO UNA
-- ------------------------------------
-- `horario` es la regla: siete filas, una por día de la semana. No se crean ni
-- se borran nunca, solo se editan — en el panel se ve como el cartel que hay
-- pegado en la puerta, que es exactamente lo que tiene que parecer para quien
-- lo mantiene y no es programador.
--
-- `horario_excepcion` es la excepción: una fila, una fecha. Día de Reyes,
-- cierre por mantenimiento, la noche que se cierra más tarde. Se sobrepone al
-- día de la semana sin ambigüedad, porque la clave es la fecha exacta.
--
-- No se usó un modelo genérico de calendario (tipo RRULE) a propósito: cubre
-- casos que este casino no tiene y convierte el panel en algo que hay que
-- aprender a usar.
--
-- EL CIERRE DESPUÉS DE MEDIANOCHE
-- -------------------------------
-- Un casino que abre a las 8:00 a.m. y cierra a las 12:00 a.m. cierra al día
-- SIGUIENTE. Guardar eso sin más rompe cualquier comparación ingenua: a las
-- 11:30 p.m. la cuenta da "abierto" por casualidad, y a las 12:30 a.m. da
-- "cerrado" cuando el salón está lleno.
--
-- La regla, escrita una sola vez y aquí: SI `cierra` ES MENOR QUE `abre`, EL
-- CIERRE ES DEL DÍA SIGUIENTE. Es la franja entre medianoche y la hora de
-- cierre la que hay que probar, y es justo la que nadie prueba.
--
-- LA HORA DE PUERTO RICO
-- ----------------------
-- Todo se calcula con `at time zone 'America/Puerto_Rico'`, que es la misma
-- convención que usa `app.gaming_date()` desde la primera migración. El
-- servidor corre en UTC y a las 8 de la noche de Puerto Rico allí ya es mañana.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Horario semanal
-- -----------------------------------------------------------------------------
create table if not exists app.horario (
  -- 0 = domingo … 6 = sábado, igual que `extract(dow)` de Postgres, para no
  -- tener que traducir en cada consulta.
  dia     smallint primary key check (dia between 0 and 6),
  -- NULL = cerrado ese día de la semana.
  abre    time,
  cierra  time,
  nota    text,
  -- O están las dos horas, o no está ninguna. Media fila es un horario que no
  -- se puede pintar: "abre a las 8:00 y cierra a las …".
  constraint horario_par check ((abre is null) = (cierra is null))
);

comment on table app.horario is
  'Horario semanal del salón. Siete filas fijas que se editan, nunca se crean ni se borran. Si cierra < abre, el cierre es del día siguiente.';

-- Las siete filas nacen aquí para que el panel tenga siempre qué enseñar. Los
-- valores son los que estaban escritos a mano en site.ts, que EL DUEÑO TIENE
-- QUE CONFIRMAR: venían de un directorio público, no del casino.
insert into app.horario (dia, abre, cierra)
values (0, '08:00', '00:00'), (1, '08:00', '00:00'), (2, '08:00', '00:00'),
       (3, '08:00', '00:00'), (4, '08:00', '00:00'), (5, '08:00', '00:00'),
       (6, '08:00', '00:00')
on conflict (dia) do nothing;

-- -----------------------------------------------------------------------------
-- Excepciones por fecha
-- -----------------------------------------------------------------------------
create table if not exists app.horario_excepcion (
  fecha    date primary key,
  abre     time,
  cierra   time,
  cerrado  boolean not null default false,
  motivo   text,
  -- Si está cerrado no puede haber horas, y si no lo está tiene que haber las
  -- dos. Sin esto se guarda "cerrado, de 8:00 a 12:00" y no hay forma de saber
  -- qué quiso decir quien lo escribió.
  constraint excepcion_coherente check (
    (cerrado and abre is null and cierra is null)
    or (not cerrado and abre is not null and cierra is not null)
  )
);

comment on table app.horario_excepcion is
  'Días sueltos que no siguen el horario semanal: fiestas, cierres, horario extendido. Se sobrepone al día de la semana.';

-- Limpieza: una excepción de hace dos años no la mira nadie y ensucia el panel.
-- Se llama desde el cron diario que ya existe, igual que rate_events_gc.
create or replace function app.horario_excepciones_gc(p_keep interval default interval '90 days')
returns integer
language plpgsql
as $$
declare
  v_borradas integer;
begin
  delete from app.horario_excepcion
   where fecha < ((now() at time zone 'America/Puerto_Rico')::date - p_keep);
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

revoke all on function app.horario_excepciones_gc(interval) from public;

-- -----------------------------------------------------------------------------
-- La programación que se repite cada semana
--
-- Esto NO es `app.events`, y la diferencia importa: los eventos son fechas
-- sueltas ("torneo el 14 de septiembre") y esto es lo que pasa TODAS las
-- semanas a la misma hora — el café de cortesía por la mañana, el menú especial
-- del fin de semana, la música en vivo del sábado.
--
-- Meter eso en `events` obligaría a crear una fila por semana para siempre, y a
-- que alguien se acuerde de hacerlo. Es exactamente la clase de tarea que se
-- deja de hacer al tercer mes y deja la página anunciando cosas que ya pasaron.
--
-- `dias` es un array y no una máscara de bits: en el panel son siete casillas,
-- en SQL es `= any(dias)`, y leyendo la fila en Supabase se entiende sin
-- traducir nada. Una máscara sería más compacta y nadie sabría qué es un 42.
-- -----------------------------------------------------------------------------
create table if not exists app.programa (
  id        uuid primary key default gen_random_uuid(),
  titulo    text not null check (length(btrim(titulo)) between 2 and 80),
  detalle   text,
  dias      smallint[] not null,
  desde     time not null,
  hasta     time not null,
  -- Lo que se regala se pinta distinto. Es el gancho más barato que tiene este
  -- casino y hasta ahora no salía en ninguna parte del sitio.
  cortesia  boolean not null default false,
  icono     text,
  activo    boolean not null default true,
  orden     smallint not null default 0,
  creado_en timestamptz not null default now(),

  constraint programa_dias_validos check (
    array_length(dias, 1) between 1 and 7
    and dias <@ array[0,1,2,3,4,5,6]::smallint[]
  ),
  -- Un icono es un emoji, no una URL ni un fragmento de HTML: esto sale
  -- directo en la página.
  constraint programa_icono_corto check (icono is null or length(icono) <= 8)
);

comment on table app.programa is
  'Lo que se repite todas las semanas a la misma hora: cortesías, menú de fin de semana, música en vivo. Distinto de app.events, que son fechas sueltas.';

create index if not exists programa_activo_idx on app.programa (activo, orden);

-- -----------------------------------------------------------------------------
-- Todo bajo RLS y sin políticas, igual que el resto del esquema: aquí solo
-- entra `service_role`, y el navegador nunca habla con estas tablas.
-- -----------------------------------------------------------------------------
alter table app.horario           enable row level security;
alter table app.horario_excepcion enable row level security;
alter table app.programa          enable row level security;
