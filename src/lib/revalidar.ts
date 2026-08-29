import 'server-only';
import { revalidatePath } from 'next/cache';

/**
 * Refrescar las páginas públicas cuando el personal publica algo.
 *
 * Las páginas del sitio se sirven de caché (ver el comentario de `revalidate`
 * en cualquiera de ellas) porque consultar la base en cada visita fue lo que
 * dejaba las pestañas colgadas 300 s. La caché se rehace sola cada minuto,
 * pero "cada minuto" no sirve cuando alguien acaba de subir el evento del
 * sábado y quiere verlo YA: sin esto, publicaría y la página seguiría igual,
 * que es la forma más rápida de que el personal deje de confiar en el panel.
 *
 * Un cambio toca más de una página: un evento sale en /eventos y también en la
 * portada. Por eso el mapa es explícito — si mañana la portada deja de mostrar
 * eventos, se quita de aquí y no queda nadie invalidando de más.
 */

export type ContenidoEditable =
  | 'eventos'
  | 'maquinas'
  | 'galeria'
  | 'menu'
  | 'jackpots'
  | 'horario';

const RUTAS: Record<ContenidoEditable, string[]> = {
  eventos: ['/', '/eventos'],
  maquinas: ['/', '/maquinas-nuevas'],
  galeria: ['/galeria'],
  menu: ['/menu'],
  jackpots: ['/', '/jackpots'],
  // El horario sale en la portada (la banda del parte del día), en el pie de
  // TODAS las páginas y en Contacto. El pie está en el layout, así que hay que
  // refrescar cada página que lo lleve: por eso la lista es larga y explícita.
  horario: ['/', '/jackpots', '/maquinas-nuevas', '/eventos', '/galeria', '/menu', '/contacto', '/cuenta'],
};

export function refrescarPublico(tipo: ContenidoEditable): void {
  for (const ruta of RUTAS[tipo]) revalidatePath(ruta);
}
