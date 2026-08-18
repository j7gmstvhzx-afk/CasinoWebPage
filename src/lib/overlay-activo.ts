'use client';

import { useSyncExternalStore } from 'react';

/**
 * Si algún overlay de pantalla completa está abierto ahora mismo, en
 * cualquier instante — por id, no un booleano único.
 *
 * Header, PromoLauncher y Galeria son componentes independientes que no se
 * conocen entre sí, pero comparten pantalla: el pop-up de promoción se abre
 * solo, en modo fijo de pantalla completa, y el visor de la galería también.
 * Sin este registro, el temporizador de 2.2s del pop-up podía dispararse
 * justo mientras alguien tenía el menú (o el visor) abierto y estaba a punto
 * de tocar un link — el overlay se montaba encima a mitad de la interacción
 * y se comía el toque. El sitio se sentía "congelado" sin ningún error de
 * por medio.
 *
 * Es un registro por id (no un solo booleano) para que cualquier overlay
 * futuro pueda apuntarse sin inventar otra señal a mano cada vez.
 *
 * subscribe/getSnapshot/getServerSnapshot son funciones fijas a nivel de
 * módulo a propósito: useSyncExternalStore vuelve a suscribirse cada vez que
 * cambia la referencia que recibe, y unas closures nuevas en cada render
 * reenganchan sin necesidad.
 */
const overlaysActivos = new Set<string>();
const listeners = new Set<() => void>();

export function setOverlayActivo(id: string, activo: boolean) {
  const tenia = overlaysActivos.has(id);
  if (activo === tenia) return;
  if (activo) overlaysActivos.add(id);
  else overlaysActivos.delete(id);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return overlaysActivos.size > 0;
}

function getServerSnapshot() {
  return false;
}

export function useAlgunOverlayActivo(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
