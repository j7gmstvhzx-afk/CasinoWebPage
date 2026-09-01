'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Las pestañas del panel.
 *
 * ES CLIENTE POR UNA SOLA RAZÓN: SABER DÓNDE ESTÁS
 * ------------------------------------------------
 * La versión anterior era una lista de enlaces en el layout del servidor, y
 * ninguno se marcaba: las nueve pestañas se veían exactamente igual en todas
 * las pantallas. Quien lo usa no tenía forma de saber en cuál estaba más que
 * leyendo el título de la página. Con `usePathname` la pestaña activa se marca
 * sola, y `aria-current="page"` se lo dice también a quien navega con lector de
 * pantalla o con teclado.
 *
 * EL SUBRAYADO SE MARCA AL INSTANTE
 * ---------------------------------
 * Junto con `loading.tsx`, la navegación entra de inmediato en la ruta nueva:
 * la pestaña se marca en cuanto se pulsa, no cuando el servidor termina de
 * consultar la base. Antes el clic no producía ningún cambio visible hasta que
 * llegaba la página entera, y eso se sentía como que no había pasado nada.
 *
 * `/admin` se compara EXACTO y las demás por prefijo: `/admin` es prefijo de
 * todas, así que con `startsWith` la pestaña de Resumen se quedaría encendida
 * en las nueve pantallas.
 */
const ENLACES = [
  { href: '/admin', label: 'Resumen' },
  { href: '/admin/canjear', label: 'Canjear' },
  { href: '/admin/jackpots', label: 'Jackpots' },
  { href: '/admin/eventos', label: 'Promociones' },
  { href: '/admin/maquinas-nuevas', label: 'Máquinas nuevas' },
  { href: '/admin/menu', label: 'Menú' },
  { href: '/admin/horario', label: 'Horario' },
  { href: '/admin/ganadores', label: 'Ganadores' },
  { href: '/admin/clientes', label: 'Clientes' },
];

export function NavPanel() {
  const ruta = usePathname();

  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Secciones del panel">
      {ENLACES.map((e) => {
        const activa = e.href === '/admin' ? ruta === '/admin' : ruta.startsWith(e.href);
        return (
          <Link
            key={e.href}
            href={e.href}
            aria-current={activa ? 'page' : undefined}
            className={
              activa
                ? 'rounded-full bg-marca px-4 py-2 text-sm font-semibold text-white'
                : 'rounded-full px-4 py-2 text-sm font-medium text-tenue transition-colors hover:bg-marca/10 hover:text-tinta'
            }
          >
            {e.label}
          </Link>
        );
      })}
    </nav>
  );
}
