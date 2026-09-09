import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { esAdmin } from '@/lib/admin-auth';
import { refrescarPublico } from '@/lib/revalidar';
import { revisarFechaPremio } from '@/lib/fecha-premio';
import { conPlazo } from '@/lib/plazo-ruta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/*
 * El plazo de estas rutas. Escriben en la base, así que NO se reintentan:
 * cuando un guardado no contesta no se sabe si llegó, y repetirlo a ciegas
 * es apostar. Ver src/lib/plazo-ruta.ts.
 */
export const POST = conPlazo('guardar el ganador', manejarPost);
export const PATCH = conPlazo('guardar los cambios', manejarPatch);
export const DELETE = conPlazo('borrar el ganador', manejarDelete);

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
 * LA FECHA SE PIDE, PERO NO ES OBLIGATORIA
 * ----------------------------------------
 * Se ponía sola con el día de hoy, dando por hecho que un premio se apunta el
 * mismo día que se paga. El dueño lo corrigió: se apuntan cuando hay un rato,
 * así que todos salían fechados el día de la subida — cinco seguidos con la
 * misma fecha en el muro, y el agrupado por semanas descolocado, porque ordena
 * por ese día.
 *
 * Si viene, manda la que se teclea. Si no viene, sigue siendo HOY EN PUERTO
 * RICO y no en UTC: a las 8 de la noche de Manatí el servidor ya está en el día
 * siguiente, y un premio pagado el sábado por la noche se fecharía el domingo.
 */
const Cuerpo = z.object({
  id: z.string().uuid().optional(),
  pueblo: z.string().trim().min(2).max(60),
  // En dólares, como lo teclea una persona. A centavos aquí, que es el único
  // sitio donde no se puede saltar.
  dolares: z.coerce.number().min(0).max(1_000_000),
  publicado: z.boolean().optional(),
  // El día en que cayó el premio. La forma se comprueba aquí y el sentido en
  // `revisarFechaPremio`, que es quien sabe qué día es hoy en Puerto Rico.
  ganoEn: z.string().optional(),
});

function no(mensaje: string, status = 400) {
  return NextResponse.json({ ok: false, error: mensaje }, { status });
}

async function manejarPost(req: NextRequest) {
  if (!(await esAdmin())) return no('No autorizado.', 401);

  const parsed = Cuerpo.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return no('Escribe el pueblo y la cantidad.');

  const d = parsed.data;
  // Math.round y no truncado: 1200.99 dólares tiene que dar 120099 centavos, no
  // 120098 por el redondeo binario de los decimales.
  const centavos = Math.round(d.dolares * 100);

  const fecha = revisarFechaPremio(d.ganoEn);
  if (!fecha.ok) return no(fecha.mensaje);

  if (d.id) {
    await sql`
      update app.ganadores
         set pueblo = ${d.pueblo}, monto_cents = ${centavos},
             gano_on = ${fecha.fecha}::date,
             publicado = ${d.publicado ?? true}
       where id = ${d.id}
    `;
  } else {
    await sql`
      insert into app.ganadores (pueblo, monto_cents, gano_on, publicado)
      values (${d.pueblo}, ${centavos}, ${fecha.fecha}::date, ${d.publicado ?? true})
    `;
  }

  refrescarPublico('ganadores');
  return NextResponse.json({ ok: true });
}

/**
 * Ocultar un premio del muro, o volver a publicarlo.
 *
 * Sin esto, un ganador que no estuviera publicado SOLO SE PODÍA BORRAR: el
 * panel enseñaba la fila con un "(no sale)" en gris y el único botón al lado
 * era "Quitar". Quien quisiera esconder un premio un rato —porque se tecleó mal
 * la cifra, porque la persona pidió que no saliera— no tenía más remedio que
 * destruir el dato. Y una fila que llegara con `publicado = false` (las que
 * creó la migración 0015, o cualquiera metida por SQL) no había forma de
 * sacarla a la página.
 *
 * Se manda solo el estado nuevo, no la fila entera: así el botón no puede
 * pisar sin querer el pueblo ni la cantidad.
 *
 * TAMBIÉN CORRIGE LA FECHA
 * ------------------------
 * Los premios que se subieron antes de que existiera el campo de fecha
 * quedaron todos con el día de la subida. Sin poder corregirlos, la única
 * salida era borrarlos y volverlos a escribir. Se manda una cosa o la otra, y
 * lo que no venga no se toca.
 */
async function manejarPatch(req: NextRequest) {
  if (!(await esAdmin())) return no('No autorizado.', 401);

  const cuerpo = await req.json().catch(() => ({}));
  const parsed = z
    .object({
      id: z.string().uuid(),
      publicado: z.boolean().optional(),
      ganoEn: z.string().optional(),
    })
    .safeParse(cuerpo);
  if (!parsed.success) return no('Petición inválida.');

  const { id, publicado, ganoEn } = parsed.data;
  if (publicado === undefined && ganoEn === undefined) {
    return no('No hay nada que cambiar.');
  }

  // `undefined` aquí sería "poner NULL" para Postgres, así que la fecha se
  // revisa solo cuando viene y, si no viene, se le vuelve a escribir la que ya
  // tenía: `coalesce` con el valor de la columna deja la fila intacta.
  let fecha: string | null = null;
  if (ganoEn !== undefined) {
    const r = revisarFechaPremio(ganoEn);
    if (!r.ok) return no(r.mensaje);
    fecha = r.fecha;
  }

  const filas = await sql`
    update app.ganadores
       set publicado = coalesce(${publicado ?? null}::boolean, publicado),
           gano_on   = coalesce(${fecha}::date, gano_on)
     where id = ${id}
    returning id
  `;
  if (filas.length === 0) return no('Ese premio ya no existe. Recarga la página.', 404);

  refrescarPublico('ganadores');
  return NextResponse.json({ ok: true });
}

async function manejarDelete(req: NextRequest) {
  if (!(await esAdmin())) return no('No autorizado.', 401);

  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return no('Identificador inválido.');

  await sql`delete from app.ganadores where id = ${id}`;

  refrescarPublico('ganadores');
  return NextResponse.json({ ok: true });
}
