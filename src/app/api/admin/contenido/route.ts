import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { esAdmin } from '@/lib/admin-auth';
import { borrarImagen } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Contenido editable por el personal: eventos, máquinas nuevas y galería.
 *
 * Los tres van en una sola ruta porque son la misma operación (alta, cambio,
 * baja de una fila con una imagen) sobre tablas distintas. La lista de tablas
 * permitidas es CERRADA — el nombre de tabla nunca sale de lo que mande el
 * navegador.
 */

const fechaOpcional = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

const ESQUEMAS = {
  eventos: z.object({
    title: z.string().trim().min(2).max(140),
    body: z.string().trim().max(4000).nullable().optional(),
    image_path: z.string().trim().max(500).nullable().optional(),
    starts_on: fechaOpcional,
    ends_on: fechaOpcional,
    published: z.boolean().optional(),
    // Sale en el pop-up de entrada, antes de la tragamonedas.
    show_in_popup: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(999).optional(),
  }),
  maquinas: z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).nullable().optional(),
    image_path: z.string().trim().max(500).nullable().optional(),
    arrived_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    bank_number: z.number().int().min(0).max(32767).nullable().optional(),
    published: z.boolean().optional(),
  }),
  galeria: z.object({
    image_path: z.string().trim().min(1).max(500),
    caption: z.string().trim().max(300).nullable().optional(),
    sort_order: z.number().int().min(0).max(999).optional(),
  }),
} as const;

type Tipo = keyof typeof ESQUEMAS;

const TABLAS: Record<Tipo, string> = {
  eventos: 'events',
  maquinas: 'new_machines',
  galeria: 'gallery_items',
};

const esTipo = (t: unknown): t is Tipo => typeof t === 'string' && t in ESQUEMAS;

async function guardia() {
  return (await esAdmin())
    ? null
    : NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const no = await guardia();
  if (no) return no;

  const cuerpo = (await req.json().catch(() => ({}))) as { tipo?: unknown; datos?: unknown };
  if (!esTipo(cuerpo.tipo)) {
    return NextResponse.json({ ok: false, error: 'Tipo no válido.' }, { status: 400 });
  }

  const parsed = ESQUEMAS[cuerpo.tipo].safeParse(cuerpo.datos);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Faltan datos o alguno no es válido.' },
      { status: 400 },
    );
  }

  const tabla = TABLAS[cuerpo.tipo];
  const [fila] = await sql<{ id: string }[]>`
    insert into ${sql(`app.${tabla}`)} ${sql(parsed.data as Record<string, unknown>)}
    returning id
  `;

  return NextResponse.json({ ok: true, id: fila.id });
}

export async function PATCH(req: NextRequest) {
  const no = await guardia();
  if (no) return no;

  const cuerpo = (await req.json().catch(() => ({}))) as {
    tipo?: unknown;
    id?: unknown;
    datos?: unknown;
  };
  if (!esTipo(cuerpo.tipo) || typeof cuerpo.id !== 'string') {
    return NextResponse.json({ ok: false, error: 'Tipo o id no válido.' }, { status: 400 });
  }

  // .partial() para poder cambiar solo un campo (por ejemplo publicar/despublicar)
  // sin tener que reenviar la fila completa.
  const parsed = ESQUEMAS[cuerpo.tipo].partial().safeParse(cuerpo.datos);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ ok: false, error: 'Nada que cambiar.' }, { status: 400 });
  }

  const tabla = TABLAS[cuerpo.tipo];
  await sql`
    update ${sql(`app.${tabla}`)}
       set ${sql(parsed.data as Record<string, unknown>)}
     where id = ${cuerpo.id}::uuid
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const no = await guardia();
  if (no) return no;

  const cuerpo = (await req.json().catch(() => ({}))) as { tipo?: unknown; id?: unknown };
  if (!esTipo(cuerpo.tipo) || typeof cuerpo.id !== 'string') {
    return NextResponse.json({ ok: false, error: 'Tipo o id no válido.' }, { status: 400 });
  }

  const tabla = TABLAS[cuerpo.tipo];

  // Se recupera la ruta de la imagen ANTES de borrar la fila, para poder
  // limpiar el archivo del bucket y no ir dejando basura acumulada.
  const [fila] = await sql<{ image_path: string | null }[]>`
    delete from ${sql(`app.${tabla}`)}
     where id = ${cuerpo.id}::uuid
    returning image_path
  `;

  if (fila?.image_path) await borrarImagen(fila.image_path);

  return NextResponse.json({ ok: true });
}
