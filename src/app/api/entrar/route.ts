import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { normalizePhone, PHONE_ERROR_ES } from '@/lib/phone';
import {
  contrasenaValida,
  gastarTiempoIgual,
  hashContrasena,
  REGLA_CONTRASENA,
  verificarContrasena,
} from '@/lib/contrasena';
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
 * AHORA HACE FALTA CONTRASEÑA
 * ---------------------------
 * El nombre completo está impreso en el carnet que se enseña en el mostrador,
 * así que no era un secreto: quien viera una identificación ajena tenía las dos
 * cosas. La contraseña sí es algo que solo sabe el cliente.
 *
 * CUENTAS HEREDADAS
 * -----------------
 * Las cuentas creadas antes de esto no tienen contraseña, y nadie puede
 * inventarles una. Entran como siempre —  celular + nombre —  y en ese mismo
 * paso escriben la contraseña que van a usar de ahora en adelante. Nadie se
 * queda fuera y nadie recibe un correo raro.
 *
 * Sigue sin ser verificación de identidad, y sigue sin pretenderlo: la defensa
 * final es que el cupón se canjea en Servicio al Cliente con identificación con
 * foto y el nombre tiene que cuadrar. Un código robado no cobra. Cuando se
 * quiera activar SMS, `phone_verified_at` ya está en la tabla esperando.
 */
const Entrada = z.object({
  celular: z.string().trim().min(7).max(25),
  contrasena: z.string().min(1).max(200),
  // Solo lo piden las cuentas heredadas, para poder crear su contraseña.
  nombre: z.string().trim().min(3).max(120).optional(),
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
  const [jugador] = await sql<
    {
      id: string;
      full_name: string;
      blocked_at: string | null;
      password_hash: string | null;
      nombre_cuadra: boolean;
    }[]
  >`
    select id, full_name, blocked_at, password_hash,
           full_name_norm = app.norm_name(${parsed.data.nombre ?? ''}) as nombre_cuadra
      from app.players
     where phone_e164 = ${tel.e164}
     limit 1
  `;

  // Un solo mensaje para "no existe" y para "la contraseña no cuadra". Decir
  // cuál de los dos falló convertiría esto en un detector de qué números están
  // registrados en el casino.
  //
  // Y no basta con el mensaje: sin contraseña que comprobar, esta rama
  // contestaría en 2ms y la otra en ~90ms, así que la diferencia se mide con un
  // cronómetro. `gastarTiempoIgual` hace el mismo trabajo contra un hash de
  // mentira para que las dos tarden lo mismo.
  // UN SOLO mensaje y UN SOLO código para todo lo que no cuadra: celular que no
  // existe, contraseña mala, cuenta heredada sin nombre, o nombre que no cuadra.
  //
  // Antes había una respuesta distinta —  `400 FALTA_NOMBRE` —  para las cuentas
  // heredadas. Se identificaba sola, y era el localizador del ataque de toma de
  // cuentas: decía exactamente qué números son cuentas sin contraseña, o sea
  // cuáles se puede intentar abrir. Medida: contestaba en 7.1 ms frente a los
  // 105 ms de las demás ramas, así que ni siquiera hacía falta leer el cuerpo.
  //
  // Ahora el formulario enseña el campo del nombre SIEMPRE, marcado como
  // opcional: quien tenga contraseña lo deja vacío y quien no la tenga lo
  // llena. Así el servidor no tiene que decir de qué tipo es la cuenta.
  const NO_CUADRA = 'No encontramos esa combinación. Revisa tu celular y tu contraseña.';
  if (!jugador) {
    await gastarTiempoIgual();
    return error(NO_CUADRA, 401);
  }

  let autenticado = false;
  let hayQueGuardarClave = false;

  if (jugador.password_hash) {
    // Cuenta normal: manda la contraseña y el nombre ya no pinta nada.
    autenticado = await verificarContrasena(parsed.data.contrasena, jugador.password_hash);
  } else if (parsed.data.nombre && jugador.nombre_cuadra) {
    // Cuenta heredada: el nombre hace de segundo dato, como toda la vida, y la
    // contraseña que acaba de escribir queda guardada para la próxima.
    autenticado = contrasenaValida(parsed.data.contrasena);
    hayQueGuardarClave = autenticado;
    if (!autenticado) return error(REGLA_CONTRASENA);
  } else {
    // Heredada sin nombre, o con un nombre que no cuadra. Se gasta el mismo
    // tiempo que una comprobación de contraseña real: sin esto, esta rama
    // contesta en 7 ms y las otras en 105, y el reloj delata el tipo de cuenta
    // aunque el mensaje sea idéntico.
    await gastarTiempoIgual();
  }

  if (!autenticado) return error(NO_CUADRA, 401);

  // El bloqueo se comprueba DESPUÉS de acreditarse, no antes.
  //
  // Antes iba primero, y respondía 403 en 5.7 ms sin pedir nada: cualquiera
  // podía averiguar qué números están bloqueados en el casino escribiendo
  // números. Ahora hay que demostrar que la cuenta es tuya para que te diga
  // por qué no puedes participar.
  if (jugador.blocked_at) {
    return error('Esta cuenta no puede participar. Pasa por Servicio al Cliente.', 403);
  }

  if (hayQueGuardarClave) {
    const hash = await hashContrasena(parsed.data.contrasena);
    // `where password_hash is null` cierra la carrera de dos pestañas creando
    // contraseñas distintas a la vez: la segunda no pisa a la primera.
    await sql`
      update app.players
         set password_hash   = ${hash},
             password_set_at = now(),
             last_seen_at    = now()
       where id = ${jugador.id} and password_hash is null
    `;
  } else {
    await sql`update app.players set last_seen_at = now() where id = ${jugador.id}`;
  }

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
