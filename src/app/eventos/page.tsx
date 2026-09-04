import { hoyEnPR } from '@/lib/hora-pr';
import type { Metadata } from 'next';
import { PageHero, SeccionVacia } from '@/components/site/PageHero';
import { Marco } from '@/components/site/Marco';
import { getEventos, paraLaPagina } from '@/lib/queries';
import { longDate } from '@/lib/format';

// Esta página se sirve de caché y se rehace cada minuto en segundo plano.
//
// Antes era force-dynamic: consultaba la base en CADA visita, así que una base
// lenta se llevaba por delante la pestaña entera (ver `seguro` en
// lib/queries.ts). Nada de lo que se muestra aquí cambia de un visitante a
// otro, y lo edita el personal cada varias horas: no hay razón para pagar una
// consulta por visita. Al publicar desde el panel se invalida al instante con
// revalidatePath, así que el minuto no retrasa a nadie.
// NO SON 60 EN TODAS, Y ESO ES EL ARREGLO, NO UN DESCUIDO.
//
// Con las ocho páginas públicas a 60 s pasaba esto: el despliegue las hornea a
// todas en el mismo segundo, así que TODAS caducan en el mismo segundo. Y como
// Next precarga cada pestaña del menú que esté a la vista —y están las nueve—,
// el primer visitante que llega después de que caduquen dispara OCHO
// regeneraciones a la vez, cada una en su propia función y cada una abriendo su
// propio manojo de conexiones contra un pooler que solo tiene 15.
//
// Se vio en los registros de producción del 4 de septiembre a la 01:13:25: once
// peticiones en el mismo segundo, seis de ellas regenerando, y /jackpots
// cayéndose con "la consulta pasó de 6000 ms" mientras el diagnóstico decía
// "último acierto hace 5996 ms" — o sea, saturación, no conexión muerta.
//
// Separándolas, en cualquier instante hay como mucho una o dos por rehacer. El
// visitante no nota la diferencia entre 60 y 116 segundos de frescura; sí nota
// una página que no carga.
export const revalidate = 84;

// Techo de la función. Por defecto Vercel deja llegar a 300 s, que fue el
// tiempo exacto que las pestañas se quedaron colgadas en producción.
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Eventos y Promociones',
  description:
    'Sorteos, promociones y eventos de Casino Atlántico Manatí. Mantente al ' +
    'tanto de lo que tenemos para ti.',
};

export default async function PaginaEventos() {
  const r = await paraLaPagina(() => getEventos(60), 'las promociones', []);
  const eventos = r.datos;

  const hoy = hoyEnPR();
  const activos = eventos.filter((e) => !e.starts_on || e.starts_on <= hoy);
  const proximos = eventos.filter((e) => e.starts_on && e.starts_on > hoy);

  return (
    <>
      <PageHero
        titulo="Eventos y Promociones"
        descripcion="Mantente al tanto de lo que tenemos para ti en Casino Atlántico Manatí."
      />

      <section className="contenedor py-10 sm:py-14">
        {!r.ok ? (
          /* No es que no haya nada: es que no se pudo leer. Solo pasa en un
             build que no alcanzó la base; en cuanto alguien visite la página
             se rehace sola con el contenido de verdad. */
          <SeccionVacia mensaje="Estamos actualizando esta página. Vuelve en un momento." />
        ) : eventos.length === 0 ? (
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
      {/* El canto de la ficha, igual que en la portada y en el menú. */}
      <div aria-hidden="true" className="cinta-ficha mt-3 h-[3px] w-16" />
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
