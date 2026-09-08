import 'server-only';
import { sql } from './db';
import { emitidoEnMs } from './revocar-hora';

/**
 * REVOCAR SESIONES — que "salir" cierre de verdad, y en todos lados.
 *
 * POR QUÉ HACE FALTA ESTO
 * -----------------------
 * Las sesiones de este sitio son tokens firmados (JWT) que viajan en una
 * cookie. Tienen una ventaja enorme —el servidor los verifica con una firma, sin
 * ir a la base— y una pega que es justo la que importa al cerrar sesión: NO SE
 * PUEDEN APAGAR. Borrar la cookie limpia el navegador que la tenía, y nada más.
 * El token en sí sigue valiendo hasta que caduca solo. Si alguien lo copió, o
 * quedó en una tablet prestada, "salir" no lo tocaba.
 *
 * CÓMO SE APAGA UN TOKEN QUE NO SE PUEDE APAGAR
 * ---------------------------------------------
 * Con un sello de fecha. Cada token lleva grabada su hora de emisión (`iat`), y
 * se guarda aparte "desde cuándo vale una sesión". Un token solo sirve si se
 * emitió DESPUÉS del sello. Salir mueve el sello a "ahora": todos los tokens de
 * antes —estén donde estén, en el aparato que sea— dejan de valer en ese
 * instante. No hay que perseguirlos ni guardar una lista de cada uno.
 *
 * EL PRECIO, DICHO CLARO: comprobar el sello es una lectura a la base en cada
 * petición que use la sesión. Por eso se comprueba SOLO donde la sesión da un
 * privilegio —el panel entero y la tirada del jugador— y nunca en las páginas
 * públicas, que no tienen sesión que comprobar.
 */

/** Un token vale si se emitió después del sello. Sin sello, vale siempre. */
export function tokenVigente(emitidoMs: number | null, sello: Date | null): boolean {
  if (!sello) return true; // nunca se cerró sesión: no hay nada revocado
  if (emitidoMs === null) {
    // Un token sin hora de emisión no se puede fechar, así que no se puede
    // descartar que sea anterior al cierre. Se trata como revocado.
    return false;
  }
  return emitidoMs >= sello.getTime();
}

export { emitidoEnMs } from './revocar-hora';

/**
 * QUÉ PASA SI LA BASE NO CONTESTA AL PEDIR EL SELLO.
 *
 * Se deja pasar, y se anota. Es una decisión incómoda que conviene razonar en
 * vez de esconder:
 *
 *   - Si se dejara CERRADO, un tropiezo de la base —que en este proyecto los ha
 *     habido— echaría del panel a todo el personal en mitad del turno, y ya no
 *     podrían ni entrar de nuevo, porque entrar también necesita la base.
 *   - Dejándolo ABIERTO, la única ventana que se abre es ésta: alguien con un
 *     token YA revocado que además acierte a usarlo justo mientras la base no
 *     responde. El token sigue teniendo que estar bien firmado y sin caducar.
 *
 * La firma no se relaja nunca: esto solo afecta a la comprobación de revocación.
 */
async function selloDe(scope: string): Promise<Date | null> {
  try {
    const [f] = await sql<{ valid_from: Date }[]>`
      select valid_from from app.session_epoch where scope = ${scope}
    `;
    return f?.valid_from ?? null;
  } catch (e) {
    console.error(
      `[sesión] no se pudo leer el sello de revocación de "${scope}"; ` +
        'se deja pasar esta petición. Ver src/lib/revocar.ts.',
      e,
    );
    return null;
  }
}

/** El sello del panel. Uno solo, porque la contraseña es compartida. */
export const selloAdmin = () => selloDe('admin');

/**
 * Cierra TODAS las sesiones del panel, en todos los aparatos.
 *
 * Es la semántica correcta para una credencial compartida: si se pierde una
 * tablet, un clic deja fuera a cualquiera que la tenga. El precio es que el
 * resto del personal vuelve a escribir la contraseña, que es exactamente lo que
 * se quiere que pase cuando alguien cierra sesión por seguridad.
 */
export async function revocarSesionesAdmin(): Promise<void> {
  // LA HORA SALE DEL MISMO RELOJ QUE FIRMA LOS TOKENS, Y NO DE `now()`.
  //
  // El token lleva su hora de emisión puesta por Node, en Vercel. El sello se
  // ponía con el `now()` de Postgres, en Supabase: dos servicios distintos, dos
  // relojes distintos. Si el de Postgres va adelantado aunque sea unos
  // segundos, el sello queda en el futuro respecto de Node y TODO token nuevo
  // nace ya revocado — el empleado entra bien, la contraseña es correcta, y la
  // pantalla lo devuelve a la puerta una y otra vez sin decirle nada, porque
  // técnicamente no hay ningún error.
  //
  // Comparando dos horas del mismo reloj el desfase desaparece. No se relaja
  // nada: sigue valiendo solo lo emitido después del cierre.
  await sql`
    insert into app.session_epoch (scope, valid_from) values ('admin', ${new Date()})
    on conflict (scope) do update set valid_from = excluded.valid_from
  `;
}

/** Cierra todas las sesiones de UN jugador, en todos sus aparatos. */
export async function revocarSesionesJugador(playerId: string): Promise<void> {
  // Del reloj de Node, por lo mismo que el sello del panel: es el reloj que
  // firma los tokens. Ver revocarSesionesAdmin.
  await sql`
    update app.players set sessions_valid_from = ${new Date()} where id = ${playerId}::uuid
  `;
}

/**
 * ¿Sigue viva la sesión de este jugador?
 *
 * Se usa donde la sesión da un privilegio y no se está leyendo ya la fila del
 * jugador por otro motivo. Cuando SÍ se está leyendo (la pantalla de la
 * tragamonedas), sale más barato pedir `sessions_valid_from` en esa misma
 * consulta y llamar directamente a `tokenVigente`.
 *
 * Misma política que el sello del panel ante un fallo de la base: se deja pasar
 * y se anota, para que un tropiezo no eche a todo el mundo de su cuenta.
 */
export async function sesionJugadorVigente(
  playerId: string,
  emitidoMs: number | null,
): Promise<boolean> {
  try {
    const [f] = await sql<{ sessions_valid_from: Date | null }[]>`
      select sessions_valid_from from app.players where id = ${playerId}::uuid
    `;
    return tokenVigente(emitidoMs, f?.sessions_valid_from ?? null);
  } catch (e) {
    console.error('[sesión] no se pudo comprobar la revocación del jugador', e);
    return true;
  }
}
