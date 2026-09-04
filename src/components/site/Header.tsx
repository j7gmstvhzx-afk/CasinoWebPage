'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { NAV } from '@/lib/site';
import { setOverlayActivo } from '@/lib/overlay-activo';

export function Header() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [desplazado, setDesplazado] = useState(false);

  useEffect(() => {
    const onScroll = () => setDesplazado(window.scrollY > 8);
    // La lectura inicial va en un frame aparte y no en el cuerpo del efecto.
    // Llamarla de forma síncrona ahí encadena un render extra en cada montaje;
    // hace falta igual para la navegación con "atrás", que restaura el scroll.
    const id = requestAnimationFrame(onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Cerrar el menú al navegar: sin esto, en celular queda el panel abierto
  // encima de la página nueva.
  //
  // Va durante el render y no en un efecto. Es el patrón que recomienda React
  // para ajustar estado cuando cambia una prop: React descarta el render a
  // medias y vuelve a empezar con el valor nuevo, sin llegar a pintar el estado
  // viejo. Con un efecto, el menú se vería abierto sobre la página nueva
  // durante un frame antes de cerrarse.
  const [rutaPrevia, setRutaPrevia] = useState(pathname);
  if (pathname !== rutaPrevia) {
    setRutaPrevia(pathname);
    setAbierto(false);
  }

  /**
   * Indicador que se DESLIZA entre pestañas.
   *
   * Un fondo por pestaña (lo que había antes) hace que la barra parezca una
   * lista de botones. Una sola pastilla que viaja de una a otra hace que
   * parezca un solo control con una posición — y de paso enseña de dónde
   * vienes al navegar, que es información real, no adorno.
   *
   * Sigue al ratón y vuelve sola a la pestaña activa al salir. Se mide con
   * offsetLeft/offsetWidth contra el <nav>, que es el contenedor posicionado,
   * en vez de getBoundingClientRect: así el valor no depende del scroll ni de
   * dónde esté el header en ese momento.
   */
  const navRef = useRef<HTMLElement>(null);
  const [pastilla, setPastilla] = useState<{ x: number; w: number } | null>(null);

  const moverA = useCallback((el: HTMLElement | null) => {
    if (el) setPastilla({ x: el.offsetLeft, w: el.offsetWidth });
  }, []);

  const alActivo = useCallback(() => {
    moverA(navRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? null);
  }, [moverA]);

  // Se recoloca al navegar y al cambiar el ancho. El ResizeObserver es
  // necesario además del evento de resize: las fuentes cargan después del
  // primer render y cambian el ancho de las pestañas sin que la ventana se
  // mueva, dejando la pastilla descuadrada hasta el siguiente clic.
  useEffect(() => {
    alActivo();
    const nav = navRef.current;
    if (!nav) return;
    const ro = new ResizeObserver(alActivo);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [alActivo, pathname]);

  const activo = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  // Escape cierra el menú, y pasar a la maqueta de escritorio también.
  //
  // Sin lo primero, quien abre el menú con teclado tenía que retroceder nueve
  // paradas con Shift+Tab para llegar al botón y cerrarlo. Escape es lo que
  // todo el mundo intenta primero.
  //
  // Lo segundo es un estado que se quedaba mintiendo: al ensanchar de celular
  // a escritorio con el menú abierto, el panel se esconde solo (`lg:hidden`)
  // pero `abierto` seguía en true, así que la hamburguesa —ya invisible—
  // seguía diciendo `aria-expanded="true"`. Medido: {menuVisible:"none",
  // hamburguesaVisible:"none", ariaExpanded:"true"}.
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    // El mismo 1024px del `lg:` de Tailwind, que es donde el panel se esconde.
    const anchaEscritorio = window.matchMedia('(min-width: 1024px)');
    const alCambiar = () => anchaEscritorio.matches && setAbierto(false);
    alCambiar();
    document.addEventListener('keydown', onKey);
    anchaEscritorio.addEventListener('change', alCambiar);
    return () => {
      document.removeEventListener('keydown', onKey);
      anchaEscritorio.removeEventListener('change', alCambiar);
    };
  }, [abierto]);

  // Le avisa al registro de overlays que este menú está abierto: los dos son
  // overlays de pantalla completa independientes, y sin este aviso el pop-up
  // de promoción (o el visor de la galería) podía montarse encima a mitad de
  // un toque.
  useEffect(() => {
    setOverlayActivo('menu-movil', abierto);
    return () => setOverlayActivo('menu-movil', false);
  }, [abierto]);

  // JERARQUÍA DE SUPERPOSICIÓN, fijada aquí a propósito porque ya se rompió
  // una vez por no estar escrita en ningún sitio:
  //
  //   z-[60]  el enlace "Saltar al contenido" del layout — por encima de TODO
  //   z-50    este header — por encima de cualquier overlay de la página
  //   z-40    overlays de pantalla completa (pop-up de promoción, visor de
  //           galería) — por encima del contenido normal, por debajo del header
  //
  // La regla de fondo: el header NUNCA puede quedar por debajo de un overlay,
  // sea cual sea. Cuando el pop-up de promoción compartía el mismo nivel que
  // el header, su botón de menú se volvía untocable en cuanto el pop-up se
  // abría solo (algo que pasa constantemente, sin que nadie lo pida) — el
  // visitante tocaba el menú y no pasaba nada, porque el toque caía sobre el
  // overlay, no sobre el botón. Cualquier overlay nuevo que se agregue debe
  // quedar en z-40 o menos, nunca igualar o superar z-50.
  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        desplazado || abierto
          ? 'border-b border-linea bg-fondo/90 backdrop-blur-xl'
          : 'border-b border-transparent'
      }`}
    >
      <div className="contenedor flex h-[4.5rem] items-center justify-between gap-4">
        <Link href="/" aria-label="Casino Atlántico Manatí — Inicio">
          <Logo />
        </Link>

        <nav
          ref={navRef}
          onMouseLeave={alActivo}
          className="relative hidden items-center gap-0.5 lg:flex"
          aria-label="Principal"
        >
          {/* La pastilla va DETRÁS del texto (-z-10) y no lo tapa. Solo se
              pinta cuando ya se midió: sin eso, en el primer render aparece
              en x=0 y se ve cruzar la barra de un lado a otro al cargar. */}
          {pastilla && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-1 -z-10 rounded-full bg-superficie-2 transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ width: pastilla.w, transform: `translateX(${pastilla.x}px)` }}
            />
          )}
          {NAV.map((item) => {
            const esActivo = activo(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={esActivo ? 'page' : undefined}
                onMouseEnter={(e) => moverA(e.currentTarget)}
                onFocus={(e) => moverA(e.currentTarget)}
                className={`group relative rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-200 ${
                  esActivo ? 'text-tinta' : 'text-tenue hover:text-tinta'
                }`}
              >
                {item.label}
                {/* La línea de la pestaña activa. `scale-x` en vez de width
                    para que la anime el compositor y no dispare relayout. */}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-3.5 bottom-1 h-[2px] origin-left rounded-full bg-gradient-to-r from-cian-2 to-marca-2 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    esActivo ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        {/* Acceso al panel de empleados, discreto pero A LA VISTA: antes solo
            vivía en una línea diminuta al fondo del pie de página y ni el
            propio dueño la encontraba. Aquí, junto al resto de la navegación,
            se ve en todo momento sin quedar en la cara del cliente. */}
        {/* prefetch={false} NO ES UN DETALLE DE RENDIMIENTO CUALQUIERA.
            /admin es force-dynamic: no tiene página horneada que precargar, así
            que cada precarga EJECUTA la función en el servidor y sus consultas
            contra la base. Y Next precarga todo enlace que esté a la vista, así
            que este botón, que sale en la cabecera de TODAS las páginas
            públicas, disparaba dos renderizados del panel por cada visita de
            cualquier cliente.
            Medido en local: cargar la portada dispara 2 peticiones a /admin.
            Y en los registros de producción del 4 de septiembre se ven esos
            "GET /admin ... cache=MISS" intercalados entre las cargas públicas,
            uno de ellos gastando cinco consultas que se agotaron a los 6000 ms.
            Nadie gana nada con esto: quien va al panel escribe la contraseña,
            y ahí medio segundo no le cambia el día. */}
        <Link
          href="/admin"
          prefetch={false}
          className="hidden shrink-0 items-center gap-1.5 rounded-full border border-linea px-3 py-1.5 text-xs font-medium text-tenue transition-[color,border-color,background-color] duration-200 hover:border-cian-2 hover:bg-cian-2/8 hover:text-cian lg:inline-flex"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Personal
        </Link>

        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-controls="menu-movil"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-linea transition-[background-color,border-color,transform] duration-200 active:scale-95 active:bg-superficie-2 lg:hidden"
        >
          <span className="sr-only">{abierto ? 'Cerrar menú' : 'Abrir menú'}</span>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            {abierto ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {abierto && (
        // ESTE es el fallo que se reportó cinco veces como "toco la pestaña y
        // no pasa nada", y no era ni z-index ni temporizadores: el panel vive
        // DENTRO de un header `sticky top-0`, que por definición nunca se
        // desplaza. Sin altura máxima ni scroll propio, todo lo que caiga por
        // debajo del borde de la ventana queda FÍSICAMENTE inalcanzable — no
        // hay gesto que lo traiga a la vista.
        //
        // Abierto mide ~494px. En un teléfono en horizontal (que sigue usando
        // el menú móvil, porque el corte de escritorio es lg=1024px) la
        // ventana tiene 342-412px de alto: "Menú" y "Contacto" simplemente no
        // están ahí para tocarlos. Lo mismo pasa en vertical con el texto del
        // sistema agrandado, que es un ajuste de accesibilidad muy común.
        //
        // 100dvh y no 100vh: en móvil la barra del navegador aparece y
        // desaparece, y vh se queda con la altura grande, dejando el mismo
        // hueco inalcanzable que se pretende arreglar.
        <nav
          id="menu-movil"
          className="contenedor max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain pb-4 lg:hidden"
          aria-label="Principal (móvil)"
        >
          <ul className="grid gap-1">
            {/* onClick cierra el menú en CUALQUIER toque, además del efecto
                de arriba que lo cierra cuando cambia la ruta. Hacen falta los
                dos: si el visitante toca el link de la pestaña en la que ya
                está, el pathname no cambia, el efecto nunca dispara, y el
                menú se quedaba abierto sin ninguna reacción visible — se
                sentía como que el toque no hacía nada. */}
            {NAV.map((item, n) => {
              const esActivo = activo(item.href);
              return (
                <li
                  key={item.href}
                  className="anim-entrar"
                  // Entrada escalonada: 34ms entre pestañas. El menú deja de
                  // "aparecer" y pasa a "desplegarse", que es lo que hace que
                  // se sienta una pieza y no un bloque que se enciende.
                  // Tope en 8 para que un menú largo no acabe con la última
                  // pestaña entrando medio segundo tarde.
                  style={{ animationDelay: `${Math.min(n, 8) * 34}ms` }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setAbierto(false)}
                    aria-current={esActivo ? 'page' : undefined}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 text-base font-medium transition-colors active:bg-superficie-2 ${
                      esActivo ? 'bg-superficie-2 text-tinta' : 'text-tenue'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {/* Marca de la pestaña activa: una barra de color a la
                          izquierda. En celular no hay ratón, así que el estado
                          "aquí estás" tiene que verse sin interacción. */}
                      <span
                        aria-hidden="true"
                        className={`h-5 w-[3px] rounded-full transition-colors ${
                          esActivo ? 'bg-cian-2' : 'bg-transparent'
                        }`}
                      />
                      {item.label}
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className={`h-4 w-4 transition-opacity ${esActivo ? 'opacity-100 text-cian' : 'opacity-0'}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href="/admin"
            prefetch={false}
            onClick={() => setAbierto(false)}
            className="mt-3 block border-t border-linea px-4 pt-3 text-sm font-medium text-tenue/70"
          >
            Personal — acceso de empleados
          </Link>
        </nav>
      )}
    </header>
  );
}
