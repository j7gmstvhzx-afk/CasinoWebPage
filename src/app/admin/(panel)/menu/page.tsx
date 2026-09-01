import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { intentar, LIMITE_PANEL_MS, algunoFallo } from '@/lib/queries';
import { GestorMenu, type PlatoAdmin, type SeccionMenu } from './GestorMenu';
import { FalloDeCarga } from '../FalloDeCarga';

export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Menú',
  robots: { index: false, follow: false },
};

export default async function PaginaAdminMenu() {
  const [rPlatos, rSecciones] = await Promise.all([
    intentar(
      () => sql<PlatoAdmin[]>`
        select id, section_id, name, description, price_cents, image_path, available, sort_order
          from app.menu_items
         order by section_id, sort_order, name
      `,
      [] as PlatoAdmin[],
      LIMITE_PANEL_MS,
    ),
    intentar(
      () => sql<SeccionMenu[]>`
        select id, name, cortesia, nota from app.menu_sections order by sort_order, name
      `,
      [] as SeccionMenu[],
      LIMITE_PANEL_MS,
    ),
  ]);
  const platos = rPlatos.datos;
  const secciones = rSecciones.datos;
  const fallo = algunoFallo(rPlatos, rSecciones);

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Comida y bebida</h1>
      <p className="mt-2 text-tenue">
        Lo que pongas en las secciones <strong className="text-tinta">de cortesía</strong>{' '}
        sale en la página en grande y sin precio: es lo que la casa invita
        mientras se juega. Lo que marques como agotado desaparece al instante.
      </p>

      {fallo && <FalloDeCarga que="la carta" />}

      <GestorMenu platos={platos} secciones={secciones} />
    </>
  );
}
