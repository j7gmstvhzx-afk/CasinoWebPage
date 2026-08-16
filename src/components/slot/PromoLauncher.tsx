'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PromoExperience } from './PromoExperience';
import { PROMO } from '@/lib/site';

/**
 * Lanzador de la promoción.
 *
 * Aparece solo unos segundos después de cargar, no de golpe. Un modal
 * instantáneo se percibe como anuncio y se cierra por reflejo antes de leerlo;
 * unos segundos después, la persona ya vio de qué se trata el sitio y el
 * ofrecimiento se lee como un regalo, no como una interrupción.
 *
 * El sitio NUNCA se bloquea: si cierra el modal puede navegar todo, y el botón
 * flotante lo deja volver cuando quiera. Además de ser mejor trato al visitante,
 * es lo que permite que Google indexe el sitio.
 */

const DEMORA_MS = 2200;
const CLAVE_VISTO = 'cam:promo-vista';

export function PromoLauncher() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [montado, setMontado] = useState(false);
  const dialogo = useRef<HTMLDivElement>(null);
  const activoPrevio = useRef<HTMLElement | null>(null);

  const enAdmin = pathname.startsWith('/admin');
  const enPremio = pathname.startsWith('/premio');
  const oculto = enAdmin || enPremio;

  useEffect(() => setMontado(true), []);

  // Apertura automática, una vez al día.
  useEffect(() => {
    if (oculto) return;
    let visto: string | null = null;
    try {
      visto = window.localStorage.getItem(CLAVE_VISTO);
    } catch {
      // Modo privado de Safari puede lanzar. Se muestra igual.
    }
    const hoy = new Date().toDateString();
    if (visto === hoy) return;

    const t = setTimeout(() => setAbierto(true), DEMORA_MS);
    return () => clearTimeout(t);
  }, [oculto]);

  const cerrar = useCallback(() => {
    setAbierto(false);
    try {
      window.localStorage.setItem(CLAVE_VISTO, new Date().toDateString());
    } catch {
      /* sin almacenamiento: se volverá a mostrar, y no pasa nada */
    }
    activoPrevio.current?.focus?.();
  }, []);

  const abrir = useCallback(() => {
    activoPrevio.current = document.activeElement as HTMLElement;
    setAbierto(true);
  }, []);

  // Escape para cerrar, y el foco atrapado dentro del diálogo mientras está
  // abierto: sin esto, tabular saca el foco a la página de atrás y quien navega
  // con teclado o lector de pantalla se pierde.
  useEffect(() => {
    if (!abierto) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return cerrar();
      if (e.key !== 'Tab') return;

      const focuseables = dialogo.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focuseables?.length) return;
      const primero = focuseables[0];
      const ultimo = focuseables[focuseables.length - 1];

      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const t = setTimeout(() => {
      dialogo.current
        ?.querySelector<HTMLElement>('input, select, button')
        ?.focus();
    }, 60);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflowPrevio;
      clearTimeout(t);
    };
  }, [abierto, cerrar]);

  if (!montado || oculto) return null;

  return (
    <>
      {!abierto && (
        <button
          type="button"
          onClick={abrir}
          className="anim-flotar fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-gradient-to-b from-dorado-2 to-dorado px-5 py-3.5 font-display text-sm font-bold text-noche shadow-premio transition-transform hover:scale-105 active:scale-95"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            🎰
          </span>
          GANA {PROMO.prizeLabel}
        </button>
      )}

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-noche/80 p-4 backdrop-blur-sm sm:items-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) cerrar();
          }}
        >
          <div
            ref={dialogo}
            role="dialog"
            aria-modal="true"
            aria-label={`Gira y gana ${PROMO.prizeLabel}`}
            className="anim-entrar relative my-auto w-full max-w-lg rounded-3xl border border-linea bg-noche-2/95 p-6 shadow-alza sm:p-8"
          >
            <button
              type="button"
              onClick={cerrar}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-linea text-tenue transition-colors hover:text-crema"
            >
              <span className="sr-only">Cerrar</span>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>

            <PromoExperience onCerrar={cerrar} />
          </div>
        </div>
      )}
    </>
  );
}
