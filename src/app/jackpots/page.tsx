import type { Metadata } from 'next';
import { PageHero } from '@/components/site/PageHero';
import { JackpotBoard } from '@/components/jackpots/JackpotBoard';
import {
  getJackpots,
  getJackpotsAlDia,
  getUltimaActualizacion,
  seguro,
} from '@/lib/queries';
import { relativeUpdate, longDate } from '@/lib/format';

// Esta página se sirve de caché y se rehace cada minuto en segundo plano.
//
// Antes era force-dynamic: consultaba la base en CADA visita, así que una base
// lenta se llevaba por delante la pestaña entera (ver `seguro` en
// lib/queries.ts). Nada de lo que se muestra aquí cambia de un visitante a
// otro, y lo edita el personal cada varias horas: no hay razón para pagar una
// consulta por visita. Al publicar desde el panel se invalida al instante con
// revalidatePath, así que el minuto no retrasa a nadie.
export const revalidate = 60;

// Techo de la función. Por defecto Vercel deja llegar a 300 s, que fue el
// tiempo exacto que las pestañas se quedaron colgadas en producción.
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Jackpots',
  description:
    'Nuestro listado de premios actualizados a diario. Mira cuáles están más ' +
    'altos y en qué banco encontrarlos.',
};

export default async function PaginaJackpots() {
  const [jackpots, ultima, alDia] = await Promise.all([
    seguro(getJackpots, []),
    seguro(getUltimaActualizacion, null),
    seguro(getJackpotsAlDia, false),
  ]);

  return (
    <>
      <PageHero
        titulo="Jackpots"
        descripcion={
          <>
            <p>Nuestro listado de premios actualizados diariamente.</p>
            <p className="mt-2">¡Ven y prueba tu suerte!</p>
          </>
        }
      >
        {ultima && (
          <AvisoActualizacion ultima={ultima} alDia={alDia} />
        )}
      </PageHero>

      <section className="contenedor py-10 sm:py-14">
        <JackpotBoard jackpots={jackpots} />

        <p className="mt-8 text-center text-xs text-tenue">
          Los montos se actualizan a lo largo del día y pueden variar al momento
          de tu visita.
        </p>
      </section>
    </>
  );
}

/**
 * Cuándo se actualizaron estos montos.
 *
 * Si son de hoy, basta con el punto verde y la hora: es la señal de "esto está
 * vivo". Si NO son de hoy hay que decirlo con todas las letras y con la fecha,
 * porque son cantidades de dinero por las que alguien maneja hasta Manatí.
 * Enseñar montos de hace una semana con el mismo puntito verde de siempre es
 * dejar que el visitante crea algo que no es.
 *
 * El corte a las 20 horas y no a las 24: la hoja se sube por la mañana, así que
 * a las 24 h una subida de ayer temprano todavía contaría como "de hoy" bien
 * entrada la tarde siguiente.
 */
function AvisoActualizacion({
  ultima,
  alDia,
}: {
  ultima: string | Date;
  alDia: boolean;
}) {
  if (alDia) {
    return (
      <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-linea bg-superficie px-4 py-2 text-sm">
        <span className="h-2 w-2 shrink-0 rounded-full bg-gana anim-brillo" />
        <span className="text-tenue">Última actualización:</span>
        <span className="font-medium text-tinta">{relativeUpdate(ultima)}</span>
      </p>
    );
  }

  return (
    <p className="mt-6 flex max-w-xl items-start gap-2.5 rounded-2xl border border-dorado/40 bg-dorado/10 px-4 py-3 text-sm text-tinta">
      <span aria-hidden="true" className="mt-px shrink-0">
        ⏳
      </span>
      <span>
        <strong className="font-semibold">
          Estos montos son del {longDate(ultima)}.
        </strong>{' '}
        Todavía no hemos subido los de hoy; los de verdad pueden estar más
        altos. Pregunta en el casino por el monto del momento.
      </span>
    </p>
  );
}
