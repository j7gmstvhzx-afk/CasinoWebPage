import type { Metadata } from 'next';
import { PageHero, SeccionVacia } from '@/components/site/PageHero';
import { VideoMaquina } from '@/components/maquinas/VideoMaquina';
import { getMaquinasNuevas, paraLaPagina } from '@/lib/queries';
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
export const revalidate = 76;

// Techo de la función. Por defecto Vercel deja llegar a 300 s, que fue el
// tiempo exacto que las pestañas se quedaron colgadas en producción.
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Máquinas Nuevas',
  description:
    'Las máquinas que acaban de llegar a Casino Atlántico Manatí, con su ' +
    'número de banco para que las encuentres al llegar.',
};

export default async function PaginaMaquinasNuevas() {
  const r = await paraLaPagina(() => getMaquinasNuevas(48), 'las máquinas nuevas', []);
  const maquinas = r.datos;

  return (
    <>
      <PageHero
        titulo="Máquinas Nuevas"
        descripcion="Lo último que llegó al salón. Cada una con su número de banco, para que la encuentres apenas entres."
      />

      <section className="contenedor py-10 sm:py-14">
        {!r.ok ? (
          /* No es que no haya nada: es que no se pudo leer. Solo pasa en un
             build que no alcanzó la base; en cuanto alguien visite la página
             se rehace sola con el contenido de verdad. */
          <SeccionVacia mensaje="Estamos actualizando esta página. Vuelve en un momento." />
        ) : maquinas.length === 0 ? (
          <SeccionVacia mensaje="Pronto anunciaremos las próximas máquinas. ¡Mantente al tanto!" />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {maquinas.map((m) => {
              return (
                <li key={m.id} className="tarjeta overflow-hidden">
                  {/* Con video, la foto es un botón que lo arranca; sin video,
                      es exactamente el marco de siempre. Ver VideoMaquina. */}
                  <VideoMaquina
                    videoId={m.video_id}
                    imagen={m.image_path}
                    nombre={m.name}
                    proporcion="aspect-square"
                  />
                  <div className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      {m.es_nueva && (
                        <span className="rounded-full bg-cian/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-tinta">
                          Nueva
                        </span>
                      )}
                      {m.bank_number !== null && (
                        <span className="rounded-full border border-linea px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-tenue">
                          Banco {m.bank_number}
                        </span>
                      )}
                    </div>

                    <h2 className="mt-3 font-display text-xl font-semibold">{m.name}</h2>
                    {m.description && (
                      <p className="mt-2 text-sm leading-relaxed text-tenue">
                        {m.description}
                      </p>
                    )}
                    <p className="mt-4 text-xs text-tenue">
                      Llegó el {longDate(m.arrived_on)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
