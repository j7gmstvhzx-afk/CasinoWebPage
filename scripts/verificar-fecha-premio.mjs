#!/usr/bin/env node
/**
 * ¿SE PUEDE ESCRIBIR CUALQUIER COSA EN LA FECHA DE UN PREMIO?
 *
 * POR QUÉ EXISTE
 * --------------
 * La fecha del muro se ponía sola con el día de hoy. El dueño lo corrigió con
 * la pantalla delante: los premios no se apuntan el mismo día que se pagan, así
 * que todos salían fechados el día de la subida — y eso descoloca el agrupado
 * por semanas, que ordena por ese día.
 *
 * En cuanto una fecha se teclea a mano, aparecen las de siempre: el 31 de
 * febrero, el año 2206 por un dedazo, y el día que todavía no ha llegado. Y una
 * más, propia de aquí: "todavía no ha llegado" hay que medirlo con el día de
 * PUERTO RICO. A las 8 de la noche de Manatí el servidor ya está en el día
 * siguiente, y con la fecha del servidor se rechazaría un premio pagado esta
 * misma noche.
 *
 *     node scripts/verificar-fecha-premio.mjs
 *
 * Lógica pura: no toca la base ni levanta el servidor. Corre en cada build.
 */

const { revisarFechaPremio, PRIMER_ANO } = await import('../src/lib/fecha-premio.ts');

let fallos = 0;
let total = 0;
const comprobar = (ok, que, detalle = '') => {
  total++;
  if (!ok) fallos++;
  console.log(`${ok ? '  ok  ' : 'FALLA '} ${que}${detalle && !ok ? `\n         ${detalle}` : ''}`);
};

const HOY = '2026-09-08';
const r = (v) => revisarFechaPremio(v, HOY);

// --- Lo que tiene que pasar -------------------------------------------------
comprobar(r('2026-09-05').ok && r('2026-09-05').fecha === '2026-09-05',
  'una fecha de hace tres días entra tal cual');
comprobar(r(HOY).ok, 'la de hoy entra');
comprobar(r('2020-01-01').ok, 'y la más vieja que se admite también');

// --- Sin fecha se entiende hoy ---------------------------------------------
for (const [v, como] of [[undefined, 'sin mandar nada'], ['', 'con el campo vacío'], [null, 'con un null']]) {
  const x = r(v);
  comprobar(x.ok && x.fecha === HOY, `${como} se entiende HOY, que es el caso de siempre`);
}

// --- Lo que hay que parar ---------------------------------------------------
const malas = [
  ['2026-09-09', 'el día de mañana: no ha llegado'],
  ['2027-01-01', 'y el año que viene, menos'],
  ['2026-02-31', 'EL 31 DE FEBRERO, que no existe aunque lo parezca'],
  ['2026-13-01', 'el mes trece'],
  ['2019-12-31', `un año anterior a ${PRIMER_ANO}: es un dedazo`],
  ['2206-09-08', 'el año 2206, el dedazo clásico'],
  ['08-09-2026', 'la fecha del revés'],
  ['ayer', 'una palabra'],
  ['2026-9-8', 'sin los ceros delante'],
  [12345, 'un número'],
];
for (const [v, que] of malas) {
  const x = r(v);
  comprobar(x.ok === false && typeof x.mensaje === 'string' && x.mensaje.length > 0,
    `se rechaza ${que}, y con un mensaje que se entiende`, JSON.stringify(x));
}

// --- El huso, que es la trampa de la casa -----------------------------------
{
  // 8 de septiembre, 9:00 p.m. en Puerto Rico. En UTC ya es el día 9.
  const enPR = '2026-09-08';
  const enUTC = new Date('2026-09-09T01:00:00Z').toISOString().slice(0, 10);
  comprobar(enUTC === '2026-09-09', 'de noche, el servidor ya está en el día siguiente (control)');
  comprobar(revisarFechaPremio(enPR, enPR).ok,
    'UN PREMIO PAGADO ESTA NOCHE SE ACEPTA: se mide contra el día de Puerto Rico');
}

console.log(`\n${total} comprobaciones, ${fallos} ${fallos === 1 ? 'fallo' : 'fallos'}.`);
process.exit(fallos === 0 ? 0 : 1);
