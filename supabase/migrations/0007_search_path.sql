-- =============================================================================
-- search_path fijo en todas las funciones
--
-- Sin `search_path` fijo, una función se resuelve contra el search_path de quien
-- la llama. Un rol con permiso para crear objetos podría plantar su propia
-- `now()` o `digest()` en un esquema que vaya primero y secuestrar lo que hace
-- la función — incluido el sorteo del premio.
--
-- `execute_spin` y `redeem_voucher` ya lo traen (van con SECURITY DEFINER, donde
-- es obligatorio). Estas cinco faltaban.
--
-- Se usa ALTER FUNCTION y no CREATE OR REPLACE a propósito: `gaming_date` y
-- `norm_name` se usan dentro de una columna generada y de varios índices, y
-- recrearlas obligaría a reconstruirlos.
-- =============================================================================

alter function app.gaming_date(timestamptz)                set search_path = app, public, pg_catalog;
alter function app.norm_name(text)                         set search_path = app, public, pg_catalog;
alter function app.rate_hit(text, text, interval, integer)  set search_path = app, public, pg_catalog;
alter function app.crypto_random()                         set search_path = app, public, pg_catalog;
alter function app.seed_slot(date, text, smallint)         set search_path = app, public, pg_catalog;
