#!/usr/bin/env node
/**
 * ¿ABIERTO O CERRADO? LA PREGUNTA QUE SALE EN LA PORTADA Y EN EL PIE DE TODAS.
 *
 * POR QUÉ EXISTE
 * --------------
 * Un casino que abre a las 8:00 a.m. y cierra a las 2:00 a.m. cierra AL DÍA
 * SIGUIENTE. Comparado a lo bruto, a las 11:30 p.m. la cuenta da "abierto" de
 * casualidad y a la 1:00 a.m. da "cerrado" con el salón lleno de gente. Es la
 * hora de más público, y el fallo no da ningún error: solo miente.
 *
 * Se prueba además la regla que faltaba en la API: un día con UNA SOLA hora se
 * guardaba como CERRADO en silencio, y el lunes amanecía anunciado como cerrado
 * en la portada, en el pie y en Contacto porque a alguien se le olvidó teclear
 * la hora de cierre.
 *
 *     node scripts/verificar-horario.mjs
 *
 * Lógica pura: no toca la base ni levanta el servidor. Corre en cada build.
 */

const { estadoDelSalon, reglaDe, franjaTexto, resumenSemana, diaAMedias, programaDelDia, diasTexto } =
  await import('../src/lib/horario.ts');

let fallos = 0;
// El total se CUENTA, no se escribe a mano: un número tecleado al final se
// queda atrás en cuanto se añade un caso, y entonces el resumen miente.
let total = 0;
const comprobar = (ok, que, detalle = '') => {
  total++;
  if (!ok) fallos++;
  console.log(`${ok ? '  ok  ' : 'FALLA '} ${que}${detalle && !ok ? `\n         ${detalle}` : ''}`);
};
const igual = (salio, esperado, que) =>
  comprobar(salio === esperado, que, `salió: ${JSON.stringify(salio)}`);

/**
 * Puerto Rico es UTC-4 todo el año, así que la hora de allí más cuatro es UTC.
 *
 * La suma va en MILISEGUNDOS y no pegando el número en la cadena: las 11:30
 * p.m. más cuatro son las "27:30", que no es una hora y `Date.parse` devuelve
 * NaN. Justo las horas de la noche, que son las que hay que probar.
 */
const enPR = (fecha, hhmm) => Date.parse(`${fecha}T${hhmm}:00Z`) + 4 * 3_600_000;

const dia = (abre, cierra) => ({ abre, cierra });
const semanaDe = (r) => ({ semana: [r, r, r, r, r, r, r], excepciones: {} });

// Lunes a domingo, 8:00 a.m. – 2:00 a.m. del día siguiente.
const TARDE = semanaDe(dia('08:00', '02:00'));

// --- La madrugada, que es donde se rompe -----------------------------------
{
  // Domingo 6 de septiembre de 2026, 11:30 p.m.
  const e = estadoDelSalon(TARDE, enPR('2026-09-06', '23:30'));
  comprobar(e.abierto === true, 'a las 11:30 p.m. está abierto');
  igual(e.cierraTexto, '2:00 a.m.', 'y dice que cierra a las 2:00 a.m.');
  igual(e.minutosParaCerrar, 150, 'con dos horas y media por delante');
}
{
  // La MISMA franja, ya pasada la medianoche: lunes 7 a la 1:00 a.m.
  const e = estadoDelSalon(TARDE, enPR('2026-09-07', '01:00'));
  comprobar(e.abierto === true, 'A LA 1:00 A.M. SIGUE ABIERTO: la franja es la de ayer');
  igual(e.minutosParaCerrar, 60, 'y le queda una hora');
}
{
  const e = estadoDelSalon(TARDE, enPR('2026-09-07', '02:00'));
  comprobar(e.abierto === false, 'a las 2:00 en punto ya cerró (el minuto del cierre no cuenta)');
  igual(e.cuandoAbre, 'hoy', 'y vuelve a abrir hoy');
  igual(e.abreTexto, '8:00 a.m.', 'a las 8:00 a.m.');
}
{
  const e = estadoDelSalon(TARDE, enPR('2026-09-07', '07:59'));
  comprobar(e.abierto === false, 'un minuto antes de abrir, cerrado');
}
{
  const e = estadoDelSalon(TARDE, enPR('2026-09-07', '08:00'));
  comprobar(e.abierto === true, 'y en el minuto de abrir, abierto');
}

// --- Abierto 24 horas -------------------------------------------------------
{
  const h = semanaDe(dia('00:00', '00:00'));
  const e = estadoDelSalon(h, enPR('2026-09-07', '03:00'));
  comprobar(e.abierto === true, 'la misma hora de apertura y cierre es abierto 24 horas');
  igual(franjaTexto(dia('00:00', '00:00')), 'Abierto 24 horas', 'y así se escribe');
}

// --- Días cerrados ----------------------------------------------------------
{
  // Cierra lunes (1) y martes (2). Hoy es lunes 7.
  const h = { semana: [dia('08:00', '02:00'), null, null, ...Array(4).fill(dia('08:00', '02:00'))], excepciones: {} };
  const e = estadoDelSalon(h, enPR('2026-09-07', '15:00'));
  comprobar(e.abierto === false, 'el día que cierra, cerrado');
  igual(e.cuandoAbre, 'miércoles', 'Y MIRA MÁS ALLÁ DE MAÑANA: si mañana también cierra, dice el miércoles');
}
{
  const vacia = { semana: [null, null, null, null, null, null, null], excepciones: {} };
  const e = estadoDelSalon(vacia, enPR('2026-09-07', '15:00'));
  comprobar(e.abierto === false && e.abreTexto === null,
    'sin un solo día con horario no se inventa una hora de apertura');
}

