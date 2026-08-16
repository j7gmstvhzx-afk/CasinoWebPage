import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { esAdmin } from '@/lib/admin-auth';
import { normalizeVoucherCode } from '@/lib/voucher';
import { buscarCupon, MENSAJES_CUPON } from '@/lib/vouchers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Canje de cupones.
 *
 * Dos acciones separadas a propósito:
 *
 *   buscar   solo consulta. El empleado ve el nombre y el monto ANTES de
 *            canjear, para poder cotejarlo con la identificación del cliente.
 *   canjear  la acción irreversible, en su propio clic.
 *
 * Fundirlas en un paso ahorraría un clic y convertiría cada escaneo por
 * curiosidad en un premio entregado.
 */

type Cuerpo = { accion?: 'buscar' | 'canjear'; codigo?: string };

export async function POST(req: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ ok: false, mensaje: 'No autorizado.' }, { status: 401 });
  }

  const { accion = 'buscar', codigo = '' } = (await req.json().catch(() => ({}))) as Cuerpo;

  if (accion === 'buscar') {
    const r = await buscarCupon(codigo);
    return NextResponse.json(
      r.ok ? r : { ok: false, codigo: r.codigo, mensaje: MENSAJES_CUPON[r.codigo] },
    );
  }

  // --- Canje ----------------------------------------------------------------
  const code = normalizeVoucherCode(codigo);
  if (!code) {
    return NextResponse.json({
      ok: false,
      codigo: 'MAL_ESCRITO',
      mensaje: MENSAJES_CUPON.MAL_ESCRITO,
    });
  }

  // Con contraseña compartida no sabemos qué empleado es. Se usa una fila de
  // personal genérica para que el rastro quede completo; el día que se pase a
  // una cuenta por empleado, `redeemed_by` empieza a decir quién fue sin tocar
  // el esquema.
  const [staff] = await sql<{ id: string }[]>`
    insert into app.staff (display_name, email)
    values ('Mostrador', 'mostrador@casinoatlanticomanati.com')
    on conflict (email) do update set active = true
    returning id
  `;

  const [r] = await sql<
    {
      ok: boolean;
      reason: string;
      amount_cents: number | null;
      player_name: string | null;
    }[]
  >`
    select * from app.redeem_voucher(${code}, ${staff.id}::uuid)
  `;

  if (!r.ok) {
    return NextResponse.json({
      ok: false,
      codigo: r.reason,
      mensaje: MENSAJES_CUPON[r.reason] ?? 'No se pudo canjear.',
      nombre: r.player_name,
    });
  }

  return NextResponse.json({
    ok: true,
    canjeado: true,
    monto: r.amount_cents,
    nombre: r.player_name,
  });
}
