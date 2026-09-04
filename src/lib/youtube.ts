/**
 * Enlaces de YouTube: sacar el identificador y armar la dirección del
 * reproductor.
 *
 * POR QUÉ NO SE GUARDA EL ENLACE TAL CUAL
 * ---------------------------------------
 * Porque nadie copia el enlace "correcto". Del teléfono sale `youtu.be/…`, del
 * botón Compartir sale con `?si=…` pegado detrás, de la app de música sale
 * `music.youtube.com`, y si la máquina se anunció en un corto sale `/shorts/…`.
 * Las cuatro son el mismo video. Pedirle al personal que sepa cuál pegar es
 * pedirle que haga de programador.
 *
 * Así que se acepta cualquiera de esas formas, se saca el identificador —once
 * caracteres, que es lo único que de verdad importa— y se guarda ESO. Lo que
 * vuelve a la página es una dirección armada por nosotros, no una cadena que
 * escribió una persona.
 *
 * Y hay una segunda razón, que es de seguridad: el identificador se guarda ya
 * validado contra `[A-Za-z0-9_-]{11}`, así que lo que acaba dentro del `src` de
 * un iframe no puede ser otra cosa. Si mañana alguien pega un `javascript:…` en
 * ese campo del panel, aquí se queda.
 */

/** Los once caracteres que YouTube usa como identificador de un video. */
const ID = /^[A-Za-z0-9_-]{11}$/;

/** Los dominios que se aceptan. Cualquier otro se rechaza. */
const CASAS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
]);

/**
 * Saca el identificador de un enlace de YouTube, o `null` si no lo es.
 *
 * Acepta también el identificador pelado, porque es lo que queda guardado en la
 * base: así esta función sirve para validar lo que entra Y para leer lo que
 * salió, sin dos caminos distintos que se puedan desincronizar.
 */
export function idDeYouTube(entrada: string | null | undefined): string | null {
  const texto = entrada?.trim();
  if (!texto) return null;

  // Ya es el identificador pelado.
  if (ID.test(texto)) return texto;

  let url: URL;
  try {
    // Sin esquema no es una URL válida para el analizador, y "youtu.be/abc" es
    // exactamente lo que sale al copiar de algunos sitios. Se le pone https
    // delante en vez de rechazarlo.
    url = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
  } catch {
    return null;
  }

  if (!CASAS.has(url.hostname)) return null;

  // youtu.be/ID  ·  youtube.com/embed/ID  ·  /shorts/ID  ·  /live/ID  ·  /v/ID
  const partes = url.pathname.split('/').filter(Boolean);
  if (url.hostname.endsWith('youtu.be')) {
    return ID.test(partes[0] ?? '') ? partes[0] : null;
  }
  if (partes.length === 2 && ['embed', 'shorts', 'live', 'v'].includes(partes[0])) {
    return ID.test(partes[1]) ? partes[1] : null;
  }

  // youtube.com/watch?v=ID
  const v = url.searchParams.get('v');
  return v && ID.test(v) ? v : null;
}

/**
 * La dirección del reproductor incrustado.
 *
 * Va a `youtube-nocookie.com` a propósito: es el mismo reproductor, servido por
 * YouTube, pero sin plantar sus cookies de seguimiento en el navegador de quien
 * entra a ver una máquina tragamonedas. No cuesta nada y evita tener que
 * explicarlo en la política de privacidad.
 *
 * `autoplay=1` solo funciona si la reproducción la desató un toque de la
 * persona — que es justo el caso: este marco no existe hasta que alguien toca
 * la foto. Un navegador no deja arrancar un video con sonido por las buenas, y
 * hace bien.
 */
export function urlIncrustada(id: string): string {
  const p = new URLSearchParams({
    autoplay: '1',
    // Sin las sugerencias de "otros videos" al terminar, que en una máquina de
    // casino pueden ser cualquier cosa y salen con la marca del salón alrededor.
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  return `https://www.youtube-nocookie.com/embed/${id}?${p}`;
}

/**
 * La miniatura oficial del video.
 *
 * Es el respaldo para cuando la máquina tiene video pero todavía no tiene foto
 * subida: antes de que exista el iframe hay que enseñar ALGO, y el fotograma
 * que YouTube ya generó es mejor que la placa gris de la marca.
 *
 * `hqdefault` y no `maxresdefault`: la de máxima resolución no existe para
 * todos los videos y cuando falta YouTube devuelve una imagen gris de 120 px,
 * que se ve como un error. `hqdefault` existe siempre.
 */
export function miniaturaDeYouTube(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
