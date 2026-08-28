import 'server-only';
import { sql } from './db';
import { normalizePhone, PHONE_ERROR_ES } from './phone';
import { signToken, cookieHeader, SESSION_COOKIE } from './session';
import { contrasenaValida, hashContrasena, REGLA_CONTRASENA } from './contrasena';
import { edadValida, REGLA_EDAD } from './edad';

/**
 * Alta de un jugador.
 *
 * Vive aparte de las rutas porque lo usan DOS: /api/registrar, que crea la
 * cuenta en cuanto la persona llena el formulario (aunque todavía no tire), y
 * /api/spin, que la crea al vuelo si le llega una tirada sin sesión.
 *
 * Que exista /api/registrar no es un lujo. Antes la cuenta solo se guardaba
 * dentro de la tirada: quien se registraba y cerraba sin halar la palanca
 * NUNCA quedaba grabado, y al volver a "Entrar" le decía que no existía. Peor
 * para el negocio: ese registro —nombre, celular, pueblo— es justo el dato que
 * la página existe para capturar, y se perdía.
 */

export type DatosRegistro = {
  nombre?: string;
  celular?: string;
  puebloId?: number;
  acepta?: boolean;
  contrasena?: string;
  /** 'YYYY-MM-DD'. Ver la comprobación de edad más abajo. */
  nacimiento?: string;
};

export type ResultadoRegistro =
  | { ok: true; playerId: string; bloqueado: boolean; cookieSesion: string }
  | { ok: false; codigo: string; mensaje: string; status: number };

