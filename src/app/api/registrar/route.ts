import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { registrarJugador } from '@/lib/registro';
import {
  getSession,
  getClientIp,
  signToken,
  cookieHeader,
  DEVICE_COOKIE,
} from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Alta de la cuenta, sin tirar.
 *
 * La cuenta se graba aquí, en cuanto la persona llena el formulario — no dentro
 * de la tirada. Así, aunque cierre antes de halar la palanca, su registro queda
 * guardado y puede "Entrar" después con su celular y nombre. Y el dato que la
 * página vino a capturar (nombre, celular, pueblo) no se pierde.
 *
 * La tirada sigue siendo un acto aparte: halar la palanca en la máquina.
 */
const Alta = z.object({
  nombre: z.string().trim().min(3).max(120),
  celular: z.string().trim().min(7).max(25),
  puebloId: z.coerce.number().int().min(1).max(78),
  acepta: z.boolean(),
  // Trampa: un campo oculto que una persona nunca llena y un bot sí.
  website: z.string().max(0).optional(),
});

const error = (codigo: string, mensaje: string, status = 400) =>
  NextResponse.json({ ok: false, error: codigo, mensaje }, { status });

export async function POST(req: NextRequest) {
  const ip = await getClientIp();

  const crudo = await req.json().catch(() => null);
  const parsed = Alta.safeParse(crudo ?? {});
  if (!parsed.success) return error('DATOS_INVALIDOS', 'Revisa los datos del formulario.');
  if (parsed.data.website) return error('DATOS_INVALIDOS', 'Revisa los datos del formulario.');

  const { deviceId } = await getSession();
  const dispositivo = deviceId ?? randomUUID();

  const r = await registrarJugador(parsed.data, { ip, deviceId: dispositivo });
  if (!r.ok) return error(r.codigo, r.mensaje, r.status);

  if (r.bloqueado) {
    return error('CUENTA_BLOQUEADA', 'Esta cuenta no puede participar. Pasa por Servicio al Cliente.', 403);
  }

  const res = NextResponse.json({
    ok: true,
    nombre: parsed.data.nombre.split(/\s+/)[0],
  });
  if (!deviceId) {
    res.headers.append('Set-Cookie', cookieHeader(DEVICE_COOKIE, await signToken({ did: dispositivo })));
  }
  res.headers.append('Set-Cookie', r.cookieSesion);
  return res;
}
