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
  const botonRef = useRef<HTMLButtonElement>(null);

  const enAdmin = pathname.startsWith('/admin');
  const enPremio = pathname.startsWith('/premio');
  // En /cuenta la persona ya vino a lo mismo que ofrece el pop-up, y ahí es
  // donde llena el formulario: abrirse encima le tapa el campo que está
  // escribiendo y le pide por segunda vez lo que ya está haciendo.
  const enCuenta = pathname.startsWith('/cuenta');
  const oculto = enAdmin || enPremio || enCuenta;
  const algunOverlayActivo = useAlgunOverlayActivo();

  // Cerrar el modal al navegar. Mismo patrón que el header: ajuste durante el
  // render, no en un efecto, para que la página nueva nunca llegue a pintarse
  // con la promoción encima.
  //
  // Sin esto pasaban dos cosas, las dos medidas:
  //
  //  1. Tocar una pestaña del menú con la promoción abierta cambiaba la URL
  //     pero dejaba el modal `fixed inset-0` encima de la página nueva. Desde
  //     el asiento de la persona la pantalla no cambiaba en NADA: el síntoma
  //     exacto de "toco y no pasa nada" que este proyecto ya arrastró.
  //
  //  2. Peor: al entrar a /cuenta, /admin o /premio el componente devuelve
  //     null y el diálogo desaparece de la pantalla, pero `abierto` seguía en
  //     true, así que el efecto que bloquea el scroll NUNCA se limpiaba. La
  //     página quedaba congelada sin nada visible que lo explicara ni nada que
  //     tocar para soltarla: 1.170px de /cuenta y ~1.250px de la página del
  //     CUPÓN fuera de alcance, justo al final del embudo. En un celular no
  //     hay tecla Escape y el único rescate era el botón Atrás.
  const [rutaPrevia, setRutaPrevia] = useState(pathname);
  if (pathname !== rutaPrevia) {
    setRutaPrevia(pathname);
    setAbierto(false);
  }

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

  // El botón flotante se APARTA cuando estaría robando un toque.
  //
  // Es `fixed`, así que lo que tape no depende de dónde esté en el HTML sino de
  // dónde quede el scroll. Midiéndolo pantalla por pantalla en un iPhone, en
  // seis de las ocho páginas había algún momento en que se comía un elemento:
  // el botón de "Google Maps" de /contacto — tocarlo abría la promoción en vez
  // de las direcciones — y los enlaces del pie ("Máquinas Nuevas", "Términos",
  // "Contacto") en casi todas.
  //
  // Reservar espacio abajo no lo arregla: eso solo corre el final del
  // documento, y un elemento `fixed` se planta encima de cualquier cosa que
  // pase por debajo mientras se hace scroll.
  //
  // Así que se comprueba lo que hay DEBAJO. `elementsFromPoint` devuelve toda
  // la pila en ese punto; si pasado el propio botón aparece algo que se puede
  // tocar, el botón se retira hasta que ese elemento deje de estar debajo. La
  // promoción siempre se puede volver a abrir un dedo más arriba o más abajo,
  // pero el toque de la persona SIEMPRE llega a donde apuntó.
  const [estorbando, setEstorbando] = useState(false);

  useEffect(() => {
    if (oculto || abierto) return;

    let pendiente = 0;
    const revisar = () => {
      pendiente = 0;
      const el = botonRef.current;
      if (!el) return;

      const r = el.getBoundingClientRect();
      // Margen de holgura: pegarse a un precio sin llegar a taparlo también
      // estorba para leerlo.
      const M = 6;

      // Se comparan RECTÁNGULOS, no puntos sueltos.
      //
      // Antes esto muestreaba cinco puntos del botón (las cuatro esquinas y el
      // centro) y miraba qué había debajo. Es rápido, pero se le escapaba todo
      // lo que cayera ENTRE los puntos: con el botón de 138px de ancho sobre
      // una pantalla de 320, un precio como "$22.95" cabe entero en un hueco
      // del muestreo. Así seguía tapando cifras en la carta y el chip de filtro
      // del tablero después de "arreglarlo".
      //
      // Recorrer los candidatos y cruzar rectángulos es exacto y cuesta poco:
      // son unas decenas de elementos, una vez por cuadro.
      const tapa = [
        ...document.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [role="button"], .tabular',
        ),
      ].some((otro) => {
        if (otro === el || el.contains(otro) || otro.contains(el)) return false;
        const q = otro.getBoundingClientRect();
        if (q.width < 2 || q.height < 2) return false;
        // Fuera de la ventana no molesta a nadie.
        if (q.bottom < 0 || q.top > window.innerHeight) return false;
        const cs = getComputedStyle(otro);
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') {
          return false;
        }
        return !(
          q.right < r.left - M ||
          q.left > r.right + M ||
          q.bottom < r.top - M ||
          q.top > r.bottom + M
        );
      });

      setEstorbando((antes) => (antes === tapa ? antes : tapa));
    };

    const alVuelo = () => {
      // Una sola medición por cuadro: `elementsFromPoint` fuerza al navegador a
      // recalcular la maquetación, y hacerlo en cada evento de scroll de un
      // celular se nota en el dedo.
      if (!pendiente) pendiente = requestAnimationFrame(revisar);
    };

    revisar();
    window.addEventListener('scroll', alVuelo, { passive: true });
    window.addEventListener('resize', alVuelo);
    return () => {
      if (pendiente) cancelAnimationFrame(pendiente);
      window.removeEventListener('scroll', alVuelo);
      window.removeEventListener('resize', alVuelo);
    };
  }, [oculto, abierto]);

  // Al cerrar hay que devolver el foco, pero NO se puede hacer aquí mismo.
  //
  // El botón flotante se desmonta mientras el modal está abierto (`{!abierto &&
  // ...}`), y casi siempre es él quien tenía el foco al abrirse. Llamar a
  // `activoPrevio.current.focus()` dentro de `cerrar` enfoca un nodo ya
  // despegado del documento: no lanza, no hace nada, y el foco se cae al
  // `body`. Quien navega con teclado o lector de pantalla volvía al principio
  // de la página cada vez que cerraba la promoción.
  //
  // Se marca la intención y se ejecuta en un efecto, después de que React haya
  // vuelto a montar el botón: para entonces el nodo existe otra vez.
  const devolverFoco = useRef(false);
  const cerrar = useCallback(() => {
    setAbierto(false);
    try {
      window.localStorage.setItem(CLAVE_VISTO, new Date().toDateString());
    } catch {
      /* sin almacenamiento: se volverá a mostrar, y no pasa nada */
    }
    devolverFoco.current = true;
  }, []);

  useEffect(() => {
    if (abierto || !devolverFoco.current) return;
    devolverFoco.current = false;
    const previo = activoPrevio.current;
    // Si el nodo de antes sigue vivo, ahí vuelve el foco. Si no (el caso
    // normal: era el propio botón flotante), al botón recién remontado.
    const destino =
      previo && document.contains(previo) ? previo : botonRef.current;
    destino?.focus?.();
  }, [abierto]);

  const abrir = useCallback(() => {
    activoPrevio.current = document.activeElement as HTMLElement;
    setAbierto(true);
  }, []);

  // Escape para cerrar, y el foco atrapado dentro del diálogo mientras está
  // abierto: sin esto, tabular saca el foco a la página de atrás y quien navega
  // con teclado o lector de pantalla se pierde.
  useEffect(() => {
    // `!oculto` además de `!abierto`: cinturón y tirantes. El cierre al navegar
    // de arriba ya evita el caso, pero si alguna vez se monta este componente
    // con `abierto` en true en una ruta oculta, el scroll del sitio no se puede
    // quedar bloqueado. Bloquear el scroll es de las poquísimas cosas que, si
    // se escapan, dejan la página inservible sin dar ninguna pista.
    if (!abierto || oculto) return;

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
  }, [abierto, oculto, cerrar]);

  // No hace falta una bandera de "ya montó": lo primero que se pinta (el botón
  // flotante) es idéntico en servidor y cliente. Lo único que depende del
  // navegador es localStorage, y eso vive dentro de un efecto.
  if (oculto) return null;

  return (
    <>
      {!abierto && (
        <button
          ref={botonRef}
          type="button"
          onClick={abrir}
          // Mientras estorba se apaga DE VERDAD, no solo a la vista:
          // `pointer-events-none` para que el toque atraviese, `tabIndex={-1}` y
          // `aria-hidden` para que no lo pise el teclado ni lo lea un lector de
          // pantalla. Con solo bajarle la opacidad seguiría interceptando el
          // toque, que es justo el fallo que se quiere quitar.
          tabIndex={estorbando ? -1 : undefined}
          aria-hidden={estorbando || undefined}
          className={`anim-flotar fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-gradient-to-b from-dorado-3 to-dorado-2 px-5 py-3.5 font-display text-sm font-bold text-tinta shadow-premio transition-[transform,opacity] hover:scale-105 active:scale-95 ${
            estorbando ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <span aria-hidden="true" className="text-lg leading-none">
            🎰
          </span>
          GANA {PROMO.prizeLabel}
        </button>
      )}

      {abierto && (
        <div
          // pt-24 SIEMPRE, y en sm+ pt-20: el relleno superior nunca baja de los
          // 4,5rem que mide el header.
          //
          // Antes era `sm:pt-4`. El header es `sticky top-0 z-50` y este
          // overlay es z-40, así que el header le pasa POR ENCIMA. Un teléfono
          // acostado mide 844x390: entra en `sm:`, el diálogo subía a y=16 y su
          // botón "Cerrar" quedaba en y=33..69, entero debajo del header.
          // Medido con una rejilla de 4px sobre todo el rectángulo del botón:
          // 0 de 121 puntos llegaban al botón, los 121 caían en el header. El
          // pop-up se abre solo, y quien mira el sitio con el teléfono
          // acostado se encontraba la promoción encima y el único botón para
          // quitarla sin respuesta.
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-tinta/45 p-4 pt-24 backdrop-blur-sm sm:items-center sm:pt-20"
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
