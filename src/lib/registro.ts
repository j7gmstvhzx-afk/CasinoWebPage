import 'server-only';
import { sql } from './db';
import { normalizePhone, PHONE_ERROR_ES } from './phone';
import { signToken, cookieHeader, SESSION_COOKIE } from './session';

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
};

export type ResultadoRegistro =
  | { ok: true; playerId: string; bloqueado: boolean; cookieSesion: string }
  | { ok: false; codigo: string; mensaje: string; status: number };

export async function registrarJugador(
  datos: DatosRegistro,
  ctx: { ip: string; deviceId: string },
): Promise<ResultadoRegistro> {
  const { nombre, celular, puebloId, acepta } = datos;

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

  const tel = normalizePhone(celular);
  if (!tel.ok) {
    return { ok: false, codigo: 'TELEFONO_INVALIDO', mensaje: PHONE_ERROR_ES[tel.reason], status: 400 };
  }

  const [permitido] = await sql<{ rate_hit: boolean }[]>`
    select app.rate_hit('register_ip', ${ctx.ip}, interval '1 hour', 12) as rate_hit
  `;
  if (!permitido.rate_hit) {
    return { ok: false, codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados registros desde esta conexión. Intenta más tarde.', status: 429 };
  }

  // DO UPDATE, no DO NOTHING: con DO NOTHING un conflicto devuelve cero filas y
  // RETURNING no da nada, así que haría falta un SELECT extra y un reintento.
  // Así siempre vuelve la fila.
  const [jugador] = await sql<{ id: string; blocked_at: string | null }[]>`
    insert into app.players (phone_e164, full_name, municipality_id, consent_at)
    values (${tel.e164}, ${nombre}, ${puebloId}, now())
    on conflict (phone_e164) do update
      set last_seen_at    = now(),
          full_name       = excluded.full_name,
          municipality_id = excluded.municipality_id
    returning id, blocked_at
  `;

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
