/**
 * La hora de Puerto Rico, en un solo sitio.
 *
 * POR QUÉ NO SE USA LA HORA DEL SERVIDOR NI LA DEL VISITANTE
 * ----------------------------------------------------------
 * El servidor de Vercel corre en UTC. A las 8:00 p.m. de Puerto Rico, en UTC ya
 * es el día siguiente: durante cuatro horas cada noche, "hoy" según el servidor
 * y "hoy" según quien está en Manatí son días distintos. Y la hora del
 * navegador tampoco sirve, porque el visitante puede estar en Nueva York
 * mirando si el casino está abierto.
 *
 * Lo que manda siempre es la hora del salón.
 *
 * POR QUÉ ESTO SE PUEDE HACER CON UNA RESTA
 * -----------------------------------------
 * Puerto Rico está en UTC-4 y NO CAMBIA LA HORA en todo el año: no hay horario
 * de verano. El desfase es constante, así que no hace falta arrastrar una
 * librería de husos horarios al navegador ni depender de `Intl` — basta con
 * restar cuatro horas a un instante en UTC.
 *
 * Este archivo es la única copia de ese número. Estaba escrito en dos sitios y
 * dos copias de una constante son dos oportunidades de que una se quede atrás.
 *
 * En la base de datos lo mismo se hace con `at time zone 'America/Puerto_Rico'`,
 * que es la convención que usa `app.gaming_date()` desde la primera migración.
 * Allí sí hay base de datos de husos y sale gratis.
 */
const DESFASE_PR_MS = 4 * 60 * 60 * 1000;

/** El instante `ahora`, corrido para que sus campos UTC sean los de Puerto Rico. */
function comoPR(ahora: number): Date {
  return new Date(ahora - DESFASE_PR_MS);
}

/** El día de calendario que es AHORA en Puerto Rico, como 'YYYY-MM-DD'. */
export function hoyEnPR(ahora: number = Date.now()): string {
  return comoPR(ahora).toISOString().slice(0, 10);
}

/** Minutos transcurridos desde medianoche en Puerto Rico. 0 a 1439. */
export function minutosEnPR(ahora: number = Date.now()): number {
  const d = comoPR(ahora);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Día de la semana en Puerto Rico. 0 = domingo … 6 = sábado, como `extract(dow)`. */
export function diaSemanaEnPR(ahora: number = Date.now()): number {
  return comoPR(ahora).getUTCDay();
}

/**
 * 'HH:MM' -> minutos desde medianoche. Devuelve null si no tiene esa forma.
 *
 * Acepta también 'HH:MM:SS', que es como Postgres devuelve una columna `time`.
 */
export function aMinutos(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Minutos desde medianoche -> "8:00 a.m.", como se dice en Puerto Rico.
 *
 * A mano y no con `toLocaleTimeString`: esa función depende de los datos de
 * idioma del navegador, y entre uno y otro sale "8:00 a. m.", "8:00 AM" o
 * "08:00". En una página que dice a qué hora cierra un casino, la forma tiene
 * que ser la misma siempre.
 */
export function comoHora(minutos: number): string {
  const m = ((minutos % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const sufijo = h24 < 12 ? 'a.m.' : 'p.m.';
  // Medianoche y mediodía se dicen con su nombre: "cierra a las 12:00 a.m."
  // hace dudar a cualquiera de si es medianoche o mediodía.
  if (m === 0) return 'medianoche';
  if (m === 720) return 'mediodía';
  return `${h12}:${String(min).padStart(2, '0')} ${sufijo}`;
}

/** Suma días a una fecha 'YYYY-MM-DD'. En UTC, para que no la corra ningún huso. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Día de la semana de una fecha 'YYYY-MM-DD'. 0 = domingo. */
export function diaSemanaDe(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export const DIAS = [
  'domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado',
] as const;

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

/**
 * "2026-08-01" -> "agosto".
 *
 * Se parte la cadena en vez de usar `new Date`: la columna es un DÍA DE
 * CALENDARIO, y `new Date('2026-08-01')` lo lee como medianoche UTC, que desde
 * Puerto Rico es el 31 de julio a las 8 p.m. El mes se cambiaría solo.
 *
 * Esta función estaba copiada en tres archivos —la portada, el tablero de
 * premios y el panel— con el mismo array de meses al lado. Tres copias de la
 * misma trampa son tres sitios donde arreglarla.
 */
export function nombreMesDe(iso: string): { mes: string; anio: string } {
  const [anio, mes] = iso.split('-');
  return { mes: MESES[Number(mes) - 1] ?? '', anio };
}
