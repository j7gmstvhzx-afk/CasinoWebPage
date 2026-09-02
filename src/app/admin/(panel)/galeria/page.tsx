import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { intentar, LIMITE_PANEL_MS } from '@/lib/queries';
import { almacenamientoListo } from '@/lib/storage';
import { GestorGaleria, type FotoAdmin } from './GestorGaleria';
import { FalloDeCarga } from '../FalloDeCarga';
import { VerLaPagina } from '@/components/admin/VerLaPagina';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Galería',
  robots: { index: false, follow: false },
};

export default async function PaginaAdminGaleria() {
  const r = await intentar(
    () => sql<FotoAdmin[]>`
      select id, image_path, caption, sort_order
        from app.gallery_items
       order by sort_order, created_at desc
    `,
    [] as FotoAdmin[],
    LIMITE_PANEL_MS,
  );

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Galería</h1>
      <p className="mt-2 max-w-2xl text-tenue">
        Las fotos del salón. Enséñalo por dentro: la máquina que acaba de llegar,
        el salón lleno un viernes, la barra. Es lo que decide a quien nunca ha
        entrado.
      </p>

      <div className="mt-4">
        <VerLaPagina href="/galeria" que="la galería" />
      </div>

      {!r.ok && <FalloDeCarga que="la galería" />}

      {!almacenamientoListo() && (
        <div className="mt-6 rounded-2xl border border-dorado/40 bg-dorado/10 p-5 text-sm text-tinta">
          <p className="font-semibold">Falta configurar el almacenamiento de imágenes</p>
          <p className="mt-1.5 text-tenue">
            La galería es solo fotos, así que sin esto no se puede añadir
            ninguna. Hace falta definir <code>SUPABASE_URL</code> y{' '}
            <code>SUPABASE_SERVICE_ROLE_KEY</code>, y crear en Supabase un bucket
            público llamado <code>medios</code>.
          </p>
        </div>
      )}

      <GestorGaleria fotos={r.datos} cargaFallida={!r.ok} />
    </>
  );
}
