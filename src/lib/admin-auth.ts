import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { signToken, readToken } from './session';

/**
 * Acceso al panel de empleados.
 *
 * Hoy: una contraseña compartida (ADMIN_PASSWORD) que emite una cookie firmada.
 * Es lo apropiado para un mostrador donde tres o cuatro personas del mismo turno
 * usan la misma tablet, y no depende de que el casino tenga cuentas de correo
 * para todo el mundo.
 *
 * LIMITACIÓN CONOCIDA, escrita aquí para que no se olvide: con contraseña
 * compartida, `redeemed_by` no identifica a la persona que canjeó, solo que fue
 * alguien del personal. El día que importe saber quién entregó cada premio hay
 * que pasar a Supabase Auth con una cuenta por empleado. La tabla `app.staff` y
 * la columna `redeemed_by` ya están puestas para eso; solo falta el login.
 */

export const ADMIN_COOKIE = '__Host-cam_admin';
const DIAS = 7; // el turno del mostrador no debería durar más de una semana

export function verificarContrasena(intento: string): boolean {
  const real = process.env.ADMIN_PASSWORD;
  if (!real || real.length < 6) return false;

  // Se comparan los SHA-256, no las contraseñas.
  //
  // timingSafeEqual exige que ambos búferes midan lo mismo, y ese requisito es
  // justo el problema: ramificar por longitud filtra el largo de la contraseña
  // real en el tiempo de respuesta. Los digests siempre miden 32 bytes, así que
  // la comparación es de tiempo constante pase lo que pase.
  const a = createHash('sha256').update(intento ?? '', 'utf8').digest();
  const b = createHash('sha256').update(real, 'utf8').digest();
  return timingSafeEqual(a, b);
}

export async function crearSesionAdmin(): Promise<string> {
  return signToken({ rol: 'staff' }, DIAS);
}

export async function esAdmin(): Promise<boolean> {
  const jar = await cookies();
  const t = await readToken(jar.get(ADMIN_COOKIE)?.value);
  return t?.rol === 'staff';
}

export function cookieAdmin(valor: string): string {
  return `${ADMIN_COOKIE}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DIAS * 86400}`;
}

export const cookieAdminBorrar = () =>
  `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
