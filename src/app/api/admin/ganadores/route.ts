import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { esAdmin } from '@/lib/admin-auth';
import { refrescarPublico } from '@/lib/revalidar';
import { borrarImagen } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * El muro de ganadores.
 *
 * EL CONSENTIMIENTO NO ES UN CAMPO MÁS
 * ------------------------------------
 * Aquí se publica la cara y el nombre de una persona real en internet. La
 * columna `consentimiento_at` es `not null` en la base de datos, así que una
 * fila sin permiso ni siquiera se puede insertar — pero eso solo protege contra
 * el olvido, no contra el descuido. Por eso esta ruta EXIGE que quien guarda
 * marque la casilla de forma explícita en cada alta, en vez de heredarla de un
 * valor por defecto: la pregunta se hace, no se asume.
 */
const Cuerpo = z.object({
  id: z.string().uuid().optional(),
  nombre: z.string().trim().min(2).max(80),
  pueblo: z.string().trim().max(80).nullable().optional(),
  maquina: z.string().trim().max(120).nullable().optional(),
  // En dólares, como lo teclea una persona. A centavos aquí, que es el único
  // sitio donde no se puede saltar.
  dolares: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  gano_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  image_path: z.string().trim().max(500).nullable().optional(),
  // Tiene que llegar en true. No hay valor por defecto a propósito.
  consentimiento: z.literal(true),
  consentimiento_nota: z.string().trim().max(200).nullable().optional(),
  publicado: z.boolean(),
  orden: z.number().int().min(0).max(999).optional(),
});

function no(mensaje: string, status = 400) {
  return NextResponse.json({ ok: false, error: mensaje }, { status });
}

export async function POST(req: NextRequest) {
  if (!(await esAdmin())) return no('No autorizado.', 401);

  const parsed = Cuerpo.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    // El mensaje nombra el consentimiento porque es el fallo más probable y el
    // único que no se arregla escribiendo mejor: hay que ir a buscar el permiso.
    return no(
      'Revisa los datos. Recuerda que hace falta el permiso por escrito de la ' +
        'persona para poder publicarla.',
    );
  }

  const d = parsed.data;
  const centavos = d.dolares === null || d.dolares === undefined ? null : Math.round(d.dolares * 100);

  if (d.id) {
    await sql`
      update app.ganadores
         set nombre = ${d.nombre}, pueblo = ${d.pueblo ?? null},
             maquina = ${d.maquina ?? null}, monto_cents = ${centavos},
             gano_on = ${d.gano_on}::date, image_path = ${d.image_path ?? null},
             consentimiento_nota = ${d.consentimiento_nota ?? null},
             publicado = ${d.publicado}, orden = ${d.orden ?? 0}
       where id = ${d.id}
    `;
  } else {
    await sql`
      insert into app.ganadores
        (nombre, pueblo, maquina, monto_cents, gano_on, image_path,
         consentimiento_at, consentimiento_nota, publicado, orden)
      values
        (${d.nombre}, ${d.pueblo ?? null}, ${d.maquina ?? null}, ${centavos},
         ${d.gano_on}::date, ${d.image_path ?? null},
         now(), ${d.consentimiento_nota ?? null}, ${d.publicado}, ${d.orden ?? 0})
    `;
  }

  refrescarPublico('ganadores');
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await esAdmin())) return no('No autorizado.', 401);

  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return no('Identificador inválido.');

  // Se recupera la ruta ANTES de borrar la fila: después ya no hay forma de
  // saber qué archivo dejó huérfano en el bucket.
  const [fila] = await sql<{ image_path: string | null }[]>`
    select image_path from app.ganadores where id = ${id}
  `;
  await sql`delete from app.ganadores where id = ${id}`;
  if (fila?.image_path) await borrarImagen(fila.image_path).catch(() => undefined);

  refrescarPublico('ganadores');
  return NextResponse.json({ ok: true });
}
