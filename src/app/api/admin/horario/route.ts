import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { esAdmin } from '@/lib/admin-auth';
import { refrescarPublico } from '@/lib/revalidar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * El horario del salón, la programación semanal y las excepciones.
 *
 * Tres cosas en una ruta porque las tres son "el horario" desde el panel y se
 * editan en la misma pantalla. `que` dice cuál.
 *
 * TODO ESTO SALE EN EL PIE DE TODAS LAS PÁGINAS, así que cualquier cambio
 * invalida la caché de todas — de ahí que `refrescarPublico('horario')` tenga
 * una lista larga. Sin eso, el dueño corrige el horario, mira la página y sigue
 * viendo el viejo durante un minuto, que es la forma más rápida de que deje de
 * confiar en el panel.
 */

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const Semana = z.object({
  que: z.literal('semana'),
  dias: z
    .array(
      z.object({
        dia: z.number().int().min(0).max(6),
        // null en las dos = cerrado ese día.
        abre: z.string().regex(HORA).nullable(),
        cierra: z.string().regex(HORA).nullable(),
      }),
    )
    .length(7),
});

const Excepcion = z.object({
  que: z.literal('excepcion'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cerrado: z.boolean(),
  abre: z.string().regex(HORA).nullable().optional(),
  cierra: z.string().regex(HORA).nullable().optional(),
  motivo: z.string().trim().max(120).nullable().optional(),
});

const ProgramaCuerpo = z.object({
  que: z.literal('programa'),
  id: z.string().uuid().optional(),
  titulo: z.string().trim().min(2).max(80),
  detalle: z.string().trim().max(300).nullable().optional(),
  dias: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  desde: z.string().regex(HORA),
  hasta: z.string().regex(HORA),
  cortesia: z.boolean(),
  icono: z.string().trim().max(8).nullable().optional(),
  activo: z.boolean(),
  orden: z.number().int().min(0).max(999).optional(),
});

const Cuerpo = z.discriminatedUnion('que', [Semana, Excepcion, ProgramaCuerpo]);

function no(mensaje: string, status = 400) {
  return NextResponse.json({ ok: false, error: mensaje }, { status });
}

export async function POST(req: NextRequest) {
  if (!(await esAdmin())) return no('No autorizado.', 401);

  const parsed = Cuerpo.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return no('Revisa los datos del horario.');
  const d = parsed.data;

  if (d.que === 'semana') {
    // Las siete filas de una vez, en una transacción: si se guardaran una a
    // una y fallara la cuarta, el salón quedaría con media semana nueva y
    // media vieja, que es peor que no haber guardado nada.
    await sql.begin(async (tx) => {
      for (const dia of d.dias) {
        const abre = dia.abre && dia.cierra ? dia.abre : null;
        const cierra = dia.abre && dia.cierra ? dia.cierra : null;
        await tx`
          insert into app.horario (dia, abre, cierra)
          values (${dia.dia}, ${abre}::time, ${cierra}::time)
          on conflict (dia) do update
            set abre = excluded.abre, cierra = excluded.cierra
        `;
      }
    });
    refrescarPublico('horario');
    return NextResponse.json({ ok: true });
  }

  if (d.que === 'excepcion') {
    if (!d.cerrado && (!d.abre || !d.cierra)) {
      return no('Si el día no está cerrado, escribe la hora de apertura y la de cierre.');
    }
    await sql`
      insert into app.horario_excepcion (fecha, abre, cierra, cerrado, motivo)
      values (
        ${d.fecha}::date,
        ${d.cerrado ? null : (d.abre ?? null)}::time,
        ${d.cerrado ? null : (d.cierra ?? null)}::time,
        ${d.cerrado},
        ${d.motivo ?? null}
      )
      on conflict (fecha) do update
        set abre = excluded.abre, cierra = excluded.cierra,
            cerrado = excluded.cerrado, motivo = excluded.motivo
    `;
    refrescarPublico('horario');
    return NextResponse.json({ ok: true });
  }

  // Programa.
  if (d.id) {
    await sql`
      update app.programa
         set titulo = ${d.titulo}, detalle = ${d.detalle ?? null},
             dias = ${d.dias}::smallint[], desde = ${d.desde}::time, hasta = ${d.hasta}::time,
             cortesia = ${d.cortesia}, icono = ${d.icono ?? null},
             activo = ${d.activo}, orden = ${d.orden ?? 0}
       where id = ${d.id}
    `;
  } else {
    await sql`
      insert into app.programa (titulo, detalle, dias, desde, hasta, cortesia, icono, activo, orden)
      values (${d.titulo}, ${d.detalle ?? null}, ${d.dias}::smallint[], ${d.desde}::time,
              ${d.hasta}::time, ${d.cortesia}, ${d.icono ?? null}, ${d.activo}, ${d.orden ?? 0})
    `;
  }
  refrescarPublico('horario');
  return NextResponse.json({ ok: true });
}

/** Borra una entrada del programa, o una excepción de fecha. */
export async function DELETE(req: NextRequest) {
  if (!(await esAdmin())) return no('No autorizado.', 401);

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const fecha = url.searchParams.get('fecha');

  if (id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return no('Identificador inválido.');
    await sql`delete from app.programa where id = ${id}`;
  } else if (fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return no('Fecha inválida.');
    await sql`delete from app.horario_excepcion where fecha = ${fecha}::date`;
  } else {
    return no('Falta qué borrar.');
  }

  refrescarPublico('horario');
  return NextResponse.json({ ok: true });
}
