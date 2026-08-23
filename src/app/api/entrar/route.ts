import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { normalizePhone, PHONE_ERROR_ES } from '@/lib/phone';
import {
  getClientIp,
  getSession,
  signToken,
  cookieHeader,
  SESSION_COOKIE,
} from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

/**
 * Entrar a una cuenta que ya existe.
 *
 * Hace falta porque la sesión vive en una cookie: si el cliente juega hoy desde
 * el celular y mañana desde la computadora de la casa —  o borra el navegador,
 * o usa modo privado —  para el sitio es una persona nueva. Sin esto podría
 * registrarse otra vez con el mismo número y quedarse con dos tiradas.
 *
 * POR QUÉ PIDE NOMBRE Y NO SOLO EL CELULAR
 * ----------------------------------------
 * Con el número solo, cualquiera podría escribir números ajenos hasta dar con
 * uno que ganó ese día y quedarse con el código del cupón. Pidiendo también el
 * nombre completo, hay que saber las dos cosas.
 *
 * Esto NO es verificación de identidad —  el dueño decidió no mandar SMS por
 * ahora —  y no pretende serlo. La defensa de verdad está al final: el cupón se
 * canjea en Servicio al Cliente con identificación con foto, y el nombre de la
 * identificación tiene que cuadrar con el del cupón. Un código robado no cobra.
 * Cuando quieran activar SMS, la columna `phone_verified_at` ya está en la
 * tabla esperando.
 */
const Entrada = z.object({
  celular: z.string().trim().min(7).max(25),
  nombre: z.string().trim().min(3).max(120),
});

const error = (mensaje: string, status = 400) =>
  NextResponse.json({ ok: false, mensaje }, { status });

export async function POST(req: NextRequest) {
  const crudo = await req.json().catch(() => null);
  const parsed = Entrada.safeParse(crudo ?? {});
  if (!parsed.success) {
    return error('Escribe tu celular y tu nombre completo.');
  }

  const tel = normalizePhone(parsed.data.celular);
  if (!tel.ok) return error(PHONE_ERROR_ES[tel.reason]);

  // Antes de tocar la tabla de jugadores: sin este freno, el formulario sería
  // una puerta abierta para probar números en masa.
  const ip = await getClientIp();
  const [permitido] = await sql<{ rate_hit: boolean }[]>`
    select app.rate_hit('login_ip', ${ip}, interval '1 hour', 20) as rate_hit
  `;
  if (!permitido.rate_hit) {
    return error('Demasiados intentos desde esta conexión. Intenta más tarde.', 429);
  }

  // El nombre se compara ya normalizado (sin acentos, sin mayúsculas, sin
  // espacios de más) contra la columna generada: quien se registró como
  // "José Rivera" entra escribiendo "jose rivera".
  const [jugador] = await sql<{ id: string; full_name: string; blocked_at: string | null }[]>`
    select id, full_name, blocked_at
      from app.players
     where phone_e164     = ${tel.e164}
       and full_name_norm = app.norm_name(${parsed.data.nombre})
     limit 1
  `;

  // Un solo mensaje para "no existe" y para "el nombre no cuadra". Decir cuál
  // de los dos falló convertiría esto en un detector de números registrados.
  if (!jugador) {
    return error('No encontramos esa combinación de celular y nombre. Revísalos o regístrate.', 404);
  }
  if (jugador.blocked_at) {
    return error('Esta cuenta no puede participar. Pasa por Servicio al Cliente.', 403);
  }

  await sql`update app.players set last_seen_at = now() where id = ${jugador.id}`;

  const res = NextResponse.json({
    ok: true,
    nombre: jugador.full_name.split(/\s+/)[0],
  });
  res.headers.append(SESSION_COOKIE_HEADER, await cookieDeSesion(jugador.id));
  return res;
}

/**
 * Salir.
 *
 * En el casino un mismo celular pasa de mano en mano. Sin una forma de salir,
 * el segundo cliente vería el nombre del primero y no podría jugar.
 */
export async function DELETE() {
  const { playerId } = await getSession();
  const res = NextResponse.json({ ok: true, estabaDentro: Boolean(playerId) });
  // Max-Age=0 borra la cookie. Los demás atributos tienen que ser idénticos a
  // los de cuando se creó o el navegador la deja donde está.
  res.headers.append(SESSION_COOKIE_HEADER, cookieHeader(SESSION_COOKIE, '', 0));
  return res;
}

const SESSION_COOKIE_HEADER = 'Set-Cookie';
const cookieDeSesion = async (playerId: string) =>
  cookieHeader(SESSION_COOKIE, await signToken({ pid: playerId }));
