-- SALIR DE VERDAD: revocar la sesión en el servidor, no solo borrar la cookie.
--
-- EL PROBLEMA
-- -----------
-- Las sesiones son tokens firmados (JWT). "Salir" hoy solo borra la cookie del
-- navegador, pero el token sigue siendo VÁLIDO dondequiera que exista hasta que
-- caduque solo —el del panel a los 7 días, el del jugador a los 400—. Si alguien
-- copió el token, o quedó en el historial de una tablet prestada, cerrar sesión
-- en el aparato no lo mata. Eso es lo que hay que arreglar para poder decir que
-- salir cierra la sesión "en todos lados".
--
-- LA SOLUCIÓN: UN SELLO DE FECHA
-- -------------------------------
-- Se guarda "desde cuándo vale una sesión". Cada token lleva su hora de emisión
-- (`iat`). Un token vale solo si se emitió DESPUÉS de ese sello. Salir mueve el
-- sello a "ahora", y con eso todos los tokens emitidos antes —en cualquier
-- aparato— dejan de valer en el acto, sin tener que perseguirlos uno por uno.
-- Es la forma estándar de revocar tokens sin guardar cada uno.

-- El sello del PANEL. Es una credencial compartida, así que hay un solo sello
-- para todo el personal: salir en una tablet cierra la sesión en todas. Es lo
-- correcto para una contraseña compartida —si se pierde un aparato, un clic las
-- cierra todas— y es justo lo que se pidió.
create table if not exists app.session_epoch (
  scope      text primary key,
  valid_from timestamptz not null default now()
);

insert into app.session_epoch (scope) values ('admin')
on conflict (scope) do nothing;

-- RLS encendida y sin políticas, igual que las otras 23 tablas: solo entra
-- `service_role`, que la salta por diseño. Sin esta línea la tabla quedaría
-- legible desde internet con la clave pública. Lo cazó
-- `scripts/verificar-blindaje.mjs` en la primera pasada, que es justo para lo
-- que existe ese guion.
alter table app.session_epoch enable row level security;

-- El sello del JUGADOR, uno por persona: salir cierra las sesiones de ESE
-- jugador y de nadie más. NULL = nunca ha cerrado sesión, así que todos los
-- tokens que ya andan por ahí siguen valiendo y nadie tiene que volver a entrar
-- por culpa de este despliegue. Se pone a `now()` la primera vez que sale.
alter table app.players
  add column if not exists sessions_valid_from timestamptz;

comment on column app.players.sessions_valid_from is
  'Sello de revocación: un token de sesión de este jugador solo vale si su `iat` '
  'es posterior a esta fecha. Lo mueve a now() el cierre de sesión. NULL = nunca '
  'ha cerrado sesión, todo token vale. Ver src/lib/revocar.ts.';
