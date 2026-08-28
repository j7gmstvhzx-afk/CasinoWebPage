import { PROMO } from './site';

/**
 * La edad, contada en el calendario de Puerto Rico.
 *
 * POR QUÉ NO SE USA `new Date()` A SECAS
 * --------------------------------------
 * El servidor corre en UTC. A las 8:00 p.m. de Puerto Rico en UTC ya es el día
 * siguiente, así que "hoy" según el servidor y "hoy" según la persona que está
 * en Manatí no son el mismo día durante cuatro horas cada noche. Quien cumple
 * 18 años hoy sería mayor de edad para el servidor desde las 8 de la noche de
 * ayer.
 *
 * Puerto Rico está en UTC-4 y NO CAMBIA LA HORA en todo el año — no hay horario
 * de verano. Eso es lo que permite resolver esto con una resta de cuatro horas
 * en vez de con una librería de husos horarios: el desfase es constante. En
 * Nueva York este mismo cálculo necesitaría la base de datos de husos.
 *
 * La base de datos hace lo mismo con `at time zone 'America/Puerto_Rico'`, que
 * es la convención que ya usa `app.gaming_date()` desde la primera migración.
 * Aquí se replica para el lado de JavaScript, donde arrastrar esa dependencia
 * no compensa.
 */
const DESFASE_PR_MS = 4 * 60 * 60 * 1000;

/** El día de calendario que es AHORA en Puerto Rico, como 'YYYY-MM-DD'. */
export function hoyEnPR(ahora: number = Date.now()): string {
  return new Date(ahora - DESFASE_PR_MS).toISOString().slice(0, 10);
}

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