// --- Las excepciones mandan sobre el día de la semana -----------------------
{
  const h = { ...TARDE, excepciones: { '2026-09-07': null } };
  igual(reglaDe(h, '2026-09-07'), null, 'una excepción CERRADA gana al horario del lunes');
  comprobar(estadoDelSalon(h, enPR('2026-09-07', '15:00')).abierto === false,
    'y el salón sale cerrado ese día');
  comprobar(estadoDelSalon(h, enPR('2026-09-08', '15:00')).abierto === true,
    'pero solo ese día: el martes vuelve a abrir');
}
{
  const h = { ...TARDE, excepciones: { '2026-09-07': dia('10:00', '18:00') } };
  const e = estadoDelSalon(h, enPR('2026-09-07', '09:00'));
  comprobar(e.abierto === false && e.abreTexto === '10:00 a.m.',
    'una excepción con otro horario también manda');
}

// --- Cómo se escribe --------------------------------------------------------
igual(franjaTexto(dia('08:00', '00:00')), '8:00 a.m. – medianoche', 'medianoche se dice por su nombre');
igual(franjaTexto(null), 'Cerrado', 'y un día sin horario, "Cerrado"');
{
  const r = resumenSemana(TARDE);
  comprobar(r.length === 1, 'siete días iguales son UNA línea, no siete', JSON.stringify(r));
  igual(r[0].dias, 'Lunes a domingo', 'de lunes a domingo, como en un cartel');
}
{
  const h = { semana: [dia('10:00', '20:00'), ...Array(6).fill(dia('08:00', '02:00'))], excepciones: {} };
  const r = resumenSemana(h);
  comprobar(r.length === 2, 'y si el domingo es distinto, dos líneas', JSON.stringify(r));
  igual(r[1].dias, 'Domingo', 'la última es la del domingo solo');
}

// --- El día a medias, que se guardaba como cerrado --------------------------
{
  const completa = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dia: d, abre: '08:00', cierra: '02:00' }));
  igual(diaAMedias(completa), null, 'una semana con las dos horas de cada día pasa');

  const cerrados = completa.map((d) => ({ ...d, abre: null, cierra: null }));
  igual(diaAMedias(cerrados), null, 'y una semana entera cerrada también: cerrado son las DOS vacías');

  const soloAbre = completa.map((d, i) => (i === 1 ? { ...d, cierra: null } : d));
  igual(diaAMedias(soloAbre), 1, 'FALTA LA HORA DE CIERRE: se señala el día, no se guarda como cerrado');

  const soloCierra = completa.map((d, i) => (i === 6 ? { ...d, abre: null } : d));
  igual(diaAMedias(soloCierra), 6, 'y falta la de apertura, igual');

  igual(diaAMedias([]), null, 'sin días que revisar, nada que objetar');
}

// --- El programa que cruza medianoche --------------------------------------
{
  // Música en vivo de 10:00 p.m. a 2:00 a.m., todos los días.
  const musica = {
    id: 'm', titulo: 'Música en vivo', detalle: null,
    dias: [0, 1, 2, 3, 4, 5, 6], desde: '22:00', hasta: '02:00',
    cortesia: false, icono: null,
  };
  // Y el café de la mañana, que sí termina dentro del mismo día.
  const cafe = { ...musica, id: 'c', titulo: 'Café', desde: '07:00', hasta: '11:00' };

  const aLasTres = programaDelDia([musica, cafe], enPR('2026-09-07', '15:00'));
  const m = aLasTres.find((x) => x.id === 'm');
  const c = aLasTres.find((x) => x.id === 'c');
  comprobar(m.yaPaso === false,
    'A LAS 3 DE LA TARDE, LA MÚSICA DE ESTA NOCHE NO "YA PASÓ": todavía no ha empezado');
  comprobar(m.ahora === false, 'y tampoco está sonando');
  comprobar(c.yaPaso === true, 'pero el café de la mañana sí pasó, y se dice');

  const aMedianoche = programaDelDia([musica], enPR('2026-09-08', '00:30'));
  comprobar(aMedianoche[0].ahora === true, 'a las 12:30 a.m. la música SÍ está sonando');

  const aLasOnce = programaDelDia([musica], enPR('2026-09-07', '23:00'));
  comprobar(aLasOnce[0].ahora === true, 'y a las 11 de la noche también');

  const soloLunes = programaDelDia([{ ...musica, dias: [1] }], enPR('2026-09-08', '15:00'));
  comprobar(soloLunes.length === 0, 'lo que no es de hoy no sale (el 8 es martes)');
}

// --- Los días de lo que se repite cada semana ------------------------------
igual(diasTexto([0, 1, 2, 3, 4, 5, 6]), 'todos los días', 'la semana entera se dice "todos los días"');
igual(diasTexto([1]), 'los lunes', 'un solo día');
igual(diasTexto([6, 0]), 'los sábados y domingos', 'dos días, con "y" y sin coma');
igual(diasTexto([1, 3, 5]), 'los lunes, miércoles y viernes', 'tres, con comas y una "y" al final');
igual(diasTexto([0, 5, 6]), 'los viernes, sábados y domingos',
  'y en el orden del cartel: el domingo va al final, aunque por dentro sea el 0');
igual(diasTexto([]), '', 'sin días no se inventa nada');
igual(diasTexto([1, 1, 1]), 'los lunes', 'un día repetido se dice una vez');

console.log(`\n${total} comprobaciones, ${fallos} ${fallos === 1 ? 'fallo' : 'fallos'}.`);
process.exit(fallos === 0 ? 0 : 1);
