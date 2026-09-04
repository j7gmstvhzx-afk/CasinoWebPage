import type { Metadata } from 'next';
import { PageHero, SeccionVacia } from '@/components/site/PageHero';
import { Galeria } from '@/components/site/Galeria';
import { getGaleria, paraLaPagina } from '@/lib/queries';

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
export const revalidate = 108;

// Techo de la función. Por defecto Vercel deja llegar a 300 s, que fue el
// tiempo exacto que las pestañas se quedaron colgadas en producción.
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Galería',
  description: 'Conoce Casino Atlántico Manatí por dentro.',
};

export default async function PaginaGaleria() {
  const r = await paraLaPagina(() => getGaleria(90), 'la galería', []);
  const items = r.datos;

  return (
    <>
      <PageHero
        titulo="Galería"
        descripcion="Un vistazo a nuestro salón, nuestras máquinas y nuestra gente."
      />

      <section className="contenedor py-10 sm:py-14">
        {!r.ok ? (
          /* No es que no haya nada: es que no se pudo leer. Solo pasa en un
             build que no alcanzó la base; en cuanto alguien visite la página
             se rehace sola con el contenido de verdad. */
          <SeccionVacia mensaje="Estamos actualizando esta página. Vuelve en un momento." />
        ) : items.length === 0 ? (
          <SeccionVacia mensaje="Estamos preparando la galería. ¡Vuelve pronto!" />
        ) : (
          <Galeria items={items} />
        )}
      </section>
    </>
  );
}
