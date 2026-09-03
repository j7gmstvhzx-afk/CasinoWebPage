/**
 * Una foto metida entera en un recuadro, venga con la forma que venga.
 *
 * EL PROBLEMA
 * -----------
 * Las fotos las hace el personal con el teléfono y cada una tiene una forma
 * distinta. El recuadro de las tarjetas es apaisado (16:10) y hasta ahora la
 * foto se pintaba con `object-cover`, que RELLENA el recuadro RECORTANDO lo que
 * sobra. Con una foto vertical —que es como se fotografía una tragamonedas, de
 * pie— eso recorta la parte de arriba y la de abajo: se publicaba una franja
 * del medio de la máquina. Lo reportó el dueño.
 *
 * `object-contain` mete la foto entera, pero deja huecos a los lados, y un
 * hueco vacío en una tarjeta se lee como que algo falló.
 *
 * LA SOLUCIÓN: EL HUECO SE RELLENA CON LA PROPIA FOTO
 * ---------------------------------------------------
 * Detrás va una copia de la misma foto, ampliada y desenfocada, y encima la
 * foto entera sin recortar. El resultado ocupa el recuadro completo, tiene los
 * colores de la propia foto —así que nunca desentona— y no se pierde ni un
 * pedazo de la máquina.
 *
 * Es la misma copia: el navegador la descarga una vez y la pinta dos, así que
 * no cuesta ni una petición más.
 *
 * POR QUÉ NO SE RECORTA EL ARCHIVO AL SUBIRLO
 * -------------------------------------------
 * Se podría recortar y rellenar la imagen en el servidor al guardarla, pero eso
 * deja el marco QUEMADO dentro del archivo: si mañana la tarjeta cambia de
 * forma, todas las fotos viejas se quedan con el marco viejo, y para arreglarlo
 * habría que volver a subirlas una por una. Encajándola al pintarla, la foto
 * original se guarda intacta y se adapta sola a cualquier recuadro.
 */
export function FotoEncajada({
  src,
  alt,
  proporcion = 'aspect-[16/10]',
}: {
  src: string;
  alt: string;
  proporcion?: string;
}) {
  return (
    <div className={`relative ${proporcion} w-full overflow-hidden bg-superficie`}>
      {/* El relleno. Decorativo entero: es la misma foto de al lado, así que
          un lector de pantalla no se pierde nada saltándoselo. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl saturate-150"
      />

      {/* La foto de verdad, entera. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="relative h-full w-full object-contain"
      />
    </div>
  );
}
