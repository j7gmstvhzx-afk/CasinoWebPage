/**
 * Marco de imagen.
 *
 * Cuando todavía no hay foto cargada muestra un degradado de la marca con el
 * nombre, en vez de un hueco roto o un icono de imagen rota. Así el sitio se ve
 * terminado desde el primer día, aunque el personal no haya subido nada — que
 * es exactamente la situación en la que arranca.
 *
 * Se usa <img> y no next/image a propósito: las imágenes vienen de Supabase
 * Storage con rutas que el personal sube a mano, y la optimización de next/image
 * exige declarar cada dominio de antemano. Cuando se fije el dominio definitivo
 * conviene migrar y ganar el redimensionado automático.
 */
export function Marco({
  imagen,
  alt,
  proporcion = 'aspect-[16/10]',
}: {
  imagen: string | null;
  alt: string;
  proporcion?: string;
}) {
  if (!imagen) {
    return (
      <div
        className={`flex ${proporcion} items-center justify-center bg-gradient-to-br from-superficie to-linea`}
      >
        <span className="px-4 text-center font-display text-sm text-tenue">{alt}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imagen}
      alt={alt}
      loading="lazy"
      className={`${proporcion} w-full object-cover`}
    />
  );
}
