/**
 * Encoger una foto en el navegador ANTES de subirla.
 *
 * POR QUÉ
 * -------
 * Las fotos salen del teléfono a 12 megapíxeles y cuatro o cinco megas. Sin
 * esto pasan dos cosas, las dos malas:
 *
 *   - Las que pasan de 8 MB se RECHAZAN, y el empleado se queda con un error y
 *     sin manera de arreglarlo (no va a abrir un editor de fotos).
 *   - Las que caben se publican tal cual, así que cada visitante se descarga
 *     cinco megas para ver una tarjeta de 380 píxeles de ancho. En un teléfono
 *     con datos, eso es la diferencia entre una página que abre y una que no.
 *
 * El dueño lo pidió así: que sea automático, sin importar de qué tamaño sea la
 * foto. Encogerla es la mitad del "sin importar el tamaño" — la otra mitad es
 * encajarla en el recuadro, y de eso se encarga FotoEncajada.
 *
 * QUÉ HACE Y QUÉ NO
 * -----------------
 * Reduce en proporción hasta que el lado más largo quepa en LADO_MAX. NO
 * RECORTA NADA: la foto sigue entera, con su misma forma, solo que más
 * pequeña.
 *
 * Y AUNQUE QUEPA POR TAMAÑO, SI PESA DEMASIADO SE VUELVE A COMPRIMIR.
 *
 * Antes solo se miraban las dimensiones, y eso dejaba pasar el caso peor de
 * todos: un PNG exportado de un diseño —un flyer de promoción, típicamente— que
 * mide 1200 px y pesa seis megas. Cabía de sobra en LADO_MAX, así que no se
 * tocaba, y se publicaba entero. Cada visitante con datos se descargaba seis
 * megas para ver una tarjeta.
 *
 * La regla ahora son dos, y basta con que falle una: cabe por lado Y pesa poco.
 *
 * SI ALGO SALE MAL, SE SUBE LA ORIGINAL
 * -------------------------------------
 * Un navegador viejo, un formato raro, una foto corrupta a medio leer: en
 * cualquiera de esos casos esto devuelve el archivo tal como llegó y la subida
 * sigue su curso. Es una mejora, no un peaje: nunca puede impedir que alguien
 * suba una foto.
 */

/** Lado más largo, en píxeles. La tarjeta más grande del sitio no llega a 700. */
const LADO_MAX = 1600;

/** Calidad del JPEG resultante. 0.85 es el punto donde el ojo deja de notarlo. */
const CALIDAD = 0.85;

/**
 * A partir de aquí se recomprime aunque la foto quepa por tamaño.
 *
 * Un JPEG de 1600 px bien comprimido ronda los 300-500 KB. Se pone el listón en
 * 900 KB para no tocar las que ya están razonables —volver a comprimir lo que
 * ya está bien solo quita calidad— y sí atrapar las que claramente no lo están.
 */
const PESO_MAX = 900 * 1024;

export type ResultadoEncoger = {
  archivo: File;
  /** true si de verdad se encogió. Sirve para decírselo a quien la sube. */
  cambiada: boolean;
  bytesAntes: number;
  bytesDespues: number;
};

export async function encogerImagen(archivo: File): Promise<ResultadoEncoger> {
  const igual = (): ResultadoEncoger => ({
    archivo,
    cambiada: false,
    bytesAntes: archivo.size,
    bytesDespues: archivo.size,
  });

  // Los animados no se tocan: al pasarlos por el lienzo se quedarían en el
  // primer fotograma, que es peor que una foto grande.
  if (archivo.type === 'image/gif') return igual();
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return igual();

  try {
    // `imageOrientation: 'from-image'` NO es opcional: las fotos de teléfono
    // llevan la orientación en los metadatos, y al dibujarlas en un lienzo sin
    // esto salen tumbadas. Se publicaría la máquina de lado.
    const mapa = await createImageBitmap(archivo, { imageOrientation: 'from-image' });

    const lado = Math.max(mapa.width, mapa.height);
    const escala = Math.min(1, LADO_MAX / lado);

    // Ya está bien por las dos cosas —cabe de lado y no pesa— así que no se
    // toca. Volver a comprimir una foto que ya está bien solo le quita calidad.
    if (escala === 1 && archivo.size <= PESO_MAX) {
      mapa.close();
      return igual();
    }

    const w = Math.round(mapa.width * escala);
    const h = Math.round(mapa.height * escala);

    const lienzo = document.createElement('canvas');
    lienzo.width = w;
    lienzo.height = h;
    const ctx = lienzo.getContext('2d');
    if (!ctx) {
      mapa.close();
      return igual();
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(mapa, 0, 0, w, h);
    mapa.close();

    // Un PNG se guarda como PNG SOLO SI DE VERDAD USA LA TRANSPARENCIA.
    //
    // La regla de antes era "si entró PNG, sale PNG", por miedo a que un fondo
    // transparente se pintara de negro al pasar a JPEG. El miedo es correcto,
    // la regla no: casi ningún PNG que sube el personal tiene transparencia —
    // son capturas de pantalla y exportaciones de flyers, opacas de arriba
    // abajo— y volver a guardarlas como PNG no las encoge nada. Ese era el
    // agujero: el flyer de seis megas pasaba por aquí, salía igual de grande,
    // y se subía tal cual.
    //
    // Así que se MIRA. Si no hay un solo píxel translúcido, se va a JPEG y el
    // flyer baja de seis megas a menos de uno. Si lo hay, se queda en PNG y se
    // acepta que apenas encoja: perder el recorte de un logo es peor que pesar.
    const destino =
      archivo.type === 'image/png' && tieneTransparencia(ctx, w, h)
        ? 'image/png'
        : 'image/jpeg';
    const blob = await new Promise<Blob | null>((res) =>
      lienzo.toBlob(res, destino, destino === 'image/jpeg' ? CALIDAD : undefined),
    );

    // Si no salió más pequeña, no hay nada que ganar: se sube la original.
    if (!blob || blob.size >= archivo.size) return igual();

    const ext = destino === 'image/png' ? '.png' : '.jpg';
    const nombre = archivo.name.replace(/\.[^.]+$/, '') + ext;

    return {
      archivo: new File([blob], nombre, { type: destino, lastModified: Date.now() }),
      cambiada: true,
      bytesAntes: archivo.size,
      bytesDespues: blob.size,
    };
  } catch {
    return igual();
  }
}

/**
 * ¿Hay algún píxel que no sea completamente opaco?
 *
 * Se muestrea en vez de recorrer los millones de píxeles uno a uno: se salta de
 * cuatro en cuatro filas y columnas, que para un fondo transparente —que nunca
 * es un píxel suelto, sino una zona— basta y sobra, y deja la comprobación en
 * unos milisegundos en lugar de congelar el navegador del empleado.
 *
 * ANTE LA DUDA, SE DICE QUE SÍ. Si `getImageData` no se puede leer, se devuelve
 * `true`, que manda el archivo por el camino conservador (se queda en PNG). Un
 * flyer que no encoge es un problema; un logo con el fondo pintado de negro es
 * una foto arruinada.
 */
function tieneTransparencia(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    const salto = 4 * 4; // 4 canales por píxel, uno de cada cuatro píxeles
    for (let i = 3; i < data.length; i += salto) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/** "4.2 MB", "780 KB". Para decírselo a una persona, no para un registro. */
export function comoPeso(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
