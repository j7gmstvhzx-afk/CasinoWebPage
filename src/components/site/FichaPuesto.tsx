/**
 * Ficha de puesto.
 *
 * El borde discontinuo no es un adorno cualquiera: reproduce las MUESCAS del
 * canto de la ficha de póker del logo. Es la pieza que ata el sitio a la marca,
 * y se repite a varios tamaños — el premio más alto, el podio, la parrilla de
 * jackpots y el resumen de la portada.
 *
 * Vive aquí y no dentro del tablero porque la portada es un componente de
 * servidor: importarla desde `JackpotBoard` arrastraría todo el JavaScript del
 * tablero (búsqueda, filtros, refresco) a una página que no usa nada de eso.
 *
 * `aria-hidden`: el puesto ya está en el orden visual de la lista y, donde hace
 * falta, escrito aparte para lectores de pantalla. Uno que anuncie "2" suelto
 * antes del nombre solo estorba.
 */
export function FichaPuesto({ puesto, clase }: { puesto: number; clase: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold ${clase}`}
    >
      <span className="absolute inset-0 rounded-full border-[3px] border-dashed border-current opacity-40" />
      <span className="relative">{puesto}</span>
    </span>
  );
}

/** Materiales de la ficha por puesto. El salto oro → plata → bronce → casa es
 * lo que hace legible la jerarquía sin leer un solo número. */
export const FICHA = {
  1: 'bg-gradient-to-br from-dorado-3 via-dorado-2 to-dorado text-[#0a2547]',
  2: 'bg-gradient-to-br from-slate-100 via-slate-200 to-slate-400 text-slate-700',
  3: 'bg-gradient-to-br from-orange-100 via-orange-200 to-orange-400 text-orange-900',
  /** De la 4 en adelante: ficha azul "de la casa", sin metal. Existe, pero no
   * compite con el podio. */
  casa: 'bg-superficie text-marca',
} as const;
