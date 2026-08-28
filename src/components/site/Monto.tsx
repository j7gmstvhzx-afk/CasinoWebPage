/**
 * Cómo se enseña una cantidad de dinero en este sitio.
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * Antes todo salía por `money()`: "$12,204.01", los ocho caracteres al mismo
 * tamaño y al mismo peso. Se reportó como "ambiguo y sin personalidad", y las
 * dos cosas son ciertas por el mismo motivo: los centavos pesan lo mismo que
 * los miles. En un jackpot, los centavos no son información — nadie maneja
 * hasta Manatí por un centavo — pero ocupan un tercio del ancho de la cifra y
 * compiten con lo único que importa. Y a un vistazo, "$1,220.41" y "$12,204.01"
 * se parecen demasiado.
 *
 * LA SOLUCIÓN
 * -----------
 * Tres piezas con tres pesos distintos, como el marcador de una máquina de
 * verdad:
 *
 *   $        pequeño. Se sabe que son dólares; no hay que gritarlo.
 *   12,204   ENORME y en negrita. Es la cifra. Es lo único que se lee de lejos.
 *   .01      pequeño y levantado. Está por exactitud, no por peso.
 *
 * LA JERARQUÍA SALE DEL TAMAÑO, NO DE APAGAR EL TEXTO. La primera versión ponía
 * el signo y los centavos a `opacity-60`, y medido daban 2.52:1 sobre el bloque
 * azul y 2.39:1 sobre la banda clara, con 4.5 exigido: no son adorno, son texto
 * que alguien lee. Con la mitad de tamaño y un peso menos ya se subordinan de
 * sobra, y se leen.
 *
 * El resultado se lee de un vistazo y no se puede confundir un orden de
 * magnitud con otro, que era el fallo real detrás de lo de "ambiguo".
 *
 * Los centavos NO se quitan: es dinero de una máquina progresiva y el monto
 * exacto es el que la persona espera ver cuando llegue al salón. Se quitan de
 * la jerarquía, no del dato.
 */

const TAMANOS = {
  /** Filas de la lista. */
  sm: { signo: 'text-sm', entero: 'text-xl', centavos: 'text-[0.7rem]' },
  /** Tarjetas del podio. */
  md: { signo: 'text-lg', entero: 'text-3xl', centavos: 'text-xs' },
  /** Premio más alto. */
  lg: { signo: 'text-2xl sm:text-3xl', entero: 'text-4xl sm:text-6xl', centavos: 'text-sm sm:text-lg' },
  /** El titular de "en juego ahora mismo". */
  xl: { signo: 'text-3xl sm:text-5xl', entero: 'text-5xl sm:text-7xl', centavos: 'text-lg sm:text-2xl' },
} as const;

export function Monto({
  centavos,
  tam = 'md',
  className = '',
}: {
  centavos: number | string | null | undefined;
  tam?: keyof typeof TAMANOS;
  className?: string;
}) {
  const n = Math.round(Number(centavos ?? NaN));
  if (!Number.isFinite(n)) return <span className={className}>—</span>;

  // Se parte desde los CENTAVOS enteros, no dividiendo por 100 y separando
  // decimales: 1220401/100 en coma flotante da 12204.009999999998, y de ahí
  // salen centavos de "00" donde tenía que haber "01".
  const entero = Math.floor(Math.abs(n) / 100).toLocaleString('en-US');
  const cent = String(Math.abs(n) % 100).padStart(2, '0');
  const t = TAMANOS[tam];

  return (
    // `tabular` en el contenedor: sin cifras de ancho fijo, un monto que se
    // actualiza solo hace bailar toda la fila de ancho.
    <span className={`inline-flex items-start tabular leading-none ${className}`}>
      {/* TODO el grupo visual va oculto al lector de pantalla, no solo el signo
          y los centavos. Con la parte entera fuera del `aria-hidden`, la cifra
          se leía DOS veces: primero "12,204" suelto y luego el texto completo
          de abajo. */}
      <span aria-hidden="true" className="inline-flex items-start">
        <span className={`${t.signo} mt-[0.12em] font-semibold`}>$</span>
        <span data-entero className={`${t.entero} font-bold tracking-[-0.02em]`}>{entero}</span>
        <span data-cent className={`${t.centavos} mt-[0.15em] font-semibold`}>.{cent}</span>
      </span>
      {/* La cifra entera y de corrido, para quien la escucha en vez de verla.
          `data-sr` para que la animación de conteo también la mantenga al día:
          si solo se actualizaran los trozos visibles, un lector de pantalla se
          quedaría anunciando el monto con el que se montó la página. */}
      <span data-sr className="sr-only">{`$${entero}.${cent}`}</span>
    </span>
  );
}
