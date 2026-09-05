#!/usr/bin/env node
/**
 * ¿DICE LA CARTELERA CUÁNDO ES CADA COSA, COMO LO DIRÍA UNA PERSONA?
 *
 * POR QUÉ EXISTE
 * --------------
 * La frase de debajo del título ("Hoy a las 9:00 p.m.") sale de combinar cuatro
 * columnas que casi siempre están medio vacías: puede haber fecha sin hora,
 * hora sin fecha, un rango de días con horas de cada día, o un evento que
 * empezó hace un mes y no acaba. Son muchas ramas para comprobarlas a ojo, y
 * cada una se ve UNA VEZ AL AÑO —el día que a alguien le toca— así que un fallo
 * ahí no lo encuentra nadie hasta que el cliente llega a la hora equivocada.
 *
 * Los casos de abajo llevan el texto esperado escrito a mano, a propósito: si
 * se calculara aquí con las mismas funciones, la prueba se aprobaría sola.
 *
 * CÓMO SE USA
 *
 *     node scripts/verificar-cartelera.mjs
 *
 * No toca la base ni levanta el servidor: es lógica pura, y por eso corre en
 * cada build sin costar tiempo.
 */

const { cuando, tramoDe, esDeHoy, agrupar } = await import('../src/lib/cartelera.ts');

/** Sábado 5 de septiembre de 2026. Todos los casos se leen contra este día. */
const HOY = '2026-09-05';

const e = (starts_on, ends_on, starts_at = null, ends_at = null) => ({
  starts_on,
  ends_on,
  starts_at,
  ends_at,
});

