'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Las pestañas del panel.
 *
 * ES CLIENTE POR UNA SOLA RAZÓN: SABER DÓNDE ESTÁS
 * ------------------------------------------------
 * La versión anterior era una lista de enlaces en el layout del servidor, y
 * ninguno se marcaba: las pestañas se veían exactamente igual en todas
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
 * en todas las pantallas.
 */
const ENLACES = [
  { href: '/admin', label: 'Resumen' },
  { href: '/admin/canjear', label: 'Canjear' },
  { href: '/admin/jackpots', label: 'Jackpots' },
  { href: '/admin/eventos', label: 'Promociones' },
  { href: '/admin/maquinas-nuevas', label: 'Máquinas nuevas' },
  // "Comida", igual que se llama en el menú del sitio. Se llamaba "Menú" aquí y
  // "Comida" allá: dos nombres para la misma pestaña obligan a traducir mentalmente
  // cada vez, y de paso "Menú" en un panel se confunde con el menú de navegación.
  { href: '/admin/menu', label: 'Comida' },
  { href: '/admin/galeria', label: 'Galería' },
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
            // SIN PRECARGA, Y ESTO SE MIDIÓ.
            //
            // Next precarga por su cuenta todo <Link> que esté a la vista. Las
            // diez pestañas están siempre a la vista, así que ABRIR UNA sola
            // pantalla disparaba VEINTE peticiones al servidor: las diez
            // pestañas, dos veces cada una. Contadas en el navegador.
            //
            // En los registros de producción eso se ve como ráfagas de diez
            // rutas del panel en el mismo segundo, y justo ahí aparecen las
            // consultas que se agotan a los 6,5 s: cada petición despierta su
            // propia función en Vercel, y cada función abre sus propias
            // conexiones contra el mismo Supabase.
            //
            // La precarga existe para que el clic sea instantáneo. Aquí no hace
            // falta: `loading.tsx` ya pinta el esqueleto en cuanto se pulsa,
            // sin ir al servidor. Se paga con veinte peticiones algo que ya
            // estaba resuelto gratis.
            prefetch={false}
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
