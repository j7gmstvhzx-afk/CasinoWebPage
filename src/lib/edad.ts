import { PROMO } from './site';
import { hoyEnPR } from './hora-pr';

/**
 * La edad, contada en el calendario de Puerto Rico y no en el del servidor.
 *
 * El servidor corre en UTC, y a las 8:00 p.m. de Puerto Rico allí ya es el día
 * siguiente: quien cumple 18 años hoy sería mayor de edad para el servidor
 * desde las 8 de la noche de ayer. `hoyEnPR` vive en `hora-pr.ts`, que explica
 * por qué esto se puede resolver con una resta constante.
 */
export { hoyEnPR };

/**
 * Cuántos años cumplidos tiene quien nació en `nacimiento`.
 *
 * Se compara por cadenas 'YYYY-MM-DD' y no restando milisegundos: los años
 * bisiestos hacen que "restar y dividir entre 365.25" falle por un día justo el
 * día del cumpleaños, que es el único día en que la respuesta importa.
 *
 * Devuelve null si la fecha no tiene forma de fecha.
 */
export function anosCumplidos(nacimiento: string, hoy: string = hoyEnPR()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nacimiento);
  if (!m) return null;

  const [, an, mn, dn] = m;
  const [ah, mh, dh] = hoy.split('-');

  let anos = Number(ah) - Number(an);
  // ¿Todavía no ha llegado el cumpleaños de este año? Entonces uno menos.
  if (`${mh}-${dh}` < `${mn}-${dn}`) anos -= 1;
  return anos;
}

/** Mensaje único, para que la pantalla y el servidor digan exactamente lo mismo. */
export const REGLA_EDAD = `Tienes que tener ${PROMO.minAge} años o más para participar.`;

/**
 * ¿Se puede aceptar esta fecha de nacimiento?
 *
 * Rechaza también las fechas imposibles —del futuro, o de hace más de 120
 * años— porque una de las dos siempre es un dedo de más al teclear el año, y
 * dejarla pasar mete en la base de datos un cliente nacido en 2126.
 */
export function edadValida(nacimiento: string | undefined | null): boolean {
  if (!nacimiento) return false;
  const anos = anosCumplidos(nacimiento);
  return anos !== null && anos >= PROMO.minAge && anos <= 120;
}
