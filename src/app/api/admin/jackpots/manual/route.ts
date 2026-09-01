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

    // Fuera la lectura de hoy de TODAS las máquinas que vienen en la petición,
    // tengan monto o no: una por máquina por día.
    //
    // EL `any` VA SOBRE TODAS Y NO SÓLO SOBRE LAS QUE TRAEN MONTO.
    // Antes sólo borraba las que traían cifra, y eso hacía imposible corregir
    // un tecleo hacia abajo: vaciar la casilla de una máquina y guardar no
    // hacía nada — la cifra equivocada seguía publicada y no había forma de
    // quitarla desde el panel. Es la mitad del "no se puede borrar el premio
    // que ya existe" que reportó el dueño.
    const todos = filas.map((f) => f.id);
    await tx`
      delete from app.jackpot_readings
       where machine_id = any(${todos}::uuid[])
         and app.gaming_date(reading_at) = app.gaming_date(now())
    `;

    const conMonto = filas.filter((f) => f.centavos !== null && f.centavos > 0);
    if (conMonto.length === 0) return 0;

    const ids = conMonto.map((f) => f.id);
    const valores = conMonto.map((f) => f.centavos as number);

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

/**
 * Corregir el nombre o el banco de una máquina.
 *
 * Hacía falta porque el nombre y el banco se teclean UNA vez, al crear la
 * máquina, y hasta ahora no había forma de arreglarlos: una errata en "Lightning
 * Link" se quedaba publicada para siempre en la portada.
 */
const Editar = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(2).max(80).optional(),
  banco: z.number().int().min(0).max(32767).optional(),
});

export async function PATCH(req: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 });
  }

  const parsed = Editar.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Datos inválidos.' }, { status: 400 });
  }

  const { id, nombre, banco } = parsed.data;
  if (nombre === undefined && banco === undefined) {
    return NextResponse.json({ ok: false, error: 'Nada que cambiar.' }, { status: 400 });
  }

  // `machines_identity` es único sobre (name, bank_number): dos máquinas con el
  // mismo nombre y banco reventarían la consulta con un error de Postgres que
  // no le dice nada a quien está en el mostrador. Se comprueba antes y se
  // contesta en español.
  // Se compara contra los valores QUE VA A TENER la fila editada, no contra las
  // columnas de la fila candidata.
  //
  // Con `coalesce(${'$'}{nombre}, m.name)` la condición degeneraba en `m.name = m.name`
  // cuando sólo se mandaba uno de los dos campos: siempre cierta, así que
  // cualquier máquina con ese banco valía como choque y salía un 409 falso.
  // Ahora se lee la fila que se está editando y se rellena el hueco con lo que
  // ya tiene, que es lo que quedará guardado.
  const [actual] = await sql<{ name: string; bank_number: number }[]>`
    select name, bank_number from app.machines where id = ${id}::uuid
  `;
  if (!actual) {
    return NextResponse.json({ ok: false, error: 'Esa máquina ya no existe.' }, { status: 404 });
  }

  const nombreFinal = nombre ?? actual.name;
  const bancoFinal = banco ?? actual.bank_number;

  const [choque] = await sql<{ id: string }[]>`
    select m.id from app.machines m
     where m.name = ${nombreFinal}
       and m.bank_number = ${bancoFinal}
       and m.id <> ${id}::uuid
     limit 1
  `;
  if (choque) {
    return NextResponse.json(
      { ok: false, error: 'Ya hay otra máquina con ese nombre y ese banco.' },
      { status: 409 },
    );
  }

  await sql`
    update app.machines
       set name = ${nombreFinal}, bank_number = ${bancoFinal}
     where id = ${id}::uuid
  `;

  refrescarPublico('jackpots');
  return NextResponse.json({ ok: true });
}

/**
 * Quitar una máquina del tablero.
 *
 * NO SE BORRA LA FILA: se marca `active = false`.
 *
 * `jackpot_readings` cuelga de `machines` con `on delete cascade`, así que un
 * borrado de verdad se llevaría por delante todo el historial de montos de esa
 * máquina — y ese historial es lo que sostiene la flecha de "subió desde la
 * lectura anterior" y cualquier cuenta que se quiera hacer después. Una máquina
 * que sale del salón deja de publicarse; lo que ya pasó no se reescribe.
 */
export async function DELETE(req: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'Identificador inválido.' }, { status: 400 });
  }

  await sql`update app.machines set active = false where id = ${id}::uuid`;

  refrescarPublico('jackpots');
  return NextResponse.json({ ok: true });
}
