-- =============================================================================
-- El limitador de intentos pasa de ventana fija a ventana móvil
--
-- EL PROBLEMA
-- -----------
-- La versión anterior contaba dentro de un cubo alineado al reloj:
--
--     window_start = floor(epoch / ventana) * ventana
--
-- El contador se reiniciaba de golpe al cambiar la hora, así que quien agotara
-- el límite al final de una ventana volvía a tenerlo entero un segundo después.
-- En el borde caben DOS límites seguidos:
--
--     contraseña de admin   8  ->  8 + 8 = 16 intentos en dos minutos
--     registro             12  ->  24
--     entrar               20  ->  40
--
-- Un límite que se duplica eligiendo la hora no es el límite que dice la
-- constante, y lo peor es que parece que sí.
--
-- LA SOLUCIÓN: CUBOS FINOS SUMADOS HACIA ATRÁS
-- --------------------------------------------
-- Se sigue contando en cubos, pero de un sesentavo de la ventana en vez de la
-- ventana entera, y la decisión suma TODOS los cubos que caen dentro del
-- intervalo que mira hacia atrás desde ahora. Para una ventana de una hora eso
-- son cubos de un minuto: el contador ya no se reinicia nunca de golpe, solo
-- expira el cubo más viejo cada minuto.
--
-- Queda un resto de imprecisión de un cubo — un intento puede sobrevivir hasta
-- 59 segundos de más — y es deliberado: acotar la ráfaga de una hora a un
-- minuto es lo que había que resolver, y bajar más el tamaño del cubo solo
-- multiplica filas.
--
-- POR QUÉ NO EL CONTADOR PONDERADO
-- --------------------------------
-- La receta habitual para esto es ponderar la ventana anterior por la fracción
-- que aún cae dentro:  estimado = actual + anterior * (1 - transcurrido/ventana).
-- Se escribió primero así y HAY QUE NO VOLVER A ESCRIBIRLA: esa fórmula asume
-- que los intentos anteriores están repartidos por igual dentro de su ventana,
-- y un ataque los amontona justo al final, que es el caso entero. Medido: con
-- 8 gastados y a solo 9 minutos de la hora, el peso ya bajaba a 0.844 y el
-- estimado daba 7.75 sobre un límite de 8 — permitía. Cierra el borde exacto y
-- se va abriendo el resto de la hora, que es la peor clase de arreglo: el que
-- pasa la prueba si se corre a la hora oportuna.
--
-- POR QUÉ NO UNA FILA POR INTENTO
-- -------------------------------
-- Daría la cuenta exacta, pero obliga a cambiar la clave primaria de
-- `app.rate_events` — migración de esquema sobre una tabla en uso — y pierde
-- el incremento atómico: contar filas con `select count(*)` bajo READ
-- COMMITTED no ve las inserciones de transacciones que aún no confirmaron, así
-- que varias peticiones a la vez se cuelan. El `on conflict do update` de aquí
-- serializa cada cubo por el candado de su fila.
--
-- Esto de aquí no toca el esquema: misma tabla, misma clave primaria, mismos
-- tipos. Solo cambia la granularidad de `window_start` y la lectura.
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
  v_desde timestamptz := to_timestamp(v_epoch - v_secs);
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