export async function registrarJugador(
  datos: DatosRegistro,
  ctx: { ip: string; deviceId: string },
): Promise<ResultadoRegistro> {
  const { nombre, celular, puebloId, acepta, contrasena, nacimiento } = datos;

  if (!nombre || !celular || !puebloId) {
    return { ok: false, codigo: 'REGISTRO_REQUERIDO', mensaje: 'Completa tu nombre, celular y pueblo.', status: 400 };
  }
  if (!acepta) {
    return { ok: false, codigo: 'CONSENTIMIENTO_REQUERIDO', mensaje: 'Debes aceptar los términos para participar.', status: 400 };
  }

  // Un nombre empieza por letra. La regla parece cosmética y no lo es: los
  // caracteres que quedan fuera (= + - @, tabulador, retorno) son exactamente
  // los que Excel interpreta como fórmula al abrir la exportación de clientes.
  // La exportación ya los neutraliza; esto los frena antes de que lleguen a la
  // base de datos, que es donde de verdad no pintan nada.
  //
  // Deliberadamente permisiva de ahí en adelante: acentos, ñ, guiones,
  // apóstrofos y puntos son parte de nombres reales, y rechazar a un cliente de
  // verdad cuesta más que cualquier limpieza que se gane apretando la regla.
  if (!/^\p{L}/u.test(nombre.trim()) || /[\u0000-\u001f]/.test(nombre)) {
    return { ok: false, codigo: 'NOMBRE_INVALIDO', mensaje: 'Escribe tu nombre tal como aparece en tu identificación.', status: 400 };
  }

  // LA EDAD SE COMPRUEBA AQUÍ, Y NO SOLO EN LA PANTALLA.
  //
  // Hasta ahora el "+18" del pie, el "Solo mayores de 18 años" del formulario y
  // el "Personas de 18 años o más" de los términos eran las tres cosas lo
  // mismo: un cartel. No había ni un sitio donde se comprobara. Un menor podía
  // registrarse, tirar, ganar los $25 y presentarse a cobrarlos en el mostrador
  // de un casino con licencia.
  //
  // Va en el servidor porque la pantalla no cuenta: cualquiera puede mandar la
  // petición sin pasar por el formulario. Y se cuenta contra el calendario de
  // Puerto Rico, no contra el del servidor, que va en UTC y adelanta el día a
  // partir de las 8 de la noche.
  if (!edadValida(nacimiento)) {
    return { ok: false, codigo: 'EDAD_INVALIDA', mensaje: REGLA_EDAD, status: 400 };
  }

  const tel = normalizePhone(celular);
  if (!tel.ok) {
    return { ok: false, codigo: 'TELEFONO_INVALIDO', mensaje: PHONE_ERROR_ES[tel.reason], status: 400 };
  }

  if (!contrasenaValida(contrasena ?? '')) {
    return { ok: false, codigo: 'CONTRASENA_INVALIDA', mensaje: REGLA_CONTRASENA, status: 400 };
  }

  const [permitido] = await sql<{ rate_hit: boolean }[]>`
    select app.rate_hit('register_ip', ${ctx.ip}, interval '1 hour', 12) as rate_hit
  `;
  if (!permitido.rate_hit) {
    return { ok: false, codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados registros desde esta conexión. Intenta más tarde.', status: 429 };
  }

  // ¿Ya existe ese celular? Entonces AQUÍ NO SE ENTRA. Punto.
  //
  // La versión anterior de esto solo frenaba si la cuenta YA TENÍA contraseña,
  // y razonaba así: "si no la tiene, se le pone la que acaba de escribir y se
  // entra. No empeora nada: esa cuenta ya se abría con celular + nombre, que es
  // exactamente lo que este formulario pide."
  //
  // La premisa era FALSA y el fallo, crítico. Este endpoint no comprueba el
  // nombre en ningún momento: el UPSERT de abajo lo SOBRESCRIBE. Así que
  // sabiendo solo un número de celular —  y ninguna cuenta de las que hay hoy
  // tiene contraseña, porque la migración 0010 crea la columna en NULL —
  // cualquiera se quedaba con la cuenta entera. Reproducido de punta a punta:
  //
  //   ANTES:   Carmen Delia Santiago | hash=NULL
  //   POST /api/registrar con ese celular y un nombre inventado
  //     -> 200 y cookie de sesión
  //   DESPUÉS: Ladron De Cupones     | hash=scrypt$327...
  //   el atacante lee el cupón de Carmen, y Carmen ya no entra
  //
  // Y se lleva el dinero: el nombre que ve el cajero al canjear pasa a ser el
  // del atacante, así que CUADRA con su identificación con foto. Justo la
  // defensa que este proyecto da por última.
  //
  // La regla correcta es más simple de decir y más fácil de no romper:
  // registrarse CREA cuentas nuevas y nada más. Recuperar una cuenta que ya
  // existe —  incluidas las heredadas, que crean su contraseña en el camino —
  // es trabajo de /api/entrar, que sí comprueba el nombre contra el guardado.
  const [existente] = await sql<{ id: string }[]>`
    select id from app.players where phone_e164 = ${tel.e164}
  `;
  if (existente) {
    // UN SOLO mensaje, tenga contraseña o no.
    //
    // Distinguirlos sería un localizador: diría qué números son cuentas
    // heredadas, o sea cuáles se pueden intentar abrir sabiendo solo el
    // nombre. El texto cubre los dos casos sin decir cuál es.
    return {
      ok: false,
      codigo: 'CUENTA_EXISTE',
      mensaje:
        'Ya tienes una cuenta con este número. Entra con tu contraseña. ' +
        'Si nunca creaste una, escribe también tu nombre completo al entrar.',
      status: 409,
    };
  }

  const hash = await hashContrasena(contrasena!);

  // INSERT a secas, sin ON CONFLICT DO UPDATE.
  //
  // El DO UPDATE era lo que convertía este endpoint en una vía para modificar
  // cuentas ajenas. Ya no actualiza nada: si dos peticiones simultáneas
  // intentan crear el mismo celular, la segunda choca contra la restricción
  // única y se convierte en el mismo 409 de arriba —  que es la respuesta
  // correcta, no un error.
  let jugador: { id: string; blocked_at: string | null } | undefined;
  try {
    [jugador] = await sql<{ id: string; blocked_at: string | null }[]>`
      insert into app.players (phone_e164, full_name, municipality_id, consent_at,
                               password_hash, password_set_at, birth_date)
      values (${tel.e164}, ${nombre}, ${puebloId}, now(), ${hash}, now(), ${nacimiento!})
      returning id, blocked_at
    `;
  } catch (e) {
    // 23505 = unique_violation. Cierra la carrera contra el SELECT de arriba.
    if ((e as { code?: string })?.code === '23505') {
      return {
        ok: false,
        codigo: 'CUENTA_EXISTE',
        mensaje:
          'Ya tienes una cuenta con este número. Entra con tu contraseña. ' +
          'Si nunca creaste una, escribe también tu nombre completo al entrar.',
        status: 409,
      };
    }
    throw e;
  }
  if (!jugador) {
    return { ok: false, codigo: 'ERROR', mensaje: 'No pudimos crear tu cuenta. Intenta de nuevo.', status: 500 };
  }

  // Un código de área de fuera de PR no se rechaza — puede ser un turista o
  // alguien que conserva su número de cuando vivía en Estados Unidos. Se deja
  // anotado para revisión y ya.
  if (!tel.isPuertoRico) {
    await sql`
      insert into app.risk_events (player_id, device_id, ip_inet, kind, score, detail)
      values (${jugador.id}, ${ctx.deviceId}, ${ctx.ip}, 'area_code_no_pr', 10,
              ${sql.json({ areaCode: tel.areaCode })})
    `;
  }

  return {
    ok: true,
    playerId: jugador.id,
    bloqueado: Boolean(jugador.blocked_at),
    cookieSesion: cookieHeader(SESSION_COOKIE, await signToken({ pid: jugador.id })),
  };
}