/** [evento, lo que tiene que salir, por qué importa este caso] */
const CASOS = [
  // --- Sin nada que decir --------------------------------------------------
  [e(null, null), null, 'una promoción permanente y sin hora no pinta línea'],

  // --- Hoy y mañana --------------------------------------------------------
  [e(HOY, null), 'Hoy', 'lo de hoy se dice "hoy", no "5 de septiembre"'],
  [e(HOY, HOY), 'Hoy', 'un solo día puesto como rango de un día es lo mismo'],
  [e(HOY, null, '21:00:00'), 'Hoy a las 9:00 p.m.', 'la hora como la devuelve Postgres'],
  [e(HOY, null, '21:00', '01:00'), 'Hoy, de 9:00 p.m. a 1:00 a.m.', 'cruza la medianoche'],
  [e('2026-09-06', null, '19:30'), 'Mañana a las 7:30 p.m.', 'mañana se dice "mañana"'],

  // --- La semana que viene -------------------------------------------------
  [
    e('2026-09-12', null, '21:00'),
    'El sábado 12 de septiembre a las 9:00 p.m.',
    'dentro de siete días se dice el día de la semana: así queda la gente',
  ],
  [
    e('2026-09-13', null),
    'El 13 de septiembre',
    'al día ocho el día de la semana ya no ayuda y se quita',
  ],
  [e('2026-10-02', null), 'El 2 de octubre', 'más adelante, solo día y mes'],
  [e('2027-01-01', null), 'El 1 de enero de 2027', 'el año solo cuando no es este'],

  // --- Lo que ya empezó ----------------------------------------------------
  [
    e('2026-09-01', null),
    'En curso',
    'empezó hace días y no acaba: la fecha de inicio se leía como algo pasado',
  ],
  [e('2026-09-01', HOY), 'Termina hoy', 'el último día se avisa'],
  [e('2026-09-01', '2026-09-06'), 'Termina mañana', 'y el penúltimo también'],
  [e('2026-09-01', '2026-09-30'), 'Hasta el 30 de septiembre', 'de un rango en curso importa el fin'],
  [e('2026-09-01', '2026-09-12'), 'Hasta el sábado 12 de septiembre', 'y el fin cercano lleva su día'],

  // --- Rangos por delante --------------------------------------------------
  [e('2026-09-12', '2026-09-15'), 'Del 12 al 15 de septiembre', 'el mes se dice una vez'],
  [
    e('2026-09-30', '2026-10-02'),
    'Del 30 de septiembre al 2 de octubre',
    'y dos veces cuando cambia de mes',
  ],
  [e(null, '2026-09-30'), 'Hasta el 30 de septiembre', 'sin fecha de inicio, solo el fin'],

  // --- Las horas con nombre propio y el singular de la una -----------------
  [e(HOY, null, '12:00'), 'Hoy a mediodía', 'no "a las 12:00 p.m.", que hace dudar'],
  [e(HOY, null, '00:00'), 'Hoy a medianoche', 'ni "a las 12:00 a.m."'],
  [e(HOY, null, '13:00'), 'Hoy a la 1:00 p.m.', 'la una va en singular'],
  [e(HOY, null, '10:00'), 'Hoy a las 10:00 a.m.', 'las diez no: empieza por uno pero es plural'],
  [e(HOY, null, null, '02:00'), 'Hoy hasta las 2:00 a.m.', 'solo hora de fin'],
  [e(HOY, null, null, '01:00'), 'Hoy hasta la 1:00 a.m.', 'solo hora de fin, en singular'],
  [e(null, null, '21:00'), 'A las 9:00 p.m.', 'todos los días a la misma hora, sin fecha'],
  [e(HOY, HOY, '21:00', '23:00'), 'Hoy, de 9:00 p.m. a 11:00 p.m.', 'el tramo entero de un día'],
];

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? '  ok  ' : 'FALLA '} ${que}${detalle ? `\n         ${detalle}` : ''}`);
};

for (const [evento, esperado, porque] of CASOS) {
  const salio = cuando(evento, HOY);
  comprobar(
    salio === esperado,
    porque,
    salio === esperado ? '' : `esperaba ${JSON.stringify(esperado)} y salió ${JSON.stringify(salio)}`,
  );
}

// --- En qué bloque de la cartelera cae cada uno ---------------------------
const TRAMOS = [
  [e(null, null), 'ahora', 'sin fecha de inicio está pasando siempre'],
  [e('2026-08-01', '2026-12-31'), 'ahora', 'empezó en agosto y sigue'],
  [e(HOY, null), 'ahora', 'lo que empieza hoy ya está pasando'],
  [e(HOY, null, '23:30'), 'ahora', 'aunque sea a las 11:30 de la noche: hoy se mira de día'],
  [e('2026-09-06', null), 'semana', 'mañana'],
  [e('2026-09-12', null), 'semana', 'el día siete entra'],
  [e('2026-09-13', null), 'despues', 'el día ocho ya no'],
];
for (const [evento, esperado, porque] of TRAMOS) {
  const salio = tramoDe(evento, HOY);
  comprobar(salio === esperado, `bloque: ${porque}`, salio === esperado ? '' : `salió "${salio}"`);
}

// --- La marca de "Hoy" ----------------------------------------------------
comprobar(esDeHoy(e(HOY, '2026-09-30'), HOY), 'lleva marca de hoy lo que empieza hoy');
comprobar(esDeHoy(e('2026-08-01', HOY), HOY), 'y lo que termina hoy');
comprobar(!esDeHoy(e('2026-08-01', '2026-09-30'), HOY), 'y no lo que solo pasa por hoy');

// --- El reparto y su orden ------------------------------------------------
//
// Lo que viene ordenado por `sort_order` desde la consulta tiene que salir
// ORDENADO POR FECHA en los bloques del futuro: en una cartelera lo primero es
// lo más cercano. Y entre dos del mismo día manda otra vez el orden del
// personal, que es lo que da la estabilidad del `sort`.
const lista = [
  { ...e('2026-10-20', null), id: 'lejano' },
  { ...e('2026-09-12', null, '21:00'), id: 'sabado-noche' },
  { ...e('2026-09-12', null, '10:00'), id: 'sabado-manana' },
  { ...e('2026-09-07', null), id: 'lunes' },
  { ...e('2026-08-01', '2026-12-31'), id: 'permanente' },
  { ...e('2026-10-05', null), id: 'octubre' },
];
const g = agrupar(lista, HOY);
comprobar(
  g.ahora.map((x) => x.id).join(',') === 'permanente',
  'en "ahora mismo" solo lo que ya empezó',
  g.ahora.map((x) => x.id).join(','),
);
comprobar(
  g.semana.map((x) => x.id).join(',') === 'lunes,sabado-manana,sabado-noche',
  'la semana sale por fecha y, dentro del día, por hora',
  g.semana.map((x) => x.id).join(','),
);
comprobar(
  g.despues.map((x) => x.id).join(',') === 'octubre,lejano',
  'y lo de más adelante, lo más cercano primero',
  g.despues.map((x) => x.id).join(','),
);
comprobar(
  g.ahora.length + g.semana.length + g.despues.length === lista.length,
  'no se pierde ni se duplica ningún evento por el camino',
);

const total = CASOS.length + TRAMOS.length + 7;
console.log(`\n${total} comprobaciones, ${fallos} ${fallos === 1 ? 'fallo' : 'fallos'}.`);
process.exit(fallos === 0 ? 0 : 1);
