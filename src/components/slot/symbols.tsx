import type { JSX } from 'react';
import { SYMBOLS } from '@/lib/reels';

/**
 * Símbolos de los rolos, dibujados en SVG.
 *
 * Se dibujan en vez de usar emoji por tres razones concretas: el emoji cambia
 * de forma en cada sistema operativo (la corona de Android no se parece a la de
 * iPhone), no se puede pintar con los colores de la marca, y a 92px se ve
 * pixelado en pantallas normales.
 *
 * El orden del arreglo exportado DEBE coincidir con SYMBOLS en lib/reels.ts:
 * la base de datos guarda índices, no nombres.
 */

const box = (children: React.ReactNode) => (
  <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
    {children}
  </svg>
);

/**
 * POR QUÉ NO HAY NI UN SOLO CONTORNO OSCURO AQUÍ
 *
 * La versión anterior dibujaba cada figura con un borde oscuro de 2px, rellenos
 * saturados y un par de círculos de brillo encima. Ese es el lenguaje de la
 * calcomanía y del juguete: se reportó, con razón, como "parecen de plástico".
 *
 * Estas son siluetas PLANAS de dos tonos del mismo color: uno para la forma y
 * otro más claro o más oscuro para el volumen, sin borde y sin brillos. El
 * detalle se hace con hueco —  restando forma —  en vez de con línea. Es lo que
 * distingue un símbolo de máquina de verdad de un dibujo animado, y además
 * aguanta el tamaño pequeño: un contorno de 2px sobre una figura de 40px se
 * come la figura.
 *
 * Los rolos son azul noche, así que todo se elige para leerse sobre oscuro.
 */

function Corona() {
  return box(
    <>
      {/* Cuerpo de la corona en una sola pieza: sin borde, la silueta manda. */}
      <path d="M6 45 L3 17 L19.5 29 L32 9 L44.5 29 L61 17 L58 45 Z" fill="#F2B33D" />
      {/* El tono oscuro no es un contorno: es la cara en sombra del metal. */}
      <path d="M32 9 L44.5 29 L61 17 L58 45 L32 45 Z" fill="#C8901A" />
      <rect x="6" y="46" width="52" height="9" rx="3" fill="#FFD479" />
      <rect x="32" y="46" width="26" height="9" rx="3" fill="#F2B33D" />
    </>,
  );
}

/** Pava: el sombrero de paja del jíbaro puertorriqueño. */
function Pava() {
  return box(
    <>
      <ellipse cx="32" cy="44" rx="30" ry="9" fill="#E8C173" />
      <path d="M32 44 A30 9 0 0 0 62 44 Z" fill="#C79A4B" />
      <path d="M13 44 C13 25 21 15 32 15 C43 15 51 25 51 44 Z" fill="#F5DBA6" />
      <path d="M32 15 C43 15 51 25 51 44 L32 44 Z" fill="#E8C173" />
      {/* La cinta se dibuja quitando, no añadiendo línea. */}
      <path d="M14 39 C22 44 42 44 50 39 L50 34 C42 39 22 39 14 34 Z" fill="#C79A4B" />
    </>,
  );
}

/** Coquí: la ranita símbolo de Puerto Rico. */
function Coqui() {
  return box(
    <>
      <ellipse cx="32" cy="41" rx="21" ry="16" fill="#4FB04A" />
      <path d="M32 25 A21 16 0 0 1 53 41 A21 16 0 0 1 32 57 Z" fill="#3B8F38" />
      <circle cx="21" cy="23" r="9" fill="#4FB04A" />
      <circle cx="43" cy="23" r="9" fill="#3B8F38" />
      {/* Los ojos son HUECO, no un círculo blanco con otro negro encima. */}
      <circle cx="21" cy="23" r="4.2" fill="#071C37" />
      <circle cx="43" cy="23" r="4.2" fill="#071C37" />
      <path d="M23 45 Q32 51 41 45 Q32 48 23 45 Z" fill="#2C6B25" />
      <ellipse cx="12" cy="52" rx="7" ry="4" fill="#6FC96A" />
      <ellipse cx="52" cy="52" rx="7" ry="4" fill="#3B8F38" />
    </>,
  );
}

