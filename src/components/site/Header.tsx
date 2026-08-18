'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { NAV } from '@/lib/site';

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

  return (
    <header
      className={`sticky top-0 z-40 transition-colors duration-300 ${
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
        <nav id="menu-movil" className="contenedor pb-4 lg:hidden" aria-label="Principal (móvil)">
          <ul className="grid gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
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
        </nav>
      )}
    </header>
  );
}
