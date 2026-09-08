#!/usr/bin/env node
/**
 * ¿DICE EL PANEL LO MISMO QUE EL TABLERO SOBRE QUÉ MÁQUINA SE PUBLICA?
 *
 * POR QUÉ EXISTE
 * --------------
 * El tablero público solo publica los montos de los últimos tres días, y la
 * pantalla del empleado tiene que poder explicar por qué una máquina se cayó.
 * Para eso `estadoMaquinaJackpot` repite el filtro de `getJackpots` — y repetir
 * una regla es exactamente donde se separan.
 *
 * Se separaron: la consulta compara INSTANTES (`reading_at > corte - 3 días`) y
 * el panel comparaba DÍAS DE CALENDARIO. En las horas de en medio contestaban
 * distinto, y el panel acusaba de "Fuera del tablero" a máquinas que sí estaban
 * en la página. El empleado ve una alarma falsa y vuelve a teclear un monto que
 * ya estaba publicado.
 *
 *     node scripts/verificar-tablero.mjs
 *
 * Lógica pura: no toca la base ni levanta el servidor. Corre en cada build.
 */

const { estadoMaquinaJackpot, VENTANA_TABLERO_DIAS } = await import('../src/lib/visibilidad.ts');

let fallos = 0;
let total = 0;
const comprobar = (ok, que, detalle = '') => {
  total++;
  if (!ok) fallos++;
  console.log(`${ok ? '  ok  ' : 'FALLA '} ${que}${detalle && !ok ? `\n         ${detalle}` : ''}`);
};

const DIA = 86_400_000;
// La lectura más reciente de todo el sistema: 8 de septiembre, 9:00 a.m. en
// Puerto Rico. La hora importa, que es justo el punto.
const CORTE = '2026-09-08T13:00:00.000Z';
const enInstante = (ms) => new Date(ms).toISOString();
const estado = (ultima, corte = CORTE) => estadoMaquinaJackpot({ ultima, corte });

comprobar(VENTANA_TABLERO_DIAS === 3, 'la ventana del tablero son 3 días');

// --- El caso que estaba mal -------------------------------------------------
{
  // Última lectura: el 5 de septiembre a las 8:00 p.m. de Puerto Rico.
  // La consulta la publica —faltan cinco horas para salirse de la ventana— y el
  // panel, contando por días de calendario, la daba por caída.
  const e = estado('2026-09-06T00:00:00.000Z');
  comprobar(e.visible === true,
    'una lectura de hace 2 días y 17 horas SE PUBLICA, y el panel lo dice',
    JSON.stringify(e));
}

// --- Los bordes -------------------------------------------------------------
const limite = Date.parse(CORTE) - VENTANA_TABLERO_DIAS * DIA;
comprobar(estado(enInstante(limite)).visible === false,
  'el instante exacto del límite queda FUERA (el > de la consulta es estricto)');
comprobar(estado(enInstante(limite + 1000)).visible === true,
  'un segundo después del límite, dentro');
comprobar(estado(enInstante(limite - 1000)).visible === false,
  'y un segundo antes, fuera');
comprobar(estado(CORTE).visible === true, 'la máquina que marca el corte está dentro');

// --- Lo que no se puede decidir --------------------------------------------
{
  const e = estado(null);
  comprobar(e.visible === false && /Sin monto/.test(e.etiqueta ?? ''),
    'una máquina sin ningún monto se dice "Sin monto", no "fuera del tablero"',
    JSON.stringify(e));
}
comprobar(estado('2026-09-06T00:00:00.000Z', null).visible === true,
  'sin corte todavía —la primera lectura del sistema— no se acusa a nadie de estar fuera');

// --- El mensaje ayuda de verdad --------------------------------------------
{
  const e = estado('2026-09-01T13:00:00.000Z');
  comprobar(e.visible === false, 'una lectura de hace una semana no se publica');
  comprobar(/1 de septiembre/.test(e.detalle ?? ''),
    'y el aviso dice de qué día es, en hora de Puerto Rico',
    e.detalle);
}

console.log(`\n${total} comprobaciones, ${fallos} ${fallos === 1 ? 'fallo' : 'fallos'}.`);
process.exit(fallos === 0 ? 0 : 1);
