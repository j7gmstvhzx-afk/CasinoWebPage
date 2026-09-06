-- El search_path que se perdió al reescribir tres funciones.
--
-- QUÉ PASÓ, Y POR QUÉ VUELVE A PASAR SOLO
-- ----------------------------------------
-- La migración 0007 le fijó `search_path` a todas las funciones de entonces,
-- `app.rate_hit` incluida. Después, 0009 y 0017 la reescribieron con
-- `create or replace function` para cambiarle la lógica del limitador — y ahí
-- está la trampa: `create or replace` NO conserva los ajustes puestos con
-- `alter function ... set`. Los borra sin decir nada. La función siguió
-- funcionando igual y su defensa se quedó por el camino.
--
-- `rate_events_gc` y `horario_excepciones_gc` nacieron después de 0007 y nunca
-- lo tuvieron.
--
-- POR QUÉ IMPORTA, Y EN ESTA MÁS QUE EN NINGUNA
-- ----------------------------------------------
-- Sin `search_path` fijo, una función resuelve los nombres que usa contra el
-- search_path de QUIEN LA LLAMA. Un rol que pudiera crear objetos podría
-- plantar su propia `now()` en un esquema que vaya primero y cambiar lo que la
-- función cree que está haciendo.
--
-- `app.rate_hit` es justo la que cuenta los intentos de contraseña: es lo único
-- que separa a alguien probando claves del panel del casino. Es la última
-- función de la base que uno querría dejar sin fijar.
--
-- Hoy el riesgo real es bajo —ningún rol ajeno tiene permiso para crear nada en
-- esta base, y `anon` ni siquiera ve el esquema `app`— pero es una defensa que
-- cuesta una línea y que el propio verificador de Supabase venía señalando.
--
-- SI MAÑANA SE VUELVE A REESCRIBIR ALGUNA DE ESTAS FUNCIONES, HAY QUE VOLVER A
-- PONERLE ESTA LÍNEA. No es opcional y no se hereda.
alter function app.rate_hit(text, text, interval, integer)
  set search_path = app, public, extensions, pg_catalog;

alter function app.rate_events_gc(interval)
  set search_path = app, public, extensions, pg_catalog;

alter function app.horario_excepciones_gc(interval)
  set search_path = app, public, extensions, pg_catalog;
