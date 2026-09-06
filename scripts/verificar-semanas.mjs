#!/usr/bin/env node
/**
 * ¿CAE CADA PREMIO EN SU SEMANA, Y SE LLAMA COMO LO LLAMARÍA UNA PERSONA?
 *
 * POR QUÉ EXISTE
 * --------------
 * Agrupar por semanas parece trivial hasta que se mira de cerca: el domingo es
 * el ÚLTIMO día de su semana y no el primero (norma ISO), el año cambia a mitad
 * de semana, y una fecha suelta metida en `new Date` se corre un día entero
 * mirada desde Puerto Rico. Cada una de esas tres cosas pone un premio en la
 * semana equivocada sin dar ningún error.
 *
 *     node scripts/verificar-semanas.mjs
 *
 * Lógica pura: no toca la base ni levanta el servidor. Corre en cada build.
 */

const { lunesDe, tituloDeSemana, porSemanas } = await import('../src/lib/semanas.ts');

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? '  ok  ' : 'FALLA '} ${que}${detalle ? `\n         ${detalle}` : ''}`);
};

// Semana del lunes 31 de agosto al domingo 6 de septiembre de 2026.
const LUNES = '2026-08-31';
const DOMINGO = '2026-09-06';

// --- Cada día cae en el lunes que le toca ---------------------------------
for (const [dia, nombre] of [
  ['2026-08-31', 'el lunes'],
  ['2026-09-01', 'el martes'],
  ['2026-09-05', 'el sábado'],
  ['2026-09-06', 'el domingo, que es el ÚLTIMO día de su semana y no el primero'],
]) {
  const salio = lunesDe(dia);
  comprobar(salio === LUNES, `${nombre} pertenece a la semana del 31 de agosto`, salio === LUNES ? '' : salio);
}
comprobar(lunesDe('2026-09-07') === '2026-09-07', 'y el lunes siguiente ya es otra semana');

// --- Los títulos ----------------------------------------------------------
const HOY = '2026-09-05'; // sábado de la semana del 31 de agosto
const TITULOS = [
  [LUNES, 'Esta semana', 'la de hoy'],
  ['2026-08-24', 'La semana pasada', 'la anterior'],
  ['2026-08-17', 'Del 17 al 23 de agosto', 'más atrás, con el mes dicho una vez'],
  ['2026-09-28', 'Del 28 de septiembre al 4 de octubre', 'y dos veces cuando cruza de mes'],
  ['2025-12-29', 'Del 29 de diciembre de 2025 al 4 de enero', 'y con año cuando no es este'],
];
for (const [lunes, esperado, porque] of TITULOS) {
  const salio = tituloDeSemana(lunes, HOY);
  comprobar(salio === esperado, `título: ${porque}`, salio === esperado ? '' : `salió "${salio}"`);
}

// --- El reparto -----------------------------------------------------------
const premios = [
  { id: 'a', f: '2026-09-05' },
  { id: 'b', f: '2026-09-06' },
  { id: 'c', f: '2026-08-31' },
  { id: 'd', f: '2026-08-28' },
  { id: 'e', f: '2026-07-01' },
];
const g = porSemanas(premios, (x) => x.f, HOY);

comprobar(g.length === 3, 'salen tres semanas, no una por premio', `${g.length}`);
comprobar(
  g.map((s) => s.lunes).join(',') === '2026-08-31,2026-08-24,2026-06-29',
  'y de la más reciente a la más antigua',
  g.map((s) => s.lunes).join(','),
);
comprobar(
  g[0].items.map((x) => x.id).join(',') === 'a,b,c',
  'dentro de la semana se conserva el orden que traía la consulta',
  g[0].items.map((x) => x.id).join(','),
);
comprobar(g[0].titulo === 'Esta semana', 'la primera se llama "Esta semana"');
comprobar(g[0].domingo === DOMINGO, 'y sabe cuál es su domingo', g[0].domingo);
comprobar(
  g.reduce((n, s) => n + s.items.length, 0) === premios.length,
  'no se pierde ni se duplica ningún premio',
);
comprobar(porSemanas([], (x) => x.f, HOY).length === 0, 'sin premios no se inventa ninguna semana');

console.log(`\n17 comprobaciones, ${fallos} ${fallos === 1 ? 'fallo' : 'fallos'}.`);
process.exit(fallos === 0 ? 0 : 1);
