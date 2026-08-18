import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Siembra los premios de los próximos días.
 *
 * Esto tiene que correr POR ADELANTADO, no en el momento de la primera tirada.
 * Si el instante ganador se sorteara al vuelo sobre las 24 horas del día, para
 * cuando alguien tira a las 3 de la tarde ya habría pasado en ~62% de los
 * casos — y esa persona ganaría casi siempre. `execute_spin` tiene una siembra
 * de emergencia que solo sortea sobre las horas QUE QUEDAN, pero deja un aviso
 * en risk_events porque significa que este cron no corrió.
 *
 * Se siembran 7 días de una vez para que el sistema aguante una semana entera
 * de fallos del cron sin que la promoción se rompa. Es idempotente.
 */
export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  const cabecera = req.headers.get('authorization') ?? '';

  // Sin esto, cualquiera podría llamar este endpoint. No revelaría el instante
  // ganador (no se devuelve), pero sí permitiría llenar la tabla de días
  // futuros basura.
  //
  // Comparación de tiempo constante, igual que la contraseña de admin: un
  // `!==` normal ramifica byte a byte y filtra por temporización cuánto del
  // secreto acertó el que llama.
  if (!secreto || !secretosCoinciden(cabecera, `Bearer ${secreto}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const dias = await sql<{ gaming_date: string; seeded_by: string; ya_existia: boolean }[]>`
    with objetivo as (
      select (app.gaming_date(now()) + d)::date as fecha
        from generate_series(0, 6) d
    ),
    existentes as (
      select gaming_date from app.daily_winner_slots
       where gaming_date in (select fecha from objetivo)
    )
    select s.gaming_date, s.seeded_by,
           (o.fecha in (select gaming_date from existentes)) as ya_existia
      from objetivo o
      cross join lateral app.seed_slot(o.fecha, 'cron') s
     order by s.gaming_date
  `;

  const nuevos = dias.filter((d) => !d.ya_existia).length;

  return NextResponse.json({
    ok: true,
    sembrados: nuevos,
    yaExistian: dias.length - nuevos,
    // Jamás se devuelve winning_moment_at. Este endpoint está protegido, pero
    // un secreto filtrado no debe además regalar la respuesta del juego.
    hasta: dias[dias.length - 1]?.gaming_date ?? null,
  });
}

// Se comparan los SHA-256, no las cadenas: timingSafeEqual exige búferes del
// mismo largo, y los digests siempre miden 32 bytes pase lo que pase.
function secretosCoinciden(a: string, b: string): boolean {
  const da = createHash('sha256').update(a, 'utf8').digest();
  const db = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(da, db);
}
