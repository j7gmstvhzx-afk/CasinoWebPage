import type { Metadata } from 'next';
import { PageHero } from '@/components/site/PageHero';
import { JackpotBoard } from '@/components/jackpots/JackpotBoard';
import { getJackpots, getUltimaActualizacion, seguro } from '@/lib/queries';
import { relativeUpdate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Jackpots',
  description:
    'Nuestro listado de premios actualizados a diario. Mira cuáles están más ' +
    'altos y en qué banco encontrarlos.',
};

export default async function PaginaJackpots() {
  const [jackpots, ultima] = await Promise.all([
    seguro(getJackpots, []),
    seguro(getUltimaActualizacion, null),
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
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-linea bg-white/5 px-4 py-2 text-sm">
            <span className="h-2 w-2 shrink-0 rounded-full bg-gana anim-brillo" />
            <span className="text-tenue">Última actualización:</span>
            <span className="font-medium text-crema">{relativeUpdate(ultima)}</span>
          </p>
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
