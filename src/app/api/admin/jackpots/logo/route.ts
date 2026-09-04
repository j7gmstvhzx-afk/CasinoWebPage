import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { esAdmin } from '@/lib/admin-auth';
import { borrarImagen } from '@/lib/storage';
import { refrescarPublico } from '@/lib/revalidar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

/**
 * El logo del juego de una máquina de jackpot.
 *
 * VA EN SU PROPIA RUTA, Y NO DENTRO DE /api/admin/jackpots/manual, porque son
 * dos tareas con ritmos distintos: los montos se teclean TODOS LOS DÍAS y el
 * logo se pone UNA VEZ en la vida de la máquina. Mezclarlas obligaría a mandar
 * el logo en cada guardado de montos, o a inventar un "solo cambia esto"
 * dentro de un cuerpo que ya es una lista de dieciocho importes.
 *
 * Tampoco cabe en /api/admin/contenido: esa ruta da de alta y baja FILAS de
 * contenido, y una máquina de jackpot no se crea ni se borra desde aquí — ya
 * existe, y lo único que cambia es su arte.
 */

const Cuerpo = z.object({
  id: z.string().uuid(),
  // null = quitar el logo. La máquina se queda con la ficha de la marca.
  image_path: z.string().trim().min(1).max(500).nullable(),
});

export async function PATCH(req: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 });
  }

  const parsed = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Datos inválidos.' }, { status: 400 });
  }

  const { id, image_path } = parsed.data;

  // Se recupera el logo anterior EN LA MISMA sentencia que escribe el nuevo.
  //
  // El `from app.machines vieja` no es un adorno: en un UPDATE, `returning`
  // devuelve la fila YA CAMBIADA, así que pedir ahí `image_path` daría el valor
  // nuevo y nunca sabríamos qué archivo quedó huérfano. Unir la tabla consigo
  // misma hace que `vieja` se lea de la foto anterior a la escritura, que es de
  // donde sale el valor que hay que limpiar.
  //
  // Y va en una sola sentencia, no en un leer-y-luego-escribir, porque entre
  // esas dos operaciones dos empleados a la vez podrían borrar el archivo que
  // el otro acaba de poner.
  const [fila] = await sql<{ anterior: string | null }[]>`
    update app.machines nueva
       set image_path = ${image_path}
      from app.machines vieja
     where nueva.id = ${id}::uuid
       and vieja.id = nueva.id
    returning vieja.image_path as anterior
  `;

  if (!fila) {
    return NextResponse.json({ ok: false, error: 'Esa máquina no existe.' }, { status: 404 });
  }

  // El archivo que se reemplaza se borra del bucket. Sin esto, cambiar un logo
  // tres veces deja tres archivos pagando espacio y ninguno los mira. La
  // comparación evita el caso tonto de borrar el que se acaba de guardar
  // cuando se vuelve a mandar el mismo.
  if (fila.anterior && fila.anterior !== image_path) {
    await borrarImagen(fila.anterior).catch(() => {});
  }

  refrescarPublico('jackpots');
  return NextResponse.json({ ok: true });
}
