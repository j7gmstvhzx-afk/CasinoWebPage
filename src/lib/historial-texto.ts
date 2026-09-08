import { DIAS, diaSemanaDe, fechaLarga, sumarDias } from './hora-pr';

/** Hasta aquí atrás se dice el día de la semana en vez del número. */
const UNA_SEMANA = 7;

/**
 * Las palabras del historial de la cuenta.
 *
 * Aparte de `historial.ts` a propósito: aquel abre la base de datos y lleva
 * `server-only`, y esto lo pinta el NAVEGADOR. Si estuvieran juntos, importar
 * una frase desde el componente arrastraría el pool de Postgres al paquete del
 * cliente —  o, más probable, no compilaría. Además así se puede probar entero
 * sin base de datos: ver scripts/verificar-historial.mjs.
 */

/* -------------------------------------------------------------------------- */
/* El estado de un cupón                                                      */
/* -------------------------------------------------------------------------- */

/** Lo que guarda la columna `app.vouchers.status`. */
export type EstadoGuardado = 'issued' | 'redeemed' | 'expired' | 'void';

/** Lo que ve el cliente. */
export type EstadoCupon = 'disponible' | 'canjeado' | 'vencido' | 'anulado';

/**
 * `issued` NO quiere decir "todavía sirve".
 *
 * Nada recorre la tabla marcando los cupones que vencieron: un cupón emitido y
 * no canjeado se queda en `issued` para siempre. Quien mire solo la columna le
 * enseña "listo para canjear" a alguien que va a hacer el viaje al casino para
 * que le digan que no. La fecha manda sobre la columna, que es la misma regla
 * que aplica `buscarCupon` en el mostrador (src/lib/vouchers.ts) — y tienen que
 * decir lo mismo, porque son las dos caras del mismo papel.
 */
export function estadoDeCupon(
  guardado: EstadoGuardado,
  expiraIso: string,
  ahoraMs: number = Date.now(),
): EstadoCupon {
  if (guardado === 'void') return 'anulado';
  if (guardado === 'redeemed') return 'canjeado';
  if (guardado === 'expired') return 'vencido';
  return new Date(expiraIso).getTime() <= ahoraMs ? 'vencido' : 'disponible';
}

export const ETIQUETA_CUPON: Record<EstadoCupon, string> = {
  disponible: 'Listo para canjear',
  canjeado: 'Canjeado',
  vencido: 'Venció sin canjear',
  anulado: 'Anulado',
};

/** Solo el que sigue vivo lleva enlace: los demás no tienen nada que abrir. */
export const CUPON_VIVO: Record<EstadoCupon, boolean> = {
  disponible: true,
  canjeado: false,
  vencido: false,
  anulado: false,
};

/* -------------------------------------------------------------------------- */
/* Las fechas, mirando hacia atrás                                            */
/* -------------------------------------------------------------------------- */

/**
 * "hoy", "ayer", "el sábado 6 de septiembre", "el 3 de agosto".
 *
 * Es la gemela de `fechaCorta` de la cartelera, con el tiempo al revés: allí
 * las fechas están por venir ("mañana", "el sábado que viene") y aquí ya
 * pasaron. Se escriben separadas en vez de una con una bandera porque la
 * bandera se equivoca sola: un historial nunca dice "mañana".
 */
export function diaPasado(f: string, hoy: string): string {
  if (f === hoy) return 'hoy';
  if (f === sumarDias(hoy, -1)) return 'ayer';
  // Dentro de la última semana se dice el día, que es como se recuerda: "el
  // sábado", no "el 6". Más atrás el día de la semana ya no ubica a nadie.
  if (f < hoy && f > sumarDias(hoy, -UNA_SEMANA)) {
    return `el ${DIAS[diaSemanaDe(f)]} ${fechaLarga(f, hoy)}`;
  }
  return `el ${fechaLarga(f, hoy)}`;
}

/* -------------------------------------------------------------------------- */
/* Los resúmenes                                                              */
/* -------------------------------------------------------------------------- */

/** "12 días" · "1 día" — el número va aparte, en grande, en la pantalla. */
export const plural = (n: number, uno: string, muchos: string) =>
  `${n} ${n === 1 ? uno : muchos}`;

/**
 * La línea de abajo del contador de días.
 *
 * Con un solo día no se dice "desde": desde el 3 de agosto suena a que lleva
 * meses, cuando fue la única vez.
 */
export function desdeCuando(dias: number, primero: string | null, hoy: string): string {
  if (!primero || dias === 0) return 'Tu primera tirada te está esperando.';
  if (dias === 1) return `Tu única tirada fue ${diaPasado(primero, hoy)}.`;
  return `Desde ${diaPasado(primero, hoy)}.`;
}

/**
 * El titular de los premios.
 *
 * El caso de cero es el normal —la mayoría de la gente no ha ganado— así que se
 * redacta como lo que es, una invitación, y no como un hueco. Es la misma
 * lección del bloque de premios pagados de la portada: un vacío no comunica.
 */
export function tituloDePremios(cuantos: number): string {
  if (cuantos === 0) return 'Todavía no has ganado';
  if (cuantos === 1) return 'Ganaste una vez';
  return `Has ganado ${cuantos} veces`;
}
