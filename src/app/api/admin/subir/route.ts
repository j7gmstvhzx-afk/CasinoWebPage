import { NextRequest, NextResponse } from 'next/server';
import { esAdmin } from '@/lib/admin-auth';
import { subirImagen } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 60;

/** Carpetas permitidas. Lista cerrada para que no se pueda escribir en cualquier sitio del bucket. */
const CARPETAS = new Set(['eventos', 'maquinas', 'galeria', 'menu']);

export async function POST(req: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const archivo = form?.get('archivo');
  const carpeta = String(form?.get('carpeta') ?? 'eventos');

  if (!(archivo instanceof File)) {
    return NextResponse.json({ ok: false, error: 'No recibimos ninguna imagen.' }, { status: 400 });
  }
  if (!CARPETAS.has(carpeta)) {
    return NextResponse.json({ ok: false, error: 'Carpeta no válida.' }, { status: 400 });
  }

  const r = await subirImagen(archivo, carpeta);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
