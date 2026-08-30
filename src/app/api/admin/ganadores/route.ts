import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { esAdmin } from '@/lib/admin-auth';
import { refrescarPublico } from '@/lib/revalidar';
import { hoyEnPR } from '@/lib/hora-pr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * El muro de ganadores: pueblo y cantidad.
 *
 * ESTA RUTA ERA TRES VECES MÁS LARGA
 * ----------------------------------
 * Guardaba nombre, foto, máquina, y exigía un `consentimiento: true` literal
 * para poder publicar la cara de una persona. Todo eso se fue con el nombre y
 * la foto: un pueblo y una cifra no identifican a nadie, así que no hay permiso
 * que pedir. Lo que queda es lo que hace falta.
 *
 * LA FECHA NO SE PIDE
 * -------------------
 * Se pone sola con el día de HOY EN PUERTO RICO, no en UTC: a las 8 de la noche
 * de Manatí el servidor ya está en el día siguiente, y un premio pagado el
 * sábado por la noche aparecería fechado el domingo.
 */
const Cuerpo = z.object({
  id: z.string().uuid().optional(),
  pueblo: z.string().trim().min(2).max(60),
  // En dólares, como lo teclea una persona. A centavos aquí, que es el único
  // sitio donde no se puede saltar.
  dolares: z.coerce.number().min(0).max(1_000_000),
  publicado: z.boolean().optional(),
});

function no(mensaje: string, status = 400) {
  return NextResponse.json({ ok: false, error: mensaje }, { status });
}

export async function POST(req: NextRequest) {
  if (!(await esAdmin())) return no('No autorizado.', 401);

  const parsed = Cuerpo.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return no('Escribe el pueblo y la cantidad.');

  const d = parsed.data;
  // Math.round y no truncado: 1200.99 dólares tiene que dar 120099 centavos, no
  // 120098 por el redondeo binario de los decimales.
  const centavos = Math.round(d.dolares * 100);

  if (d.id) {
    await sql`
      update app.ganadores
         set pueblo = ${d.pueblo}, monto_cents = ${centavos},
             publicado = ${d.publicado ?? true}
       where id = ${d.id}
    `;
  } else {
    await sql`
      insert into app.ganadores (pueblo, monto_cents, gano_on, publicado)
      values (${d.pueblo}, ${centavos}, ${hoyEnPR()}::date, ${d.publicado ?? true})
    `;
  }

  refrescarPublico('ganadores');
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await esAdmin())) return no('No autorizado.', 401);

  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return no('Identificador inválido.');

  await sql`delete from app.ganadores where id = ${id}`;

  refrescarPublico('ganadores');
  return NextResponse.json({ ok: true });
}
