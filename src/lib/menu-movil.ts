'use client';

import { useSyncExternalStore } from 'react';

/**
 * Si el menú móvil del header está abierto, en cualquier instante.
 *
 * Header y PromoLauncher son componentes independientes que no se conocen
 * entre sí, pero comparten pantalla: el pop-up de promoción se abre solo,
 * en modo fijo de pantalla completa (z-50, por encima del header). Sin este
 * puente, el temporizador de 2.2s del pop-up podía dispararse justo mientras
 * alguien tenía el menú abierto y estaba a punto de tocar un link — el
 * overlay se montaba encima a mitad de la interacción y se comía el toque.
 * El sitio se sentía "congelado" sin ningún error de por medio.
 */
let abierto = false;
const listeners = new Set<() => void>();

export function setMenuMovilAbierto(valor: boolean) {
  if (valor === abierto) return;
  abierto = valor;
  listeners.forEach((l) => l());
}

export function useMenuMovilAbierto(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => abierto,
    () => false,
  );
}
