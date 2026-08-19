'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
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

  const activo = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

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

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={activo(item.href) ? 'page' : undefined}
              className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                activo(item.href)
                  ? 'bg-marca/10 text-tinta'
                  : 'text-tenue hover:bg-superficie hover:text-tinta'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Acceso al panel de empleados, discreto pero A LA VISTA: antes solo
            vivía en una línea diminuta al fondo del pie de página y ni el
            propio dueño la encontraba. Aquí, junto al resto de la navegación,
            se ve en todo momento sin quedar en la cara del cliente. */}
        <Link
          href="/admin"
          className="hidden shrink-0 items-center gap-1.5 rounded-full border border-linea px-3 py-1.5 text-xs font-medium text-tenue transition-colors hover:border-cian hover:text-cian lg:inline-flex"
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
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-linea lg:hidden"
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
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setAbierto(false)}
                  aria-current={activo(item.href) ? 'page' : undefined}
                  className={`block rounded-xl px-4 py-3 text-base font-medium ${
                    activo(item.href) ? 'bg-marca/10 text-tinta' : 'text-tenue'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/admin"
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
