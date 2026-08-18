-- =============================================================================
-- Corrección: el search_path fijo dejaba fuera el esquema `extensions`
--
-- QUÉ PASÓ
-- --------
-- La migración 0007 fijó `search_path = app, public, pg_catalog` en las siete
-- funciones para que nadie pudiera secuestrarlas plantando una función suya en
-- un esquema que fuera primero. Correcto en la intención, incompleto en la
-- lista: Supabase NO instala pgcrypto en `public`, lo instala en `extensions`.
--
-- Resultado: `gen_random_bytes()` dejó de resolverse y con él se cayó
-- `crypto_random()`, que es de donde sale el azar del sorteo. En cadena:
--
--   crypto_random  -> el instante ganador del día
--   seed_slot      -> siembra los premios (la llama el cron y execute_spin)
--   execute_spin   -> TODAS las tiradas
--
-- Es decir: con 0007 aplicada y sin esta, la promoción no funciona. Salió al
-- sembrar los días de premio contra el proyecto real:
--
--   ERROR: 42883: function gen_random_bytes(integer) does not exist
--
-- POR QUÉ NO SE VIO ANTES
-- -----------------------
-- La prueba de concurrencia corre contra un Postgres local, donde pgcrypto sí
-- queda en `public`. El fallo solo aparece donde importa: en Supabase.
--
-- `extensions` va DESPUÉS de `app` y `public`: sigue sin poder adelantarse a
-- una función nuestra. Y si el esquema no existe —  como en un Postgres local
-- corriente —  Postgres simplemente lo ignora, así que esto es seguro en los
-- dos sitios.
-- =============================================================================

alter function app.gaming_date(timestamptz)                set search_path = app, public, extensions, pg_catalog;
alter function app.norm_name(text)                         set search_path = app, public, extensions, pg_catalog;
alter function app.rate_hit(text, text, interval, integer)  set search_path = app, public, extensions, pg_catalog;
alter function app.crypto_random()                         set search_path = app, public, extensions, pg_catalog;
alter function app.seed_slot(date, text, smallint)         set search_path = app, public, extensions, pg_catalog;
alter function app.execute_spin(uuid, uuid, inet, text, smallint[], smallint[], text, integer)
                                                           set search_path = app, public, extensions, pg_catalog;
alter function app.redeem_voucher(text, uuid)               set search_path = app, public, extensions, pg_catalog;
