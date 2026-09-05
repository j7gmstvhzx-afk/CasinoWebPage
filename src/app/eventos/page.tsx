import { hoyEnPR } from '@/lib/hora-pr';
import type { Metadata } from 'next';
import { PageHero, SeccionVacia } from '@/components/site/PageHero';
import { Marco } from '@/components/site/Marco';
import { getEventos, paraLaPagina } from '@/lib/queries';
import { agrupar, cuando, esDeHoy } from '@/lib/cartelera';

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

  // La cartelera, no una lista.
  //
  // Antes eran dos montones —"Ahora mismo" y "Próximamente"— y en el segundo
  // cabía por igual lo del sábado y lo del mes que viene, ordenado por el
  // número que el personal le hubiera puesto a mano. Quien entraba a ver si hay
  // algo este fin de semana tenía que leerlo todo y hacer la cuenta.
  //
  // Ahora son tres, y los dos del futuro salen ordenados por fecha: lo más
  // cercano primero, que es lo que se está preguntando el que mira.
  const hoy = hoyEnPR();
  const { ahora, semana, despues } = agrupar(eventos, hoy);

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
            {ahora.length > 0 && <Grupo titulo="Ahora mismo" eventos={ahora} hoy={hoy} />}
            {semana.length > 0 && <Grupo titulo="Esta semana" eventos={semana} hoy={hoy} />}
            {despues.length > 0 && (
              <Grupo titulo="Más adelante" eventos={despues} hoy={hoy} />
            )}
          </div>
        )}
      </section>
    </>
  );
}

function Grupo({
  titulo,
  eventos,
  hoy,
}: {
  titulo: string;
  eventos: Awaited<ReturnType<typeof getEventos>>;
  /** El día en Puerto Rico, calculado una vez arriba y pasado hacia abajo. */
  hoy: string;
}) {
  return (
    <div>
      <h2 className="font-display text-2xl font-bold sm:text-3xl">{titulo}</h2>
      {/* El canto de la ficha, igual que en la portada y en el menú. */}
      <div aria-hidden="true" className="cinta-ficha mt-3 h-[3px] w-16" />
      <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {eventos.map((e) => {
          const hoyMismo = esDeHoy(e, hoy);
          const frase = cuando(e, hoy);
          return (
            <li
              key={e.id}
              /* Lo de hoy se destaca con el borde dorado de la casa. No es
                 adorno: en una cartelera de doce tarjetas, lo que pasa HOY es
                 lo único que se puede aprovechar todavía. */
              className={`tarjeta relative overflow-hidden${
                hoyMismo ? ' border-dorado/60 shadow-[0_0_0_1px_var(--color-dorado)]' : ''
              }`}
            >
              {/* Los flyers que ya usan en redes son verticales; se respeta esa
                  proporción para no recortarles el texto al centro. */}
              <Marco imagen={e.image_path} alt={e.title} proporcion="aspect-[4/5]" />

              {hoyMismo && (
                <span className="absolute left-3 top-3 rounded-full bg-dorado px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-tinta shadow">
                  Hoy
                </span>
              )}

              <div className="p-5">
                <h3 className="font-display text-lg font-semibold">{e.title}</h3>
                {frase && <p className="mt-1.5 text-sm font-medium text-cian">{frase}</p>}
                {e.body && (
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-tenue">
                    {e.body}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