function Palma() {
  return box(
    <>
      <path d="M29 58 C29 42 30 31 32.5 21 L37 21 C34.5 32 34.5 43 36 58 Z" fill="#8A5A0B" />
      <path d="M32.5 21 L37 21 C34.5 32 34.5 43 36 58 L33 58 C33 43 32.5 32 32.5 21 Z" fill="#6B440A" />
      <g fill="#3FA83A">
        <path d="M33 19 C22 10 11 12 4 21 C15 18 25 21 33 25 Z" />
        <path d="M33 19 C27 7 17 3 8 5 C18 10 26 15 31 24 Z" />
      </g>
      <g fill="#2F8A2C">
        <path d="M33 19 C44 10 55 12 62 21 C51 18 41 21 33 25 Z" />
        <path d="M33 19 C39 7 49 3 58 5 C48 10 40 15 35 24 Z" />
      </g>
      <circle cx="33" cy="20" r="4" fill="#F2B33D" />
    </>,
  );
}

/** Bandera de Puerto Rico. */
function Bandera() {
  return box(
    <>
      <rect x="3" y="15" width="58" height="34" rx="3" fill="#E23B3B" />
      <rect x="3" y="21.8" width="58" height="6.8" fill="#F4F9FF" />
      <rect x="3" y="35.4" width="58" height="6.8" fill="#F4F9FF" />
      <path d="M3 18 A3 3 0 0 1 6 15 L34 32 L6 49 A3 3 0 0 1 3 46 Z" fill="#12386F" />
      <path d="M15 25.5 L17.4 31 L23.3 31.4 L18.8 35.3 L20.2 41 L15 37.8 L9.8 41 L11.2 35.3 L6.7 31.4 L12.6 31 Z" fill="#F4F9FF" />
    </>,
  );
}

function Coco() {
  return box(
    <>
      <circle cx="32" cy="35" r="22" fill="#8A5630" />
      <path d="M32 13 A22 22 0 0 1 32 57 Z" fill="#6B4022" />
      {/* Los tres ojos del coco, en hueco. */}
      <circle cx="25" cy="28" r="3" fill="#4A2B14" />
      <circle cx="37" cy="26" r="3" fill="#4A2B14" />
      <circle cx="31" cy="36" r="3" fill="#4A2B14" />
      <path d="M32 13 C29 6 23 3 18 4 C24 8 28 11 30 14 Z" fill="#3FA83A" />
    </>,
  );
}

/** Ficha del casino: la única que toma color directo de la marca. */
function Ficha() {
  return box(
    <>
      <circle cx="32" cy="32" r="26" fill="#12386F" />
      <path d="M32 6 A26 26 0 0 1 32 58 Z" fill="#0D2A55" />
      {/* Las muescas del canto: seis, en hueco claro. */}
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <rect
          key={deg}
          x="29.5"
          y="6"
          width="5"
          height="8"
          rx="2.5"
          fill="#F4F9FF"
          transform={`rotate(${deg} 32 32)`}
        />
      ))}
      <circle cx="32" cy="32" r="16.5" fill="#00A9C7" />
      <path d="M32 15.5 A16.5 16.5 0 0 1 32 48.5 Z" fill="#0089A1" />
      <circle cx="32" cy="32" r="7" fill="#F4F9FF" />
    </>,
  );
}

const COMPONENTS: Record<string, () => JSX.Element> = {
  corona: Corona,
  pava: Pava,
  coqui: Coqui,
  palma: Palma,
  bandera: Bandera,
  coco: Coco,
  ficha: Ficha,
};

export const SYMBOL_LABELS: Record<string, string> = {
  corona: 'Corona',
  pava: 'Pava',
  coqui: 'Coquí',
  palma: 'Palma',
  bandera: 'Bandera',
  coco: 'Coco',
  ficha: 'Ficha',
};

/** Ordenado por índice, igual que SYMBOLS. */
export const SYMBOL_COMPONENTS = SYMBOLS.map((name) => COMPONENTS[name]);

export function SymbolIcon({ index }: { index: number }) {
  const Component = SYMBOL_COMPONENTS[index % SYMBOL_COMPONENTS.length];
  return <Component />;
}
