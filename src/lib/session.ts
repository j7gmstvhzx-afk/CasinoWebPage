import { SignJWT, jwtVerify } from 'jose';
import { emitidoEnMs } from './revocar-hora';
import { cookies, headers } from 'next/headers';

/**
 * Sesión del jugador.
 *
 * El prefijo `__Host-` no es decoración: el navegador se NIEGA a aceptar la
 * cookie si no es Secure, Path=/ y sin atributo Domain. Eso bloquea de raíz la
 * fijación de cookies desde un subdominio.
 */
export const SESSION_COOKIE = '__Host-cam_sess';
export const DEVICE_COOKIE = '__Host-cam_did';

export const SESSION_DAYS = 400; // tope que aceptan los navegadores

const secretKey = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET debe existir y tener al menos 32 caracteres.');
  }
  return new TextEncoder().encode(s);
};

export async function signToken(
  payload: Record<string, string | number>,
  days = SESSION_DAYS,
): Promise<string> {
  // `ms`: LA HORA DE EMISIÓN CON MILISEGUNDOS, y no es un capricho.
  //
  // El `iat` que pone el estándar va en SEGUNDOS. La revocación compara esa
  // hora contra un sello que sí tiene milisegundos (ver lib/revocar.ts), y con
  // solo segundos pasaba esto: si alguien salía y volvía a entrar dentro del
  // MISMO segundo, el token nuevo apuntaba al comienzo de ese segundo, el sello
  // a un instante posterior dentro de él, y la sesión recién abierta nacía
  // muerta. Salió en la prueba de "salir y volver a entrar".
  //
  // Con `ms` la comparación es exacta y ese empate no existe.
  return new SignJWT({ ...payload, ms: Date.now() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('cam-giveaway')
    .setExpirationTime(`${days}d`)
    .sign(secretKey());
}

export async function readToken(token?: string): Promise<Record<string, string> | null> {
  if (!token) return null;
  try {
    // `algorithms` FIJO A HS256, no es redundante.
    //
    // La clave es simétrica, así que jose ya no aceptaría RS256 ni `alg: none`.
    // Pero clavar el algoritmo aquí cierra la puerta a que un cambio futuro de
    // clave o de librería reabra la "confusión de algoritmo" sin que nadie lo
    // note. Un token que llegue con cualquier otro `alg` se rechaza como si
    // estuviera manipulado, que es lo que es.
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: 'cam-giveaway',
      algorithms: ['HS256'],
    });
    return payload as Record<string, string>;
  } catch {
    // Firma inválida, expirado o manipulado. Se trata como "sin sesión".
    return null;
  }
}

export async function getSession(): Promise<{
  playerId: string | null;
  deviceId: string | null;
  /**
   * Hora de emisión del token de sesión, en milisegundos. Hace falta para
   * comprobar si la sesión fue REVOCADA desde entonces: ver `tokenVigente` en
   * lib/revocar.ts. Sin sesión, null.
   */
  sesionEmitidoMs: number | null;
}> {
  const jar = await cookies();
  const [sess, dev] = await Promise.all([
    readToken(jar.get(SESSION_COOKIE)?.value),
    readToken(jar.get(DEVICE_COOKIE)?.value),
  ]);
  return {
    playerId: sess?.pid ?? null,
    deviceId: dev?.did ?? null,
    sesionEmitidoMs: emitidoEnMs(sess),
  };
}

export function cookieHeader(name: string, value: string, days = SESSION_DAYS): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86400}`;
}

/**
 * IP del cliente.
 *
 * NUNCA usar `x-forwarded-for.split(',')[0]`. Cualquiera puede enviar su propia
 * cabecera `X-Forwarded-For: 1.2.3.4` y Vercel le añade la IP real A LA DERECHA.
 * Tomar el valor de la izquierda significa limitar la tasa por un dato que
 * controla el atacante — peor que no limitar nada, porque parece protección.
 *
 * `x-real-ip` la pone el borde de Vercel y el cliente no la puede falsificar.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const real = h.get('x-real-ip');
  if (real) return real.trim();

  // Sin x-real-ip (desarrollo local, otro proveedor): el valor de MÁS A LA
  // DERECHA es el que añadió el proxy de confianza.
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return '0.0.0.0';
}
