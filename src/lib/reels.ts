import { randomInt } from 'node:crypto';

/**
 * Símbolos de los rolos.
 *
 * Identidad puertorriqueña a propósito: el cliente reconoce el coquí y la pava
 * de jíbaro al instante, y eso hace que la máquina se sienta del casino y no
 * una plantilla genérica comprada en línea.
 *
 * El ORDEN ES PARTE DEL CONTRATO: la base de datos guarda índices, no nombres.
 * Insertar un símbolo en medio de esta lista reinterpretaría todas las tiradas
 * históricas. Los símbolos nuevos se agregan AL FINAL.
 */
export const SYMBOLS = [
  'corona',
  'pava',
  'coqui',
  'palma',
  'bandera',
  'coco',
  'ficha',
] as const;

export type Symbol = (typeof SYMBOLS)[number];

/** Símbolos que pueden formar una combinación ganadora. */
const WINNING_SYMBOLS = [0, 1, 2] as const; // corona, pava, coquí

/**
 * Con qué frecuencia una derrota muestra dos iguales y uno distinto.
 *
 * Se mantiene BAJO a propósito (es aproximadamente lo que produciría el azar
 * puro). Inflar los "casi casi" es una técnica de enganche documentada y está
 * restringida en máquinas de juego reguladas de varias jurisdicciones. Esto es
 * una promoción de mercadeo, no un equipo de juego regulado, pero corre bajo la
 * marca de un operador con licencia. Este número se revisa, no se sube en
 * silencio buscando más emoción.
 */
const NEAR_MISS_RATE = 0.1;

/**
 * Tres iguales. El servidor escoge CUÁL símbolo, así el premio no siempre son
 * coronas y no se vuelve predecible para quien mira desde afuera.
 */
export function winningReels(): number[] {
  const s = WINNING_SYMBOLS[randomInt(0, WINNING_SYMBOLS.length)];
  return [s, s, s];
}

/**
 * Una combinación que NUNCA es tres iguales.
 *
 * Los tres iguales están reservados para una victoria real: si una derrota
 * pudiera mostrarlos, el cliente vería la combinación ganadora sin recibir
 * premio, y eso es exactamente la discusión que no se quiere tener en el
 * mostrador de Servicio al Cliente.
 */
export function losingReels(): number[] {
  if (randomInt(0, 10_000) < NEAR_MISS_RATE * 10_000) {
    const pair = SYMBOLS.length > 1 ? randomInt(0, SYMBOLS.length) : 0;
    const odd = pickExcept(pair);
    const reels = [pair, pair, pair];
    reels[randomInt(0, 3)] = odd;
    return reels;
  }

  let reels: number[];
  do {
    reels = [
      randomInt(0, SYMBOLS.length),
      randomInt(0, SYMBOLS.length),
      randomInt(0, SYMBOLS.length),
    ];
  } while (reels[0] === reels[1] && reels[1] === reels[2]);
  return reels;
}

function pickExcept(exclude: number): number {
  let v: number;
  do {
    v = randomInt(0, SYMBOLS.length);
  } while (v === exclude);
  return v;
}

export const isThreeOfAKind = (r: readonly number[]) =>
  r.length === 3 && r[0] === r[1] && r[1] === r[2];
