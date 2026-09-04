import { Pica } from '@/components/site/Marco';

/**
 * El logo de un juego, metido entero en su cuadro.
 *
 * POR QUÉ NO SE USA `FotoEncajada` AQUÍ
 * -------------------------------------
 * `FotoEncajada` es el encaje del resto del sitio y hace una cosa muy concreta:
 * rellena el hueco que sobra con una copia ampliada y desenfocada de la propia
 * foto. Para la foto de un plato o de un ganador eso queda bien —el hueco toma
 * los colores de la imagen y la tarjeta se ve llena.
 *
 * Un logo de tragamonedas no es una foto. Muchos vienen recortados, con el
 * fondo transparente, y detrás de un logo transparente una mancha borrosa de
 * sus propios colores se ve como suciedad, no como diseño. Y a este tamaño
 * —cuarenta y pico píxeles en una fila de la lista— el desenfoque no se
 * distingue: es coste sin beneficio.
 *
 * Así que aquí el encaje es el mismo en lo que importa —LA IMAGEN ENTRA ENTERA,
 * VENGA COMO VENGA, y nunca se recorta— pero sobre un fondo liso de la marca en
 * vez de sobre una copia borrosa. Ancha, alta o cuadrada, el logo cabe.
 *
 * SIN LOGO NO HAY HUECO
 * ---------------------
 * Mientras el personal no haya subido ninguno —que es el estado de hoy en las
 * dieciocho máquinas— sale la ficha de la marca. Es la misma pieza que usa
 * `Marco`, así que el tablero se ve terminado desde el primer día y no como una
 * lista de recuadros rotos esperando contenido.
 */
export function LogoJuego({
  src,
  nombre,
  className = 'h-12 w-12',
}: {
  src: string | null;
  /** El nombre del juego. Solo para el texto alternativo. */
  nombre: string;
  /** El tamaño del cuadro. Cambia entre el podio y las filas de la lista. */
  className?: string;
}) {
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className={`${className} flex shrink-0 items-center justify-center rounded-xl border border-linea bg-superficie text-marca/45`}
      >
        <Pica className="h-1/2 w-1/2" />
      </span>
    );
  }

  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-linea bg-superficie`}
    >
      {/* `object-contain` y no `cover`: el logo entra entero. Recortarlo le
          quitaría justo lo que lo hace reconocible. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Logo de ${nombre}`}
        loading="lazy"
        className="h-full w-full object-contain"
      />
    </span>
  );
}
