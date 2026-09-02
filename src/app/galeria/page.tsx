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
export const revalidate = 60;

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
