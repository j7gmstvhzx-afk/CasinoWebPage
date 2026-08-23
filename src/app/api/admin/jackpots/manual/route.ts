import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { esAdmin } from '@/lib/admin-auth';
import { refrescarPublico } from '@/lib/revalidar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

/**
 * Entrada manual de los montos del día.
 *
 * Es la vía principal: los progresivos NO suben solos en la página. El personal
 * los lee del salón y los escribe aquí una vez al día. El tablero público los
 * ordena de mayor a menor automáticamente.
 *
 * Guardar de nuevo el mismo día REEMPLAZA la lectura de hoy en vez de añadir
 * otra. Así corregir un tecleo no ensucia el historial ni descuadra la flecha
 * de "subió desde ayer", que compara contra la lectura del día anterior.
 */

const Cuerpo = z.object({
  montos: z
    .array(
      z.object({
        id: z.string().uuid(),
        // null = "hoy no tengo este dato". No se publica, en vez de $0.00.
        centavos: z.number().int().min(0).max(99_999_999).nullable(),
      }),
    )
    .max(500),
  nueva: z
    .object({
      nombre: z.string().trim().min(2).max(80),
      banco: z.number().int().min(0).max(32767),
      centavos: z.number().int().min(0).max(99_999_999).nullable(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 });
  }

  const parsed = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Datos inválidos.' }, { status: 400 });
  }

  const { montos, nueva } = parsed.data;

  const guardados = await sql.begin(async (tx) => {
    let filas = montos;

    if (nueva) {
      const [m] = await tx<{ id: string }[]>`
        insert into app.machines (name, bank_number, active)
        values (${nueva.nombre}, ${nueva.banco}, true)
        on conflict (name, bank_number) do update set active = true
        returning id
      `;
      filas = [...filas, { id: m.id, centavos: nueva.centavos }];
    }

    const conMonto = filas.filter((f) => f.centavos !== null && f.centavos > 0);
    if (conMonto.length === 0) return 0;

    const ids = conMonto.map((f) => f.id);
    const valores = conMonto.map((f) => f.centavos as number);

    // Fuera la lectura de hoy, si ya había: una por máquina por día.
    await tx`
      delete from app.jackpot_readings
       where machine_id = any(${ids}::uuid[])
         and app.gaming_date(reading_at) = app.gaming_date(now())
    `;

    await tx`
      insert into app.jackpot_readings (machine_id, amount_cents, reading_at)
      select t.id, t.centavos, now()
        from unnest(${ids}::uuid[], ${valores}::bigint[]) as t(id, centavos)
    `;

    return conMonto.length;
  });

  refrescarPublico('jackpots');
  return NextResponse.json({ ok: true, guardados });
}
