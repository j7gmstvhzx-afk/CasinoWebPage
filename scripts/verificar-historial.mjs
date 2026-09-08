#!/usr/bin/env node
/**
 * ¿DICE LA VERDAD EL HISTORIAL DE LA CUENTA?
 *
 * POR QUÉ EXISTE
 * --------------
 * Dos trampas, y las dos enseñan algo falso sin dar ningún error:
 *
 *  1. `status = 'issued'` NO quiere decir "todavía sirve". Nada recorre la
 *     tabla marcando lo vencido, así que un cupón caducado se queda en
 *     `issued` para siempre. Si la pantalla se fía de la columna, manda a
 *     alguien al casino a que le digan que no.
 *  2. Una fecha suelta metida en `new Date` se corre un día entera mirada
 *     desde Puerto Rico: el premio del sábado se anuncia como del viernes.
 *
 *     node scripts/verificar-historial.mjs
 *
 * Lógica pura: no toca la base ni levanta el servidor. Corre en cada build.
 */

const {
  estadoDeCupon,
  ETIQUETA_CUPON,
  CUPON_VIVO,
  diaPasado,
  desdeCuando,
  plural,
  tituloDePremios,
} = await import('../src/lib/historial-texto.ts');

let fallos = 0;
// El total se cuenta, no se escribe a mano: tecleado se queda atrás en cuanto
// se añade un caso, y el resumen pasa a mentir.
let total = 0;
const comprobar = (ok, que, detalle = '') => {
  total++;
  if (!ok) fallos++;
  console.log(`${ok ? '  ok  ' : 'FALLA '} ${que}${detalle ? `\n         ${detalle}` : ''}`);
};
const igual = (salio, esperado, que) =>
  comprobar(salio === esperado, que, salio === esperado ? '' : `salió: ${salio}`);

// Sábado 5 de septiembre de 2026, 3:00 p.m. en Puerto Rico.
const HOY = '2026-09-05';
const AHORA = Date.parse('2026-09-05T19:00:00Z');

// --- El estado del cupón ---------------------------------------------------
igual(estadoDeCupon('issued', '2026-09-12T04:00:00Z', AHORA), 'disponible',
  'un cupón emitido que aún no vence está disponible');
igual(estadoDeCupon('issued', '2026-09-01T04:00:00Z', AHORA), 'vencido',
  'UNO EMITIDO QUE YA PASÓ SU FECHA ESTÁ VENCIDO, aunque la columna siga en "issued"');
igual(estadoDeCupon('issued', '2026-09-05T19:00:00Z', AHORA), 'vencido',
  'y el instante exacto del vencimiento ya cuenta como vencido, no como el último segundo bueno');
igual(estadoDeCupon('redeemed', '2026-09-12T04:00:00Z', AHORA), 'canjeado',
  'uno canjeado se dice canjeado');
igual(estadoDeCupon('redeemed', '2026-01-01T04:00:00Z', AHORA), 'canjeado',
  'y sigue canjeado aunque su fecha ya pasara: se cobró a tiempo');
igual(estadoDeCupon('void', '2026-09-12T04:00:00Z', AHORA), 'anulado',
  'uno anulado se dice anulado, no "disponible"');
igual(estadoDeCupon('expired', '2026-09-12T04:00:00Z', AHORA), 'vencido',
  'y si la base ya lo marcó vencido, se respeta');

comprobar(
  Object.values(ETIQUETA_CUPON).every((t) => typeof t === 'string' && t.length > 0),
  'los cuatro estados tienen texto en español',
);
comprobar(
  CUPON_VIVO.disponible === true &&
    ['canjeado', 'vencido', 'anulado'].every((e) => CUPON_VIVO[e] === false),
  'SOLO el cupón disponible lleva enlace: los demás no tienen nada que abrir',
);

// --- Las fechas, mirando hacia atrás --------------------------------------
igual(diaPasado('2026-09-05', HOY), 'hoy', 'el día de hoy se llama "hoy"');
igual(diaPasado('2026-09-04', HOY), 'ayer', 'el de ayer, "ayer"');
igual(diaPasado('2026-09-01', HOY), 'el martes 1 de septiembre',
  'dentro de la última semana se dice el día de la semana');
igual(diaPasado('2026-08-30', HOY), 'el domingo 30 de agosto',
  'seis días atrás todavía se dice el día: no hay otro domingo cerca');
// El borde de verdad es el séptimo día: hoy es sábado, y el 29 de agosto
// también. "El sábado" a secas serían dos días distintos, así que ahí se corta.
igual(diaPasado('2026-08-29', HOY), 'el 29 de agosto',
  'A LOS SIETE DÍAS SE CORTA: repetir el nombre de hoy no ubica, confunde');
igual(diaPasado('2026-08-20', HOY), 'el 20 de agosto',
  'y más atrás, la fecha sola');
igual(diaPasado('2025-12-24', HOY), 'el 24 de diciembre de 2025',
  'y de otro año se dice el año');

// La trampa del huso: el 5 de septiembre es SÁBADO. `new Date('2026-09-05')`
// lo fija en medianoche UTC, que en Puerto Rico es el VIERNES a las 8 p.m.
igual(diaPasado('2026-08-31', HOY), 'el lunes 31 de agosto',
  'una fecha suelta no se corre un día (el 31 de agosto de 2026 fue lunes)');

// --- Los resúmenes ---------------------------------------------------------
igual(plural(1, 'día', 'días'), '1 día', 'un día va en singular');
igual(plural(0, 'día', 'días'), '0 días', 'cero va en plural, como se dice');
igual(plural(12, 'día', 'días'), '12 días', 'y doce también');

igual(desdeCuando(0, null, HOY), 'Tu primera tirada te está esperando.',
  'quien no ha jugado recibe una invitación, no un hueco');
igual(desdeCuando(1, '2026-09-05', HOY), 'Tu única tirada fue hoy.',
  'con una sola tirada no se dice "desde", que sonaría a meses');
igual(desdeCuando(12, '2026-08-20', HOY), 'Desde el 20 de agosto.',
  'con varias sí, y con la primera de todas');
comprobar(
  desdeCuando(5, null, HOY) === 'Tu primera tirada te está esperando.',
  'si falta la primera fecha no se inventa una',
);

igual(tituloDePremios(0), 'Todavía no has ganado', 'no haber ganado se dice entero');
igual(tituloDePremios(1), 'Ganaste una vez', 'una vez, en singular');
igual(tituloDePremios(3), 'Has ganado 3 veces', 'y varias, con el número');

console.log(`\n${total} comprobaciones, ${fallos} ${fallos === 1 ? 'fallo' : 'fallos'}.`);
process.exit(fallos === 0 ? 0 : 1);
