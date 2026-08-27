-- =============================================================================
-- Contraseña en la cuenta del jugador
--
-- Hasta ahora se entraba con celular + nombre completo. Eso no es autenticación
-- y el código lo decía sin rodeos: la defensa real era que el cupón se cobra en
-- persona con identificación con foto. Sigue siendo verdad, pero ahora además
-- hace falta algo que el cliente SEPA y que no esté impreso en su carnet.
--
-- LAS COLUMNAS SON NULABLES A PROPÓSITO
-- -------------------------------------
-- Ya hay jugadores registrados que no tienen contraseña, y no se les puede
-- poner una: nadie conoce su contraseña, ni siquiera ellos. Poner NOT NULL
-- obligaría a inventarles un valor, y una contraseña inventada por el sistema
-- que el dueño podría leer es peor que no tener ninguna.
--
-- Así que `password_hash` empieza en NULL y la aplicación trata ese NULL como
-- "cuenta heredada": entra con celular + nombre, como siempre, Y la crea en ese
-- momento. La cuenta se actualiza sola la próxima vez que la persona entre, sin
-- avisos, sin correos y sin que nadie se quede fuera.
--
-- `password_set_at` sirve para saber cuánta gente ya migró y decidir cuándo se
-- puede cerrar la puerta de atrás.
-- =============================================================================

alter table app.players
  add column if not exists password_hash   text,
  add column if not exists password_set_at timestamptz;

-- El hash lo escribe la aplicación con node:crypto (scrypt), no Postgres, así
-- que aquí solo se comprueba que tenga la forma esperada. Es una red contra un
-- error de programación —  guardar la contraseña en claro por accidente —  no
-- contra un atacante: quien pueda escribir en esta tabla ya ganó.
alter table app.players
  drop constraint if exists players_password_formato;
alter table app.players
  add constraint players_password_formato
  check (password_hash is null or password_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$');

comment on column app.players.password_hash is
  'Hash scrypt en formato scrypt$N$r$p$sal$hash. NULL = cuenta creada antes de que existieran las contraseñas; entra con celular+nombre y la crea al entrar.';

-- Para el panel: cuántas cuentas quedan sin migrar.
create index if not exists players_sin_contrasena_idx
  on app.players (created_at)
  where password_hash is null;
