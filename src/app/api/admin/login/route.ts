import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getClientIp } from '@/lib/session';
import { verificarContrasena, crearSesionAdmin, cookieAdmin, cookieAdminBorrar } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = await getClientIp();
  const { contrasena } = (await req.json().catch(() => ({}))) as { contrasena?: string };

  // Límite estricto: 8 intentos por hora por IP. Sin esto, una contraseña
  // compartida de mostrador se adivina por fuerza bruta en una tarde.
  const [permitido] = await sql<{ rate_hit: boolean }[]>`
    select app.rate_hit('admin_login', ${ip}, interval '1 hour', 8) as rate_hit
  `;
  if (!permitido.rate_hit) {
    return NextResponse.json(
      { ok: false, mensaje: 'Demasiados intentos. Espera una hora.' },
      { status: 429 },
    );
  }

  if (!verificarContrasena(contrasena ?? '')) {
    await sql`
      insert into app.risk_events (ip_inet, kind, score, detail)
      values (${ip}, 'admin_login_fallido', 40, '{}'::jsonb)
    `;
    return NextResponse.json({ ok: false, mensaje: 'Contraseña incorrecta.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.headers.append('Set-Cookie', cookieAdmin(await crearSesionAdmin()));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.append('Set-Cookie', cookieAdminBorrar());
  return res;
}
