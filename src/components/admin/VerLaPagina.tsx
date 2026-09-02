import Link from 'next/link';

/**
 * "Ver cómo queda" — el enlace a la página pública que edita esta pestaña.
 *
 * Falta uno en cada pestaña del panel, y su ausencia es medio problema: la
 * única forma de comprobar que lo que acabas de guardar salió bien era
 * acordarse de la dirección, abrirla a mano y volver. Cuando comprobar cuesta
 * eso, no se comprueba; y cuando no se comprueba, la primera vez que te enteras
 * de que algo no salió es porque un cliente lo dice.
 *
 * Abre en otra pestaña a propósito: el trabajo a medias se queda donde estaba.
 */
export function VerLaPagina({ href, que }: { href: string; que: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-linea px-3 text-sm font-medium text-tenue transition-colors hover:border-cian hover:text-cian"
    >
      Ver {que} en la página
      <span aria-hidden="true">↗</span>
      <span className="sr-only">(se abre en otra pestaña)</span>
    </Link>
  );
}
