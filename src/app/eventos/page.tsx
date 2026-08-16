import type { Metadata } from 'next';
import { PageHero, SeccionVacia } from '@/components/site/PageHero';
import { Marco } from '@/components/site/Marco';
import { getEventos, seguro } from '@/lib/queries';
import { longDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Eventos y Promociones',
  description:
    'Sorteos, promociones y eventos de Casino Atlántico Manatí. Mantente al ' +
    'tanto de lo que tenemos para ti.',
};

export default async function PaginaEventos() {
  const eventos = await seguro(() => getEventos(60), []);

  const hoy = new Date().toISOString().slice(0, 10);
  const activos = eventos.filter((e) => !e.starts_on || e.starts_on <= hoy);
  const proximos = eventos.filter((e) => e.starts_on && e.starts_on > hoy);

  return (
    <>
      <PageHero
        titulo="Eventos y Promociones"
        descripcion="Mantente al tanto de lo que tenemos para ti en Casino Atlántico Manatí."
      />

      <section className="contenedor py-10 sm:py-14">
        {eventos.length === 0 ? (
          <SeccionVacia mensaje="No hay eventos publicados en este momento. ¡Vuelve pronto!" />
        ) : (
          <div className="space-y-14">
            {activos.length > 0 && <Grupo titulo="Ahora mismo" eventos={activos} />}
            {proximos.length > 0 && <Grupo titulo="Próximamente" eventos={proximos} />}
          </div>
        )}
      </section>
    </>
  );
}

function Grupo({
  titulo,
  eventos,
}: {
  titulo: string;
  eventos: Awaited<ReturnType<typeof getEventos>>;
}) {
  return (
    <div>
      <h2 className="font-display text-2xl font-bold sm:text-3xl">{titulo}</h2>
      <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {eventos.map((e) => (
          <li key={e.id} className="tarjeta overflow-hidden">
            {/* Los flyers que ya usan en redes son verticales; se respeta esa
                proporción para no recortarles el texto al centro. */}
            <Marco imagen={e.image_path} alt={e.title} proporcion="aspect-[4/5]" />
            <div className="p-5">
              <h3 className="font-display text-lg font-semibold">{e.title}</h3>
              <Fechas inicio={e.starts_on} fin={e.ends_on} />
              {e.body && (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-tenue">
                  {e.body}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Fechas({ inicio, fin }: { inicio: string | null; fin: string | null }) {
  if (!inicio && !fin) return null;
  return (
    <p className="mt-1.5 text-sm text-cian">
      {inicio && fin && inicio !== fin
        ? `${longDate(inicio)} — ${longDate(fin)}`
        : longDate((inicio ?? fin)!)}
    </p>
  );
}
