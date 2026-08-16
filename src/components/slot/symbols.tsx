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

function Corona() {
  return box(
    <>
      <path
        d="M8 44 L4 18 L20 29 L32 10 L44 29 L60 18 L56 44 Z"
        fill="#F2B33D"
        stroke="#8A5A0B"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <rect x="8" y="44" width="48" height="9" rx="2.5" fill="#FFD479" stroke="#8A5A0B" strokeWidth="2" />
      <circle cx="32" cy="24" r="3.2" fill="#E23B3B" />
      <circle cx="15" cy="30" r="2.4" fill="#2BA9E0" />
      <circle cx="49" cy="30" r="2.4" fill="#2BA9E0" />
    </>,
  );
}

/** Pava: el sombrero de paja del jíbaro puertorriqueño. */
function Pava() {
  return box(
    <>
      <ellipse cx="32" cy="43" rx="29" ry="9.5" fill="#E8C173" stroke="#8A5A0B" strokeWidth="2" />
      <path
        d="M14 43 C14 26 21 17 32 17 C43 17 50 26 50 43 Z"
        fill="#F0D296"
        stroke="#8A5A0B"
        strokeWidth="2"
      />
      <path d="M14 40 C22 45 42 45 50 40" fill="none" stroke="#8A5A0B" strokeWidth="2" />
      <path d="M20 33 C26 30 38 30 44 33" fill="none" stroke="#C79A4B" strokeWidth="1.6" />
    </>,
  );
}

/** Coquí: la ranita símbolo de Puerto Rico. */
function Coqui() {
  return box(
    <>
      <ellipse cx="32" cy="40" rx="20" ry="16" fill="#5FBF52" stroke="#2C6B25" strokeWidth="2" />
      <ellipse cx="21" cy="24" rx="8.5" ry="8" fill="#5FBF52" stroke="#2C6B25" strokeWidth="2" />
      <ellipse cx="43" cy="24" rx="8.5" ry="8" fill="#5FBF52" stroke="#2C6B25" strokeWidth="2" />
      <circle cx="21" cy="24" r="4" fill="#FFF" />
      <circle cx="43" cy="24" r="4" fill="#FFF" />
      <circle cx="22" cy="25" r="2.2" fill="#0A2547" />
      <circle cx="44" cy="25" r="2.2" fill="#0A2547" />
      <path d="M25 43 Q32 49 39 43" fill="none" stroke="#2C6B25" strokeWidth="2.2" strokeLinecap="round" />
      <ellipse cx="14" cy="51" rx="6" ry="3.6" fill="#7FD470" stroke="#2C6B25" strokeWidth="1.8" />
      <ellipse cx="50" cy="51" rx="6" ry="3.6" fill="#7FD470" stroke="#2C6B25" strokeWidth="1.8" />
    </>,
  );
}

function Palma() {
  return box(
    <>
      <path d="M30 56 C30 40 31 30 33 22 L37 22 C35 32 35 42 36 56 Z" fill="#8A5A0B" />
      <g stroke="#2C6B25" strokeWidth="2" fill="#3FA83A">
        <path d="M33 20 C22 12 12 14 6 22 C16 20 25 22 33 26 Z" />
        <path d="M33 20 C44 12 54 14 60 22 C50 20 41 22 33 26 Z" />
        <path d="M33 20 C28 9 18 5 10 7 C19 11 26 16 31 24 Z" />
        <path d="M33 20 C38 9 48 5 56 7 C47 11 40 16 35 24 Z" />
      </g>
      <circle cx="33" cy="21" r="3.6" fill="#F2B33D" stroke="#8A5A0B" strokeWidth="1.6" />
      <ellipse cx="33" cy="57" rx="15" ry="3.5" fill="#1B4F9C" opacity="0.45" />
    </>,
  );
}

/** Bandera de Puerto Rico. */
function Bandera() {
  return box(
    <>
      <rect x="4" y="14" width="56" height="36" rx="2.5" fill="#E23B3B" />
      <rect x="4" y="20" width="56" height="6" fill="#F7F4EE" />
      <rect x="4" y="32" width="56" height="6" fill="#F7F4EE" />
      <rect x="4" y="44" width="56" height="6" fill="#F7F4EE" />
      <path d="M4 14 L34 32 L4 50 Z" fill="#1B4F9C" />
      <path
        d="M15 26 L17.2 31.2 L22.8 31.6 L18.5 35.2 L19.9 40.6 L15 37.6 L10.1 40.6 L11.5 35.2 L7.2 31.6 L12.8 31.2 Z"
        fill="#F7F4EE"
      />
      <rect x="4" y="14" width="56" height="36" rx="2.5" fill="none" stroke="#0A2547" strokeWidth="2" />
    </>,
  );
}

function Coco() {
  return box(
    <>
      <circle cx="32" cy="34" r="22" fill="#7A4A22" stroke="#452711" strokeWidth="2" />
      <path d="M14 24 C22 19 42 19 50 24" fill="none" stroke="#5C3517" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M12 38 C22 43 42 43 52 38" fill="none" stroke="#5C3517" strokeWidth="2" strokeLinecap="round" />
      <circle cx="25" cy="27" r="2.6" fill="#452711" />
      <circle cx="36" cy="25" r="2.6" fill="#452711" />
      <circle cx="31" cy="34" r="2.6" fill="#452711" />
      <path d="M32 12 C29 6 24 4 20 5 C25 8 28 10 30 13 Z" fill="#3FA83A" stroke="#2C6B25" strokeWidth="1.6" />
    </>,
  );
}

/** Ficha del casino: la única que toma color directo de la marca. */
function Ficha() {
  return box(
    <>
      <circle cx="32" cy="32" r="25" fill="#1B4F9C" stroke="#0A2547" strokeWidth="2" />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <rect
          key={deg}
          x="29"
          y="7"
          width="6"
          height="9"
          rx="1.5"
          fill="#F7F4EE"
          transform={`rotate(${deg} 32 32)`}
        />
      ))}
      <circle cx="32" cy="32" r="16" fill="#2BA9E0" stroke="#F7F4EE" strokeWidth="2" />
      <circle cx="32" cy="32" r="8" fill="#F7F4EE" />
      <circle cx="32" cy="32" r="3.4" fill="#1B4F9C" />
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
