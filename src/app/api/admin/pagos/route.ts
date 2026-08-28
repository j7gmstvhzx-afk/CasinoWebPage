import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { esAdmin } from '@/lib/admin-auth';
import { refrescarPublico } from '@/lib/revalidar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * Premios pagados del mes.
 *
 * Lo escribe el personal, como los montos de los jackpots. No se deduce de las
 * lecturas a propósito: es una declaración pública de cuánto dinero paga el
 * casino, y una cifra que no cuadra con la caja no es un detalle de interfaz.
 */
const Cuerpo = z.object({
  // AAAA-MM. El día lo pone el servidor, para que no haya dos filas del mismo
  // mes con días distintos.
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  // En dólares, tal como lo teclea la persona. La conversión a centavos se
  // hace aquí y no en el navegador: es el único sitio donde no se puede saltar.
  dolares: z.coerce.number().min(0).max(1_000_000),
  premios: z.coerce.number().int().min(0).max(10_000),
  nota: z.string().trim().max(200).nullable().optional(),
});

export async function POST(req: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 });
  }

  const parsed = Cuerpo.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Revisa el mes, el monto y la cantidad de premios.' },
      { status: 400 },
    );
  }

  const { mes, dolares, premios, nota } = parsed.data;
  // Math.round y no un truncado: 18430.99 dólares tiene que dar 1843099
  // centavos, no 1843098 por el redondeo binario de los decimales.
  const centavos = Math.round(dolares * 100);

  await sql`
    insert into app.monthly_payouts (mes, total_cents, premios, nota, updated_at)
    values (${`${mes}-01`}::date, ${centavos}, ${premios}, ${nota ?? null}, now())
    on conflict (mes) do update
      set total_cents = excluded.total_cents,
          premios     = excluded.premios,
          nota        = excluded.nota,
          updated_at  = now()
  `;

  refrescarPublico('jackpots');
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 });
  }
  const { mes } = (await req.json().catch(() => ({}))) as { mes?: string };
  if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return NextResponse.json({ ok: false, error: 'Mes no válido.' }, { status: 400 });
  }
  await sql`delete from app.monthly_payouts where mes = ${`${mes}-01`}::date`;
  refrescarPublico('jackpots');
  return NextResponse.json({ ok: true });
}
