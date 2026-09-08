import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { leerHistorial } from '@/lib/historial';
import { tokenVigente } from '@/lib/revocar';
import { conPlazo } from '@/lib/plazo-ruta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * El historial de la cuenta: días jugados y premios ganados.
 *
 * POR QUÉ NO VA DENTRO DE /api/spin
 * ---------------------------------
 * Esa ruta la llama el pop-up de la tragamonedas al abrir la portada, y todo lo
 * que se le añada lo paga cada visitante que solo pasaba por ahí. El historial
 * lo pide UNA pantalla, /cuenta, y solo después de saber que hay sesión. Aparte
 * también significa que si el historial falla, el resto de la cuenta sigue en
 * pie.
 *
 * Solo lee. No hay parámetro de jugador: contesta sobre el dueño de la cookie y
 * de nadie más, que es lo que impide convertir esto en una ventana a las
 * cuentas ajenas.
 */
export const GET = conPlazo('leer tu historial', manejarGet);

async function manejarGet() {
  const { playerId, sesionEmitidoMs } = await getSession();

  const fuera = () => NextResponse.json({ ok: true, registrado: false });

  if (!playerId) return fuera();

  const leido = await leerHistorial(playerId);
  if (!leido) return fuera();

  // La sesión pudo cerrarse en otro aparato después de firmarse este token.
  // Ver src/lib/revocar.ts.
  if (!tokenVigente(sesionEmitidoMs, leido.selloSesion)) return fuera();

  return NextResponse.json({ ok: true, registrado: true, ...leido.historial });
}
