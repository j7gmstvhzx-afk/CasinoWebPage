'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ItemGaleria } from '@/lib/queries';
import { setOverlayActivo } from '@/lib/overlay-activo';

/**
 * Galería con visor a pantalla completa.
 *
 * Se navega con flechas y se cierra con Escape, no solo con el ratón: mucha
 * gente entra desde la computadora del trabajo y espera que las flechas
 * funcionen.
 */
export function Galeria({ items }: { items: ItemGaleria[] }) {
  const [abierto, setAbierto] = useState<number | null>(null);

  // El visor se declara `aria-modal="true"`, así que el foco tiene que
  // comportarse como en un diálogo modal. No lo hacía: al abrirlo el foco se
  // quedaba en la miniatura de atrás, y tabulando se salía del visor en 9 de
  // 12 paradas — a las otras miniaturas y a los enlaces del pie, todos
  // tapados por el overlay y sin poder traerlos a la vista porque el scroll
  // del `body` está bloqueado a propósito. Prometer `aria-modal` y no
  // retener el foco es peor que no prometerlo.
  const dialogo = useRef<HTMLDivElement>(null);
  const activoPrevio = useRef<HTMLElement | null>(null);

  const mover = useCallback(
    (paso: number) => {
      setAbierto((i) => (i === null ? null : (i + paso + items.length) % items.length));
    },
    [items.length],
  );

  useEffect(() => {
    if (abierto === null) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return setAbierto(null);
      if (e.key === 'ArrowRight') return mover(1);
      if (e.key === 'ArrowLeft') return mover(-1);
      if (e.key !== 'Tab') return;

      const focuseables = dialogo.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focuseables?.length) return;
      const primero = focuseables[0];
      const ultimo = focuseables[focuseables.length - 1];

      // El `!dialogo.current.contains(activeElement)` cubre el caso en que el
      // foco anda fuera del visor (por ejemplo en el `body`): sin él, las
      // comprobaciones de `=== primero` y `=== ultimo` no encajan con nada y
      // el Tab se escapa igual.
      if (!dialogo.current?.contains(document.activeElement)) {
        e.preventDefault();
        return (e.shiftKey ? ultimo : primero).focus();
      }
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previo;
    };
  }, [abierto, mover]);

  // Foco DENTRO del visor al abrirlo, y de vuelta a la miniatura al cerrarlo.
  //
  // La dependencia es el booleano, no el índice: pasar de foto en foto con las
  // flechas no debe robarle el foco a la flecha que se está pulsando.
  const galeriaAbierta = abierto !== null;
  useEffect(() => {
    if (galeriaAbierta) {
      const t = setTimeout(
        () => dialogo.current?.querySelector<HTMLElement>('button')?.focus(),
        60,
      );
      return () => clearTimeout(t);
    }
    const previo = activoPrevio.current;
    if (previo && document.contains(previo)) previo.focus();
  }, [galeriaAbierta]);

  // Le avisa al registro de overlays que este visor está abierto: es el mismo
  // mecanismo que usa el menú móvil del header con el pop-up de promoción,
  // para que ninguno de los dos se monte encima del otro a media interacción.
  //
  // La dependencia es el booleano derivado, no `abierto` a secas: `abierto`
  // es el ÍNDICE de la foto y cambia con cada flecha. Si el efecto dependiera
  // de él, cada paso de foto en foto apagaría y volvería a prender el
  // registro sin necesidad, avisándole a cada suscriptor (como el
  // temporizador del pop-up) de una apertura y cierre que en realidad nunca
  // pasó.
  useEffect(() => {
    setOverlayActivo('galeria', galeriaAbierta);
    return () => setOverlayActivo('galeria', false);
  }, [galeriaAbierta]);

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                activoPrevio.current = document.activeElement as HTMLElement;
                setAbierto(i);
              }}
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
          ref={dialogo}
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
            // top-20, no top-5: el header es `sticky top-0 z-50` y mide 4,5rem,
              // y este visor es z-40, así que el header le pasa por encima. En
              // top-5 este botón ocupaba y=20..64, ENTERO dentro de la banda del
              // header. Medido con una rejilla de 4px sobre todo el rectángulo,
              // en cuatro pantallas distintas: 0 de 121 puntos llegaban al
              // botón; los 121 caían en el header, y 72 de ellos justo sobre la
              // hamburguesa. Tocar la X para cerrar la foto ABRÍA EL MENÚ encima
              // de la foto, que seguía abierta. La única salida era tocar el
              // fondo oscuro, que no se le ocurre a nadie.
              className="absolute right-5 top-20 flex h-11 w-11 items-center justify-center rounded-full border border-linea text-tinta"
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
