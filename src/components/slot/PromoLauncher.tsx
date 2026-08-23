'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PromoExperience } from './PromoExperience';
import { PROMO } from '@/lib/site';
import { useAlgunOverlayActivo } from '@/lib/overlay-activo';

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
  const dialogo = useRef<HTMLDivElement>(null);
  const activoPrevio = useRef<HTMLElement | null>(null);

  const enAdmin = pathname.startsWith('/admin');
  const enPremio = pathname.startsWith('/premio');
  // En /cuenta la persona ya vino a lo mismo que ofrece el pop-up, y ahí es
  // donde llena el formulario: abrirse encima le tapa el campo que está
  // escribiendo y le pide por segunda vez lo que ya está haciendo.
  const enCuenta = pathname.startsWith('/cuenta');
  const oculto = enAdmin || enPremio || enCuenta;
  const algunOverlayActivo = useAlgunOverlayActivo();

  // Apertura automática, una vez al día, tras DEMORA_MS de tiempo real
  // (no reloj de pared) sin que haya otro overlay abierto — el menú móvil del
  // header o el visor de la galería.
  //
  // El tiempo que falta se guarda en una ref y se DESCUENTA, nunca se
  // reinicia. Si el temporizador se reiniciara cada vez que el otro overlay
  // se cierra (como pasaba antes), el primer ciclo de abrir-y-cerrar el menú
  // casi nunca alcanza a disparar a media interacción, pero para el segundo
  // ciclo ya lleva un rato corriendo en silencio — y si el visitante tarda
  // más de DEMORA_MS en volver a abrir el menú y tocar otro link, este modal
  // se monta encima justo cuando va a tocar. Con el descuento, el total de
  // espera nunca pasa de DEMORA_MS de tiempo sin pausa, sin importar cuántas
  // veces se abra y cierre el otro overlay de por medio.
  //
  // NO se corta cuando el remanente llega a 0: `setTimeout(fn, 0)` dispara en
  // el siguiente tick, así que "ya no queda espera" se traduce en "muéstrate
  // ya", nunca en "no te muestres más". Con un corte por `restante <= 0`,
  // suficientes aperturas y cierres rápidos del otro overlay —cada uno
  // interrumpiendo la cuenta antes de completarla— podían agotar el
  // remanente sin que el pop-up llegara a dispararse ni una sola vez, y se
  // quedaba sin mostrarse el resto de la sesión.
  const restanteRef = useRef(DEMORA_MS);
  useEffect(() => {
    if (oculto || algunOverlayActivo) return;
    let visto: string | null = null;
    try {
      visto = window.localStorage.getItem(CLAVE_VISTO);
    } catch {
      // Modo privado de Safari puede lanzar. Se muestra igual.
    }
    const hoy = new Date().toDateString();
    if (visto === hoy) return;

    const inicio = Date.now();
    const t = setTimeout(() => setAbierto(true), Math.max(0, restanteRef.current));
    return () => {
      clearTimeout(t);
      restanteRef.current = Math.max(0, restanteRef.current - (Date.now() - inicio));
    };
  }, [oculto, algunOverlayActivo]);

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

  // No hace falta una bandera de "ya montó": lo primero que se pinta (el botón
  // flotante) es idéntico en servidor y cliente. Lo único que depende del
  // navegador es localStorage, y eso vive dentro de un efecto.
  if (oculto) return null;

  return (
    <>
      {!abierto && (
        <button
          type="button"
          onClick={abrir}
          className="anim-flotar fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-gradient-to-b from-dorado-3 to-dorado-2 px-5 py-3.5 font-display text-sm font-bold text-tinta shadow-premio transition-transform hover:scale-105 active:scale-95"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            🎰
          </span>
          GANA {PROMO.prizeLabel}
        </button>
      )}

      {abierto && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-tinta/45 p-4 pt-24 backdrop-blur-sm sm:items-center sm:pt-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) cerrar();
          }}
        >
          <div
            ref={dialogo}
            role="dialog"
            aria-modal="true"
            aria-label={`Gira y gana ${PROMO.prizeLabel}`}
            className="anim-entrar relative my-auto w-full max-w-lg rounded-3xl border border-linea bg-fondo p-6 pt-14 shadow-alza sm:p-8 sm:pt-14"
          >
            {/* z-10 NO es decoración: sin él este botón queda por debajo del
                contenido del modal, que ocupa todo el ancho, y el navegador le
                entrega el clic al texto de la promoción en vez de a la X. El
                visitante no podía cerrar el modal NI usar el menú del sitio.
                Además `bg-fondo`, para que se lea encima del contenido. */}
            <button
              type="button"
              onClick={cerrar}
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-linea bg-fondo text-tenue shadow-suave transition-colors hover:border-tenue hover:text-tinta"
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
