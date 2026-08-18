import Image from 'next/image';
import logo from '../../../public/marca/logo.png';

/**
 * Marca del casino: el archivo original que entregó el dueño.
 *
 * Se importa el PNG en vez de escribir la ruta a mano para que Next conozca el
 * ancho y el alto en tiempo de compilación. Así reserva el espacio antes de que
 * la imagen cargue y el encabezado no da el salto que descoloca la página al
 * entrar.
 *
 * El archivo trae fondo transparente y el texto en negro. Por eso el sitio es
 * claro: sobre azul oscuro habría que ponerle un recuadro blanco detrás y se
 * vería pegado.
 */

/** Proporción real del archivo (1367 × 617). El alto manda; el ancho sale de aquí. */
const RATIO = 1367 / 617;

export function Logo({ compact = false }: { compact?: boolean }) {
  const alto = compact ? 40 : 56;

  return (
    <Image
      src={logo}
      alt="Casino Atlántico Manatí"
      height={alto}
      width={Math.round(alto * RATIO)}
      priority={!compact}
      sizes="(max-width: 640px) 160px, 220px"
      className={compact ? 'h-10 w-auto' : 'h-11 w-auto sm:h-14'}
    />
  );
}
