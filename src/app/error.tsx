'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { SITE } from '@/lib/site';

/**
 * La pantalla de "no pudimos cargar esto", para el visitante.
 *
 * CUÁNDO SE VE, QUE ES CASI NUNCA
 * --------------------------------
 * Las páginas del sitio se guardan en caché. Cuando una consulta falla al
 * rehacerlas, Next descarta el intento y sigue sirviendo la última versión
 * buena: el visitante no ve nada raro, ve el contenido de hace un rato. Ver
 * `exigir` en lib/queries.ts.
 *
 * Esta pantalla es para el único hueco que deja eso: que no haya ninguna
 * versión buena todavía —el primer visitante justo después de un despliegue— y
 * además la base no conteste. Es raro, pero cuando pasa vale más decirlo que
 * enseñar un casino sin premios y sin promociones.
 *
 * LO QUE NO SE HACE AQUÍ
 * ----------------------
 * No se enseña el error técnico. A quien está mirando si el casino está abierto
 * no le sirve de nada, y los detalles de una base de datos no se publican.
 * Lo que sí se le da es lo que necesita ahora mismo: el teléfono y la dirección,
 * que no dependen de ninguna consulta.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Al registro del servidor, para que quede constancia de que a alguien le
    // pasó. `digest` es lo que permite cruzarlo con el error real de Vercel.
    console.error('[página] no se pudo pintar', error.digest ?? '', error.message);
  }, [error]);

  return (
    <section className="contenedor flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p aria-hidden="true" className="text-5xl">
        🎰
      </p>

      <h1 className="mt-6 font-display text-3xl font-bold">
        No pudimos cargar esta página
      </h1>

      <p className="mt-3 max-w-md text-tenue">
        Es cosa nuestra, no tuya, y suele durar poco. Vuelve a intentarlo en un
        momento.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center rounded-xl bg-cian px-5 text-sm font-semibold text-white"
        >
          Volver a intentar
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-xl border border-linea px-5 text-sm font-semibold"
        >
          Ir al inicio
        </Link>
      </div>

      <p className="mt-8 text-sm text-tenue">
        Si tienes prisa, llámanos:{' '}
        <a href={`tel:${SITE.phone}`} className="font-semibold text-cian">
          {SITE.phoneDisplay}
        </a>
      </p>
    </section>
  );
}
