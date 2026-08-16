/**
 * Lector del Excel "Tabla Premios App".
 *
 * La hoja del casino tiene tres columnas: `Nombre de máquina`,
 * `Jakpot actualizado` y `# de banco`. El objetivo es que el personal suba SU
 * archivo tal como está — sin renombrar columnas, sin reordenar, sin limpiar
 * nada. Cada requisito de formato que le pongamos encima es una forma nueva de
 * que la actualización de mañana falle a las 7 de la mañana.
 *
 * Por eso aquí se tolera: el encabezado mal escrito ("Jakpot" sin la c), filas
 * en blanco, montos con "$" y comas, filas de título antes de los encabezados,
 * y columnas en cualquier orden.
 */

export type FilaImportada = {
  fila: number;
  nombre: string;
  banco: number;
  centavos: number | null;
};

export type ResultadoLectura = {
  ok: true;
  filas: FilaImportada[];
  descartadas: { fila: number; motivo: string }[];
};

export type ErrorLectura = {
  ok: false;
  error: string;
};

type Celda = string | number | boolean | Date | null;

const normalizar = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes: "máquina" -> "maquina"
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * Reconoce la columna del monto.
 *
 * `ja.?kpot` acepta tanto "jackpot" como el "jakpot" que trae el archivo real.
 * Si algún día alguien corrige la errata en el Excel, sigue funcionando — que
 * es justo el punto.
 */
const ES_MONTO = /ja.?kpot|premio|monto|cantidad/;
const ES_NOMBRE = /nombredemaquina|maquina|nombre|juego/;
const ES_BANCO = /banco|bank/;

function aCentavos(valor: Celda): number | null {
  if (valor === null || valor === undefined || valor === '') return null;

  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor <= 0) return null;
    return Math.round(valor * 100);
  }

  // "$ 12,204.01" / "12204.01" / "$-" (la plantilla vacía trae guiones)
  const limpio = String(valor).replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  if (!limpio || limpio === '-' || limpio === '.') return null;

  const n = Number.parseFloat(limpio);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function aBanco(valor: Celda): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number.parseInt(String(valor).replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(n) || n < 0 || n > 32767) return null;
  return Math.trunc(n);
}

export function leerHoja(filas: Celda[][]): ResultadoLectura | ErrorLectura {
  if (!filas?.length) return { ok: false, error: 'El archivo está vacío.' };

  // Buscar la fila de encabezados en las primeras 10: algunas hojas traen un
  // título o el logo del casino antes de la tabla.
  let iEncabezado = -1;
  let cols = { nombre: -1, monto: -1, banco: -1 };

  for (let i = 0; i < Math.min(filas.length, 10); i++) {
    const candidato = { nombre: -1, monto: -1, banco: -1 };
    filas[i].forEach((celda, j) => {
      const n = normalizar(celda);
      if (!n) return;
      if (candidato.nombre === -1 && ES_NOMBRE.test(n)) candidato.nombre = j;
      else if (candidato.monto === -1 && ES_MONTO.test(n)) candidato.monto = j;
      else if (candidato.banco === -1 && ES_BANCO.test(n)) candidato.banco = j;
    });

    if (candidato.nombre !== -1 && candidato.banco !== -1) {
      iEncabezado = i;
      cols = candidato;
      break;
    }
  }

  if (iEncabezado === -1) {
    return {
      ok: false,
      error:
        'No encontramos los encabezados. La hoja debe tener una fila con ' +
        '"Nombre de máquina" y "# de banco".',
    };
  }

  const resultado: FilaImportada[] = [];
  const descartadas: { fila: number; motivo: string }[] = [];
  // (nombre|banco) ya visto -> se queda la primera aparición
  const vistas = new Set<string>();

  for (let i = iEncabezado + 1; i < filas.length; i++) {
    const numeroFila = i + 1; // como lo numera Excel, para que el mensaje sirva
    const fila = filas[i] ?? [];

    const nombre = String(fila[cols.nombre] ?? '').trim().replace(/\s+/g, ' ');
    if (!nombre) continue; // fila en blanco: se ignora en silencio

    const banco = aBanco(fila[cols.banco]);
    if (banco === null) {
      descartadas.push({ fila: numeroFila, motivo: `"${nombre}" no tiene número de banco` });
      continue;
    }

    // La identidad es nombre+banco: en la hoja real el banco 12, 30, 37 y 38
    // aparecen dos veces porque hay varias máquinas por banco.
    const clave = `${normalizar(nombre)}|${banco}`;
    if (vistas.has(clave)) {
      descartadas.push({ fila: numeroFila, motivo: `"${nombre}" (banco ${banco}) está repetida` });
      continue;
    }
    vistas.add(clave);

    resultado.push({
      fila: numeroFila,
      nombre,
      banco,
      // Sin monto NO es un error: es el estado normal de la plantilla. La
      // máquina se registra pero no se publica, en vez de salir en "$0.00".
      centavos: cols.monto === -1 ? null : aCentavos(fila[cols.monto]),
    });
  }

  if (resultado.length === 0) {
    return { ok: false, error: 'No encontramos ninguna máquina válida en la hoja.' };
  }

  return { ok: true, filas: resultado, descartadas };
}
