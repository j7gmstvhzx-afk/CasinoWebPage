import type { Metadata } from 'next';
import { PageHero, SeccionVacia } from '@/components/site/PageHero';
import { Galeria } from '@/components/site/Galeria';
import { getGaleria, seguro } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Galería',
  description: 'Conoce Casino Atlántico Manatí por dentro.',
};

export default async function PaginaGaleria() {
  const items = await seguro(() => getGaleria(90), []);

  return (
    <>
      <PageHero
        titulo="Galería"
        descripcion="Un vistazo a nuestro salón, nuestras máquinas y nuestra gente."
      />

      <section className="contenedor py-10 sm:py-14">
        {items.length === 0 ? (
          <SeccionVacia mensaje="Estamos preparando la galería. ¡Vuelve pronto!" />
        ) : (
          <Galeria items={items} />
        )}
      </section>
    </>
  );
}
