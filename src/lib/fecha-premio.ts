import { hoyEnPR } from './hora-pr';

/**
 * ¿Vale esta fecha como el día en que cayó un premio?
 *
 * POR QUÉ EXISTE
 * --------------
 * La fecha del muro se ponía sola con el día de hoy, porque se dio por hecho
 * que los premios se apuntan el mismo día que se pagan. No es así: se apuntan
 * cuando alguien tiene un rato, y entonces todos salen fechados el día de la
 * subida. En el muro se ve enseguida —cinco premios seguidos con la misma
 * fecha— y encima descoloca el agrupado por semanas, que ordena por ese día.
 *
 * Así que ahora se teclea. Y en cuanto se teclea, hay que revisarla: una fecha
 * escrita a mano es la puerta de "31 de febrero" y de premios del año 2206 por
 * un dedazo en el teclado.
 *
 * La misma función la usan el panel y la API. El panel para avisar antes de
 * mandar, la API porque es la única que manda de verdad.
 */

/** Antes de esto no había casino que apuntar. Un año más viejo es un dedazo. */
export const PRIMER_ANO = 2020;

export type Revision = { ok: true; fecha: string } | { ok: false; mensaje: string };

/** ¿Existe ese día en el calendario? Atrapa el 31 de febrero y el mes 13. */
function esDiaReal(f: string): boolean {
  const [a, m, d] = f.split('-').map(Number);
  // Se reconstruye y se compara: Date.UTC(2026, 1, 31) no falla, se desborda
  // al 3 de marzo. Si la vuelta no da la misma cadena, el día no existía.
  return new Date(Date.UTC(a, m - 1, d)).toISOString().slice(0, 10) === f;
}

export function revisarFechaPremio(crudo: unknown, hoy: string = hoyEnPR()): Revision {
  if (crudo === undefined || crudo === null || crudo === '') {
    // Sin fecha se entiende hoy, que es el caso de siempre: se paga y se apunta.
    return { ok: true, fecha: hoy };
  }
  if (typeof crudo !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(crudo)) {
    return { ok: false, mensaje: 'Escribe la fecha como año-mes-día.' };
  }
  if (!esDiaReal(crudo)) {
    return { ok: false, mensaje: 'Ese día no existe en el calendario. Revísalo.' };
  }
  if (crudo > hoy) {
    // Se compara contra la fecha de PUERTO RICO, no contra la del servidor: a
    // las 8 de la noche de Manatí el servidor ya está en el día siguiente, y
    // rechazaría un premio pagado esta misma noche.
    return { ok: false, mensaje: 'Esa fecha todavía no ha llegado.' };
  }
  if (Number(crudo.slice(0, 4)) < PRIMER_ANO) {
    return { ok: false, mensaje: `El año tiene que ser de ${PRIMER_ANO} en adelante.` };
  }
  return { ok: true, fecha: crudo };
}
