import Link from 'next/link';

/**
 * Página 404 en español.
 *
 * Sin esto, Next enseña su pantalla por defecto en inglés ("This page could not
 * be found") — que es lo que ve cualquiera que teclee mal una dirección o abra
 * el enlace de un cupón vencido. Aquí se queda dentro del encabezado y el pie
 * del sitio, así que siempre hay una salida a mano.
 */
export default function NoEncontrado() {
  return (
    <section className="contenedor flex flex-col items-center justify-center py-24 text-center sm:py-32">
      <p className="font-display text-7xl font-bold texto-dorado tabular sm:text-8xl">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold sm:text-3xl">
        No encontramos esta página
      </h1>
      <p className="mt-3 max-w-md text-tenue">
        Puede que el enlace esté equivocado o que la página haya cambiado de lugar.
        Vuelve al inicio y sigue desde ahí.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-2xl bg-gradient-to-b from-dorado-3 to-dorado-2 px-6 py-3.5 font-display font-bold text-tinta shadow-premio transition-transform hover:scale-[1.02]"
        >
          Volver al inicio
        </Link>
        <Link
          href="/jackpots"
          className="tarjeta px-6 py-3.5 font-medium transition-colors hover:border-dorado/50"
        >
          Ver jackpots de hoy →
        </Link>
      </div>
    </section>
  );
}
