/**
 * CUÁNDO ES ESTO — la cartelera dicha como la diría una persona.
 *
 * EL PROBLEMA
 * -----------
 * La página de eventos enseñaba "16 de agosto de 2026" debajo de cada
 * promoción. Es un dato correcto y es inútil: quien lo lee tiene que mirar el
 * calendario para saber si eso es hoy, es el sábado o ya pasó. Y la hora —lo
 * único que hace falta para decidir si venir— no estaba en ninguna parte, ni
 * siquiera se podía guardar: `app.events` no tenía columna de hora hasta la
 * migración 0020.
 *
 * Lo que se dice ahora es lo que diría el que atiende el teléfono: "hoy a las
 * 9:00 p.m.", "el sábado 12 de septiembre, de 9:00 p.m. a 1:00 a.m.", "hasta el
 * 30 de septiembre".
 *
 * TODO SE CALCULA CONTRA `hoy` EN HORA DE PUERTO RICO, y `hoy` entra como
 * parámetro en vez de leerse aquí dentro: así el servidor y el navegador pintan
 * exactamente el mismo texto (si cada uno mirara su reloj, en el minuto de la
 * medianoche saldrían cosas distintas y React tiraría la página abajo para
 * volver a pintarla).
 *
 * ESTE ARCHIVO NO DECIDE QUÉ SE VE. Eso lo sigue diciendo `visibilidad.ts` con
 * las FECHAS, y a propósito: una promoción no desaparece de la página a la hora
 * de su fin, se queda hasta que acaba el día. La hora es información, no filtro.
 */

import { DIAS, MESES, aMinutos, comoHora, diaSemanaDe, sumarDias } from './hora-pr';

