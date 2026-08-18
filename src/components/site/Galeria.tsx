'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ItemGaleria } from '@/lib/queries';

/**
 * Galería con visor a pantalla completa.
 *
 * Se navega con flechas y se cierra con Escape, no solo con el ratón: mucha
 * gente entra desde la computadora del trabajo y espera que las flechas
 * funcionen.
 */
export function Galeria({ items }: { items: ItemGaleria[] }) {
  const [abierto, setAbierto] = useState<number | null>(null);

  const mover = useCallback(
    (paso: number) => {
      setAbierto((i) => (i === null ? null : (i + paso + items.length) % items.length));
    },
    [items.length],
  );

  useEffect(() => {
    if (abierto === null) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(null);
      if (e.key === 'ArrowRight') mover(1);
      if (e.key === 'ArrowLeft') mover(-1);
    };

    document.addEventListener('keydown', onKey);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previo;
    };
  }, [abierto, mover]);

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setAbierto(i)}
              className="group block w-full overflow-hidden rounded-2xl border border-linea"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image_path}
                alt={item.caption ?? 'Foto de Casino Atlántico Manatí'}
                loading="lazy"
                className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </button>
          </li>
        ))}
      </ul>

      {abierto !== null && (
        <div
          // z-40, igual que el pop-up de promoción: cualquier overlay de
          // pantalla completa va POR DEBAJO del header (z-50) a propósito,
          // para que el menú del sitio nunca deje de responder mientras algo
          // esté abierto encima de la página.
          className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/80 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAbierto(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Visor de imágenes"
        >
          <button
            type="button"
            onClick={() => setAbierto(null)}
            className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full border border-linea text-tinta"
          >
            <span className="sr-only">Cerrar</span>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>

          {items.length > 1 && (
            <>
              <FlechaVisor direccion="izquierda" onClick={() => mover(-1)} />
              <FlechaVisor direccion="derecha" onClick={() => mover(1)} />
            </>
          )}

          <figure className="max-h-full max-w-4xl text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={items[abierto].image_path}
              alt={items[abierto].caption ?? 'Foto de Casino Atlántico Manatí'}
              className="mx-auto max-h-[78vh] w-auto rounded-2xl object-contain"
            />
            {items[abierto].caption && (
              <figcaption className="mt-4 text-sm text-tenue">
                {items[abierto].caption}
              </figcaption>
            )}
            <p className="mt-2 text-xs text-tenue tabular">
              {abierto + 1} / {items.length}
            </p>
          </figure>
        </div>
      )}
    </>
  );
}

function FlechaVisor({
  direccion,
  onClick,
}: {
  direccion: 'izquierda' | 'derecha';
  onClick: () => void;
}) {
  const izq = direccion === 'izquierda';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-linea bg-fondo/85 text-tinta ${
        izq ? 'left-3 sm:left-6' : 'right-3 sm:right-6'
      }`}
    >
      <span className="sr-only">{izq ? 'Anterior' : 'Siguiente'}</span>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d={izq ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
