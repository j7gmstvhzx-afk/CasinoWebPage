/**
 * EL MURO DE GANADORES, REPARTIDO POR SEMANAS.
 *
 * POR QUÉ POR SEMANAS Y NO POR MESES O POR DÍAS
 * ----------------------------------------------
 * Es la unidad en la que la gente piensa cuando pregunta "¿y últimamente?".
 * Por días saldrían veinte grupos de uno; por meses, un montón indistinguible
 * en el que no se nota si el salón está pagando ahora o pagó en agosto. La
 * semana deja ver el ritmo: cuántos premios y cuánto, semana a semana.
 *
 * LA SEMANA EMPIEZA EL LUNES
 * --------------------------
 * Es la norma internacional (ISO 8601) y es como se habla aquí: "el fin de
 * semana" son los días con los que ACABA la semana, no los que la abren. Si
 * empezara el domingo, un premio del sábado y otro del domingo siguiente —dos
 * días seguidos, el mismo fin de semana— caerían en grupos distintos.
 *
 * TODO SE HACE CON CADENAS 'YYYY-MM-DD', NUNCA CON `new Date`
 * -----------------------------------------------------------
 * La fecha de un premio es un DÍA DE CALENDARIO, no un instante.
 * `new Date('2026-09-05')` lo lee como medianoche UTC, que en Puerto Rico es el
 * día anterior a las 8 p.m.: un premio del sábado se agruparía en la semana
 * anterior. Aquí se corta la cadena y se cuenta con `sumarDias`, que va en UTC
 * puro y no lo mueve ningún huso.
 */

import { MESES, diaSemanaDe, sumarDias } from './hora-pr';

export type Semana<T> = {
  /** El lunes de esa semana, 'YYYY-MM-DD'. Sirve de clave. */
  lunes: string;
  /** El domingo. */
  domingo: string;
  /** "Esta semana", "La semana pasada", "Del 24 al 30 de agosto". */
  titulo: string;
  /** Lo que cayó esa semana, en el orden en que venía. */
  items: T[];
};

/** El lunes de la semana en la que cae `fecha`. */
export function lunesDe(fecha: string): string {
  // `diaSemanaDe` devuelve 0 para el domingo, como `extract(dow)` de Postgres.
  // El domingo está a SEIS días de su lunes, no a menos uno: es el último día
  // de su semana, no el primero.
  const dow = diaSemanaDe(fecha);
  return sumarDias(fecha, dow === 0 ? -6 : 1 - dow);
}

/** "24 de agosto" — el año solo cuando no es el de hoy, que si no es ruido. */
function diaYMes(f: string, hoy: string): string {
  const [anio, mes, dia] = f.split('-');
  const base = `${Number(dia)} de ${MESES[Number(mes) - 1] ?? ''}`;
  return anio === hoy.slice(0, 4) ? base : `${base} de ${anio}`;
}

/**
 * Cómo se llama esa semana. Las dos más recientes tienen nombre propio porque
 * es lo que diría cualquiera; de ahí para atrás, las fechas.
 */
export function tituloDeSemana(lunes: string, hoy: string): string {
  const estaSemana = lunesDe(hoy);
  if (lunes === estaSemana) return 'Esta semana';
  if (lunes === sumarDias(estaSemana, -7)) return 'La semana pasada';

  const domingo = sumarDias(lunes, 6);
  // El mes se dice una sola vez cuando la semana no lo cruza: "del 24 al 30 de
  // agosto", no "del 24 de agosto al 30 de agosto".
  const mismoMes = lunes.slice(0, 7) === domingo.slice(0, 7);
  const desde = mismoMes ? String(Number(lunes.slice(8, 10))) : diaYMes(lunes, hoy);
  return `Del ${desde} al ${diaYMes(domingo, hoy)}`;
}

/**
 * Reparte una lista ya ordenada de más nuevo a más viejo en semanas.
 *
 * Se conserva ese orden: las semanas salen de la más reciente a la más antigua
 * y, dentro de cada una, los elementos como venían. No se reordena nada, para
 * que el orden que decidió la consulta siga mandando.
 *
 * Las semanas SIN nada no se inventan: si no hubo premios una semana, esa
 * semana no existe en la lista. Un desplegable vacío es una promesa incumplida.
 */
export function porSemanas<T>(
  items: T[],
  fechaDe: (x: T) => string,
  /** El día de hoy en Puerto Rico. Entra como parámetro para que el servidor y
   *  el navegador escriban el mismo título; si cada uno mirara su reloj, en la
   *  medianoche del domingo saldrían cosas distintas. */
  hoy: string,
): Semana<T>[] {
  const porLunes = new Map<string, T[]>();
  for (const item of items) {
    const lunes = lunesDe(fechaDe(item));
    const grupo = porLunes.get(lunes);
    if (grupo) grupo.push(item);
    else porLunes.set(lunes, [item]);
  }

  return [...porLunes.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([lunes, items]) => ({
      lunes,
      domingo: sumarDias(lunes, 6),
      titulo: tituloDeSemana(lunes, hoy),
      items,
    }));
}
