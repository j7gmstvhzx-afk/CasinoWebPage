import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { seguro } from '@/lib/queries';
import { GestorMenu, type PlatoAdmin, type SeccionMenu } from './GestorMenu';

export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Menú',
  robots: { index: false, follow: false },
};

export default async function PaginaAdminMenu() {
  const [platos, secciones] = await Promise.all([
    seguro(
      () => sql<PlatoAdmin[]>`
        select id, section_id, name, description, price_cents, available, sort_order
          from app.menu_items
         order by section_id, sort_order, name
      `,
      [] as PlatoAdmin[],
    ),
    seguro(
      () => sql<SeccionMenu[]>`
        select id, name from app.menu_sections order by sort_order, name
      `,
      [] as SeccionMenu[],
    ),
  ]);

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Menú del restaurante</h1>
      <p className="mt-2 text-tenue">
        Cambiar un precio es escribir un número. Lo que marques como agotado
        desaparece de la página al instante.
      </p>

      <GestorMenu platos={platos} secciones={secciones} />
    </>
  );
}
