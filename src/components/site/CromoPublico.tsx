'use client';

import { usePathname } from 'next/navigation';

/**
 * La cabecera, el pie y el botón de la tragamonedas: solo en el sitio público.
 *
 * POR QUÉ
 * -------
 * El panel del personal vive dentro del mismo layout que el sitio, así que
 * quien entra a administrar ve, alrededor de su trabajo: el menú del visitante
 * (Inicio, Jackpots, Galería…), el botón flotante de "GANA $25", la línea de
 * ayuda de juego compulsivo y el aviso de +18. Todo eso está pensado para un
 * cliente, no para quien va a teclear los montos de las máquinas.
 *
 * El resultado es que el panel no se siente como una herramienta sino como una
 * página más del casino, y que la mitad de lo que hay en pantalla no sirve para
 * lo que se ha venido a hacer. El dueño lo dijo con estas palabras: la cuenta de
 * administrador no le resulta normal ni intuitiva.
 *
 * SE HACE EN EL NAVEGADOR, Y ES A PROPÓSITO
 * -----------------------------------------
 * Un layout de servidor no sabe qué ruta está pintando; `usePathname` sí. Como
 * este componente se pinta también en el servidor con la ruta correcta, no hay
 * parpadeo: el HTML que sale ya viene sin la cabecera pública.
 *
 * Lo que sí cuesta es que la cabecera y el pie se siguen construyendo en el
 * servidor aunque no se enseñen —el pie consulta el horario—, pero esa consulta
 * va cacheada por petición (`cache()` en `getHorario`) y es una sola. La
 * alternativa era mover las diez páginas públicas a un grupo de rutas aparte, y
 * no vale un movimiento de ese tamaño para ahorrar una consulta.
 */
export function CromoPublico({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  if (ruta.startsWith('/admin')) return null;
  return <>{children}</>;
}