export type CamposCartelera = {
  starts_on: string | null;
  ends_on: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

/** Cuántos días adelante cuentan como "esta semana" en la cartelera. */
export const DIAS_SEMANA = 7;

// =============================================================================
// La frase
// =============================================================================

/** "12 de septiembre". El año solo cuando no es el de hoy, que si no es ruido. */
function fechaLarga(f: string, hoy: string): string {
  const [anio, mes, dia] = f.split('-');
  const nombre = MESES[Number(mes) - 1] ?? '';
  const base = `${Number(dia)} de ${nombre}`;
  return anio === hoy.slice(0, 4) ? base : `${base} de ${anio}`;
}

/**
 * "hoy", "mañana", "el sábado 12 de septiembre", "el 12 de octubre".
 *
 * Dentro de los próximos siete días se dice el DÍA DE LA SEMANA, porque es como
 * la gente decide: nadie queda "el 12", queda "el sábado". Más allá de una
 * semana el día de la semana ya no ayuda —hay que contar— y solo alarga.
 */
function fechaCorta(f: string, hoy: string): string {
  if (f === hoy) return 'hoy';
  if (f === sumarDias(hoy, 1)) return 'mañana';
  if (f > hoy && f <= sumarDias(hoy, DIAS_SEMANA)) {
    return `el ${DIAS[diaSemanaDe(f)]} ${fechaLarga(f, hoy)}`;
  }
  return `el ${fechaLarga(f, hoy)}`;
}

/** "las 9:00 p.m.", "la 1:00 a.m.", "medianoche". */
function conArticulo(minutos: number): string {
  const h = comoHora(minutos);
  // `comoHora` ya devuelve las dos horas con nombre propio, y esas no llevan
  // artículo: "a medianoche", no "a las medianoche".
  if (h === 'medianoche' || h === 'mediodía') return h;
  // La una va en singular. `startsWith('1:')` acierta solo con la una: las
  // diez, las once y las doce traen otro carácter en esa posición.
  return h.startsWith('1:') ? `la ${h}` : `las ${h}`;
}

/** "de 9:00 p.m. a 1:00 a.m." · "a las 9:00 p.m." · "hasta la 1:00 a.m." */
function tramoHoras(desde: string | null, hasta: string | null): string | null {
  const a = aMinutos(desde);
  const b = aMinutos(hasta);
  if (a !== null && b !== null) return `de ${comoHora(a)} a ${comoHora(b)}`;
  if (a !== null) return `a ${conArticulo(a)}`;
  if (b !== null) return `hasta ${conArticulo(b)}`;
  return null;
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** La parte de los días, sin la hora. Devuelve null si el evento no tiene fechas. */
function tramoDias(e: CamposCartelera, hoy: string): string | null {
  const { starts_on: inicio, ends_on: fin } = e;

  if (!inicio && !fin) return null;

  // Sin fecha de inicio: lo único que se sabe es hasta cuándo.
  if (!inicio) return `hasta ${fechaCorta(fin!, hoy)}`;

  const unSoloDia = !fin || fin === inicio;

  if (unSoloDia) {
    // Empezó antes de hoy y no tiene fin: la fecha de inicio ya no informa de
    // nada y encima se lee como algo pasado. Se dice lo que es.
    if (inicio < hoy) return 'en curso';
    return fechaCorta(inicio, hoy);
  }

  // Rango que ya empezó: lo que importa es cuándo se acaba.
  if (inicio <= hoy) {
    if (fin === hoy) return 'termina hoy';
    if (fin === sumarDias(hoy, 1)) return 'termina mañana';
    return `hasta ${fechaCorta(fin, hoy)}`;
  }

  // Rango entero por delante. El mes se dice una sola vez cuando es el mismo:
  // "del 12 al 15 de septiembre", no "del 12 de septiembre al 15 de septiembre".
  const mismoMes = inicio.slice(0, 7) === fin.slice(0, 7);
  const desde = mismoMes ? String(Number(inicio.slice(8, 10))) : fechaLarga(inicio, hoy);
  return `del ${desde} al ${fechaLarga(fin, hoy)}`;
}

/**
 * "Hoy a las 9:00 p.m." — la línea que va debajo del título.
 *
 * `null` cuando no hay ni fechas ni horas que decir: entonces la tarjeta no
 * pinta la línea, en vez de pintar un guion.
 */
export function cuando(e: CamposCartelera, hoy: string): string | null {
  const dias = tramoDias(e, hoy);
  const horas = tramoHoras(e.starts_at, e.ends_at);

  if (!dias && !horas) return null;
  if (!dias) return mayuscula(horas!);
  if (!horas) return mayuscula(dias);

  // "Hoy a las 9:00 p.m." va sin coma —es una frase sola— pero "El sábado 12 de
  // septiembre, de 9:00 p.m. a 1:00 a.m." la necesita para respirar.
  const pegado = horas.startsWith('a ') || horas.startsWith('hasta ');
  return mayuscula(pegado ? `${dias} ${horas}` : `${dias}, ${horas}`);
}

// =============================================================================
// Los grupos
// =============================================================================

export type Tramo = 'ahora' | 'semana' | 'despues';

/**
 * ¿En qué bloque de la cartelera va?
 *
 * - `ahora`   — está pasando: ya empezó (o no tiene fecha de inicio).
 * - `semana`  — empieza dentro de los próximos siete días.
 * - `despues` — empieza más adelante.
 *
 * Se mira SOLO la fecha de inicio, nunca la hora: un evento de las 9:00 p.m.
 * está "hoy" desde que sale el sol, que es cuando la gente lo mira para decidir
 * si viene esta noche.
 */
export function tramoDe(e: CamposCartelera, hoy: string): Tramo {
  if (!e.starts_on || e.starts_on <= hoy) return 'ahora';
  return e.starts_on <= sumarDias(hoy, DIAS_SEMANA) ? 'semana' : 'despues';
}

/** ¿Lleva la marca de "Hoy"? Empieza o termina hoy mismo. */
export function esDeHoy(e: CamposCartelera, hoy: string): boolean {
  return e.starts_on === hoy || e.ends_on === hoy;
}

/**
 * Reparte la lista en los tres bloques.
 *
 * Lo que ya está pasando conserva el orden que trae la consulta (`sort_order`,
 * el que el personal decide). Lo que está por venir se ordena por FECHA: en una
 * cartelera lo primero es lo más cercano, y un orden manual ahí solo serviría
 * para esconder el evento del sábado detrás del del mes que viene.
 *
 * `sort` de JavaScript es estable, así que entre dos eventos del mismo día
 * sigue mandando el orden del personal.
 */
export function agrupar<T extends CamposCartelera>(
  eventos: T[],
  hoy: string,
): { ahora: T[]; semana: T[]; despues: T[] } {
  const grupos = { ahora: [] as T[], semana: [] as T[], despues: [] as T[] };
  for (const e of eventos) grupos[tramoDe(e, hoy)].push(e);

  const porFecha = (a: T, b: T) =>
    (a.starts_on ?? '').localeCompare(b.starts_on ?? '') ||
    (aMinutos(a.starts_at) ?? 0) - (aMinutos(b.starts_at) ?? 0);

  grupos.semana.sort(porFecha);
  grupos.despues.sort(porFecha);
  return grupos;
}

/**
 * Las `n` promociones más cercanas, para el trozo de cartelera de la portada.
 *
 * La portada solo tiene sitio para tres, y las escogía la consulta por el
 * `sort_order` que el personal hubiera puesto a mano. Con la cartelera repartida
 * por fechas eso se convirtió en un problema visible: la fiesta de octubre podía
 * ocupar las tres tarjetas y la música en vivo de ESTA NOCHE quedarse fuera,
 * porque alguien le puso un número más alto en marzo.
 *
 * El orden es el mismo que el de la cartelera —lo que está pasando, luego esta
 * semana, luego lo de más adelante— así que las dos páginas cuentan la misma
 * historia y la portada nunca esconde lo de hoy.
 */
export function masCercanos<T extends CamposCartelera>(
  eventos: T[],
  hoy: string,
  n: number,
): T[] {
  const { ahora, semana, despues } = agrupar(eventos, hoy);
  return [...ahora, ...semana, ...despues].slice(0, n);
}
