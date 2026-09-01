-- =============================================================================
-- El limitador de intentos redondea al lado ESTRICTO, no al permisivo
--
-- POR QUÉ ESTO ES UNA MIGRACIÓN NUEVA Y NO UNA EDICIÓN DE 0009
-- ------------------------------------------------------------
-- El arreglo se escribió primero editando `0009_rate_hit_deslizante.sql` en su
-- sitio. Eso no llega nunca a producción: los ejecutores de migraciones llevan
-- la cuenta de los archivos YA APLICADOS y se los saltan por nombre, así que
-- una base que ya corrió 0009 no vuelve a mirarlo por mucho que cambie su
-- contenido. El arreglo se quedaba en el repositorio, con la base real
-- corriendo todavía la versión permisiva, y el diff daba a entender lo
-- contrario. Una migración aplicada es historia: se corrige con otra detrás.
--
-- QUÉ SE CORRIGE
-- --------------
-- El contador va por cubos de un minuto, y un cubo deja de contarse
-- exactamente en `window_start + ventana`. Pero los intentos no ocurren al
-- principio del cubo: ocurren en `window_start + s`, con s de 0 a 59. O sea que
-- un intento vive `ventana - s` y no `ventana`, y el error cae del lado
-- PERMISIVO — el lado equivocado para algo que protege una contraseña.
--
-- Medido: poniendo la ráfaga al final del cubo, la ventana efectiva se quedaba
-- en 59.02 minutos y se colaban 8 intentos de más sobre un límite de 8 POR
-- HORA. O sea el doble.
--
-- Mirando un cubo MÁS ATRÁS (`- v_gran`), la ventana efectiva queda entre 60 y
-- 61 minutos: el error se va al lado estricto. Para un limitador que defiende
-- una contraseña, contar de más durante un minuto no le hace daño a nadie;
-- contar de menos, sí.
--
-- Es `create or replace`, así que se puede correr sobre una base que ya tenga
-- la función y sobre una recién creada.
-- =============================================================================

create or replace function app.rate_hit(
  p_bucket text,
  p_key    text,
  p_window interval,
  p_limit  integer
) returns boolean               -- true = permitido
language plpgsql
as $$
declare
  v_secs  numeric     := extract(epoch from p_window);
  v_gran  numeric     := greatest(1, floor(v_secs / 60));  -- 60 cubos por ventana
  v_epoch numeric     := extract(epoch from now());
  v_start timestamptz := to_timestamp(floor(v_epoch / v_gran) * v_gran);
  -- `- v_gran`: un cubo más atrás, para que el redondeo sobre-cuente en vez de
  -- sub-contar. Ver la explicación de arriba.
  v_desde timestamptz := to_timestamp(v_epoch - v_secs - v_gran);
  v_total bigint;
begin
  insert into app.rate_events (bucket, key, window_start, count)
  values (p_bucket, p_key, v_start, 1)
  on conflict (bucket, key, window_start)
    do update set count = app.rate_events.count + 1;

  -- Se suma DESPUÉS de insertar, así que el intento en curso ya está contado:
  -- con límite 8, el octavo pasa y el noveno no.
  select coalesce(sum(count), 0) into v_total
    from app.rate_events
   where bucket = p_bucket
     and key    = p_key
     and window_start > v_desde;

  return v_total <= p_limit;
end;
$$;

-- -----------------------------------------------------------------------------
-- Consistencia de permisos
--
-- 0002 revocaba de `public` execute_spin, redeem_voucher y seed_slot, y dejaba
-- fuera a las auxiliares. Hoy no es explotable — 0004 le quita a `anon` y
-- `authenticated` el USAGE sobre el esquema `app`, así que no hay por dónde
-- llamarlas — pero una lista incompleta invita a leer lo que no aparece como
-- "esto es inofensivo", y `rate_hit` no lo es: quien pueda invocarla puede
-- inflar el contador de otra IP y dejar fuera a un cliente legítimo.
-- -----------------------------------------------------------------------------
revoke all on function app.rate_hit(text, text, interval, integer) from public;
revoke all on function app.crypto_random() from public;

-- -----------------------------------------------------------------------------
-- Recolección de basura de rate_events
--
-- 0001 creó `rate_events_gc_idx` sobre window_start — un índice hecho a medida
-- para una limpieza que nunca se escribió. Sin ella la tabla crece para
-- siempre, y con cubos de un minuto crece sesenta veces más rápido que antes,
-- así que ahora la limpieza no es opcional.
--
-- Se expone como función y la llama el cron diario que ya existe, en vez de
-- borrar dentro de rate_hit: meter un DELETE en el camino de cada petición
-- pone a competir por candados justo a las peticiones que llegan en ráfaga,
-- que son exactamente las que el limitador tiene que atender rápido.
--
-- Dos horas de gracia sobre la ventana más larga en uso (una hora), para que
-- una limpieza nunca borre un cubo que todavía cuenta.
-- -----------------------------------------------------------------------------
create or replace function app.rate_events_gc(p_keep interval default interval '2 hours')
returns integer
language plpgsql
as $$
declare
  v_borradas integer;
begin
  delete from app.rate_events where window_start < now() - p_keep;
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

revoke all on function app.rate_events_gc(interval) from public;
