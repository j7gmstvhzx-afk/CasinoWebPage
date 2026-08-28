/**
 * Juego responsable: los recursos reales, en un solo sitio.
 *
 * POR QUÉ ESTO EXISTE
 * -------------------
 * El sitio decía "Juega con responsabilidad" en el pie y, en los términos,
 * "puedes hablar con nuestro personal". Eso no es un recurso: es una frase. Una
 * persona que a las dos de la mañana se da cuenta de que tiene un problema no
 * puede hablar con el personal, y no le sirve una recomendación sin número.
 *
 * Puerto Rico tiene las dos cosas de verdad y son gratis:
 *
 *   - La Línea PAS de ASSMCA, 24 horas, libre de costo, que es la que publican
 *     la propia Comisión de Juegos y las Loterías de Puerto Rico.
 *   - Un programa de AUTOEXCLUSIÓN VOLUNTARIA de la Comisión de Juegos, que
 *     cubre casinos, hípica y apuestas deportivas a la vez, y que se puede pedir
 *     por la web, por correo o en persona. Puerto Rico se unió además al
 *     programa nacional NVSEP en junio de 2026.
 *
 * No encontré ninguna norma que OBLIGUE a un casino terrestre a poner esto en su
 * página. Va igual: cuesta cero, es coherente con la política pública de la Ley
 * 81-2019, y es lo que un regulador espera ver en el sitio de un casino con
 * licencia.
 */

export const AYUDA = {
  /** Línea PAS de ASSMCA. 24 horas, 7 días, libre de costo. */
  lineaTelefono: '+18009810023',
  lineaDisplay: '1-800-981-0023',
  lineaNombre: 'Línea PAS de ASSMCA',

  /** Programa de autoexclusión voluntaria de la Comisión de Juegos. */
  autoexclusion: 'https://www.comjuegos.pr.gov/juego-responsable/juego-responsable',
  autoexclusionCorreo: 'autoexclusion@comjuegos.pr.gov',
} as const;

/**
 * Lo que hay que dejar claro sobre la tragamonedas de la página.
 *
 * En Puerto Rico el casino en línea de dinero real NO está autorizado: la Ley
 * 81-2019 solo cubrió apuestas deportivas, eSports y concursos de fantasía. La
 * tragamonedas de esta web es defendible SOLO mientras no haya apuesta, ni
 * compra de créditos, ni conversión de dinero en juego — y conviene que la
 * página lo diga con todas las letras en vez de dejarlo a la interpretación de
 * quien la mire.
 *
 * También es lo que separa a este sitio de los cientos de páginas de afiliados
 * que empujan casinos sin licencia a jugadores puertorriqueños.
 */
export const AVISO_PROMOCIONAL =
  'La tragamonedas de esta página es solo promocional: no se apuesta dinero, ' +
  'no se compran créditos y no es juego de azar en línea.';
