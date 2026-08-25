import { SITE } from '@/lib/site';

/**
 * Marco de imagen.
 *
 * Cuando todavía no hay foto cargada muestra una PLACA DE MARCA — el tejido de
 * picas del logo con la ficha en el centro — en vez de un hueco roto o un icono
 * de imagen rota. Así el sitio se ve terminado desde el primer día, aunque el
 * personal no haya subido nada, que es exactamente la situación en la que
 * arranca.
 *
 * La placa ya no repite el nombre. Antes decía el nombre de la máquina dentro
 * de un recuadro gris y el mismo nombre volvía a salir como título justo
 * debajo: dos veces lo mismo, y el recuadro gris se leía como "aquí falta
 * algo". La placa con la ficha se lee como una pieza puesta a propósito.
 *
 * Se queda CLARA y no azul oscura a propósito: el bloque oscuro está reservado
 * para el premio más alto y la tragamonedas. Una parrilla de cinco tarjetas sin
 * foto en azul noche le robaría el golpe de vista justo a eso.
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
        className={`relative flex ${proporcion} items-center justify-center overflow-hidden bg-superficie`}
      >
        <div aria-hidden="true" className="patron-picas absolute inset-0 opacity-[0.13]" />
        {/* Decorativo entero: el nombre de la pieza ya va como título debajo,
            así que un lector de pantalla no se pierde nada saltándose esto. */}
        <div aria-hidden="true" className="relative flex flex-col items-center gap-2.5">
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-fondo text-marca shadow-suave">
            {/* Las muescas del canto de la ficha, igual que en el tablero de
                premios: es la misma pieza de la marca repetida. */}
            <span className="absolute inset-0 rounded-full border-[3px] border-dashed border-current opacity-35" />
            <Pica className="relative h-6 w-6" />
          </span>
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tenue">
            {SITE.shortName}
          </span>
        </div>
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

/** La pica del mandala del logo, en trazo. Es la misma silueta que teje el
 * patrón de fondo, para que la placa y su textura sean la misma cosa. */
export function Pica({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 3.2c0 0-6.6 6-6.6 9.6a3.3 3.3 0 0 0 5.8 2.15c-.25 1.4-.9 2.65-2 3.65h5.6c-1.1-1-1.75-2.25-2-3.65A3.3 3.3 0 0 0 18.6 12.8C18.6 9.2 12 3.2 12 3.2z" />
    </svg>
  );
}
