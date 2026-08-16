import { NextRequest, NextResponse } from 'next/server';
import readXlsxFile from 'read-excel-file/node';
import { sql } from '@/lib/db';
import { esAdmin } from '@/lib/admin-auth';
import { leerHoja, type FilaImportada } from '@/lib/importar-jackpots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;

type Celda = string | number | boolean | Date | null;

/**
 * Saca las filas de lo que devuelve read-excel-file.
 *
 * Comprobado contra la versión instalada: devuelve `[{ sheet, data }]`, un
 * arreglo de hojas, y NO las filas directamente como sugiere su documentación.
 * Otras versiones sí devuelven las filas. Se detecta la forma en tiempo de
 * ejecución en vez de fiarse de una u otra, porque equivocarse aquí rompe la
 * actualización de premios de todos los días y no lo atraparía ningún tipo.
 */
function primeraHoja(salida: unknown): Celda[][] {
  if (!Array.isArray(salida) || salida.length === 0) return [];

  const primero = salida[0];
  if (primero && typeof primero === 'object' && !Array.isArray(primero) && 'data' in primero) {
    return ((primero as { data: Celda[][] }).data ?? []) as Celda[][];
  }
  return salida as Celda[][];
}

/**
 * Importación del Excel de jackpots.
 *
 * Dos pasadas sobre el mismo archivo: primero `confirmar=false` para la vista
 * previa, y luego `confirmar=true` para aplicar. El archivo se manda dos veces
 * en vez de guardarlo entre llamadas — son unos pocos kilobytes, y así no hay
 * estado temporal que expirar, limpiar ni sincronizar entre lambdas.
 *
 * Nada llega a la página pública hasta que el empleado ve el resumen y
 * confirma. Publicar un archivo equivocado en el tablero es el error caro aquí.
 */
export async function POST(req: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const archivo = form?.get('archivo');
  const confirmar = form?.get('confirmar') === 'si';

  if (!(archivo instanceof File)) {
    return NextResponse.json({ ok: false, error: 'No recibimos ningún archivo.' }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'El archivo es demasiado grande (máximo 5 MB).' }, { status: 400 });
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());

  let filas: Celda[][];
  try {
    filas = archivo.name.toLowerCase().endsWith('.csv')
      ? leerCsv(buffer.toString('utf8'))
      : primeraHoja(await readXlsxFile(buffer));
  } catch {
    return NextResponse.json(
      { ok: false, error: 'No pudimos leer el archivo. Debe ser .xlsx o .csv.' },
      { status: 400 },
    );
  }

  const lectura = leerHoja(filas);
  if (!lectura.ok) return NextResponse.json({ ok: false, error: lectura.error }, { status: 400 });

  // Se comparan contra lo que ya existe para poder decir cuántas son nuevas.
  const existentes = await sql<{ name: string; bank_number: number }[]>`
    select name, bank_number from app.machines
  `;
  const conocidas = new Set(existentes.map((m) => `${m.name}|${m.bank_number}`));

  const nuevas = lectura.filas.filter((f) => !conocidas.has(`${f.nombre}|${f.banco}`));
  const conMonto = lectura.filas.filter((f) => f.centavos !== null);
  const sinMonto = lectura.filas.filter((f) => f.centavos === null);
  const desaparecidas = existentes.filter(
    (m) => !lectura.filas.some((f) => f.nombre === m.name && f.banco === m.bank_number),
  );

  const resumen = {
    total: lectura.filas.length,
    conMonto: conMonto.length,
    sinMonto: sinMonto.length,
    nuevas: nuevas.map((f) => `${f.nombre} (banco ${f.banco})`),
    desaparecidas: desaparecidas.map((m) => `${m.name} (banco ${m.bank_number})`),
    descartadas: lectura.descartadas,
    muestra: lectura.filas.slice(0, 8),
  };

  if (!confirmar) {
    return NextResponse.json({ ok: true, vistaPrevia: true, resumen });
  }

  await aplicar(lectura.filas);
  return NextResponse.json({ ok: true, vistaPrevia: false, resumen });
}

async function aplicar(filas: FilaImportada[]) {
  const nombres = filas.map((f) => f.nombre);
  const bancos = filas.map((f) => f.banco);

  await sql.begin(async (tx) => {
    // 1. Alta o reactivación de las máquinas de la hoja.
    await tx`
      insert into app.machines (name, bank_number, active)
      select t.name, t.bank_number, true
        from unnest(${nombres}::text[], ${bancos}::smallint[]) as t(name, bank_number)
      on conflict (name, bank_number) do update set active = true
    `;

    // 2. Las que ya no aparecen se marcan INACTIVAS, no se borran: se conserva
    //    su historial de premios, que es lo que alimenta el badge CALIENTE si
    //    la máquina vuelve al salón.
    await tx`
      update app.machines m
         set active = false
       where m.active
         and not exists (
           select 1 from unnest(${nombres}::text[], ${bancos}::smallint[]) as t(name, bank_number)
            where t.name = m.name and t.bank_number = m.bank_number
         )
    `;

    // 3. Una lectura nueva por cada máquina CON monto. Las que vienen en blanco
    //    no generan lectura: así no se publican, en vez de salir en "$0.00".
    const conMonto = filas.filter((f) => f.centavos !== null);
    if (conMonto.length) {
      await tx`
        insert into app.jackpot_readings (machine_id, amount_cents, reading_at)
        select m.id, t.centavos, now()
          from unnest(
                 ${conMonto.map((f) => f.nombre)}::text[],
                 ${conMonto.map((f) => f.banco)}::smallint[],
                 ${conMonto.map((f) => f.centavos!)}::bigint[]
               ) as t(name, bank_number, centavos)
          join app.machines m
            on m.name = t.name and m.bank_number = t.bank_number
        on conflict do nothing
      `;
    }
  });
}

/**
 * Lector de CSV mínimo.
 *
 * Cubre comillas dobles, comas dentro de comillas y saltos de línea dentro de
 * campos, que es todo lo que produce Excel al exportar. Se escribe a mano en
 * lugar de traer una dependencia para ~40 líneas.
 */
function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"'; // comilla escapada
          i++;
        } else enComillas = false;
      } else campo += c;
      continue;
    }

    if (c === '"') enComillas = true;
    else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else campo += c;
  }

  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}
