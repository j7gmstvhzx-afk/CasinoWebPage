import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { seguro } from '@/lib/queries';
import { almacenamientoListo } from '@/lib/storage';
import { GestorEventos, type EventoAdmin } from './GestorEventos';

export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Promociones',
  robots: { index: false, follow: false },
};

export default async function PaginaAdminEventos() {
  const eventos = await seguro(
    () => sql<EventoAdmin[]>`
      select id, title, body, image_path, starts_on, ends_on, published,
               show_in_popup, sort_order
        from app.events
       order by show_in_popup desc, published desc, sort_order, created_at desc
    `,
    [] as EventoAdmin[],
  );

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Promociones y eventos</h1>
      <p className="mt-2 text-tenue">
        Sube el arte, ponle fecha y aparece en la página. Aquí mismo la ocultas
        cuando termine.
      </p>

      {!almacenamientoListo() && (
        <div className="mt-6 rounded-2xl border border-dorado/40 bg-dorado/10 p-5 text-sm text-tinta">
          <p className="font-semibold">Falta configurar el almacenamiento de imágenes</p>
          <p className="mt-1.5 text-tenue">
            Se pueden crear promociones con texto, pero todavía no subir artes.
            Hace falta definir <code>SUPABASE_URL</code> y{' '}
            <code>SUPABASE_SERVICE_ROLE_KEY</code>, y crear en Supabase un bucket
            público llamado <code>medios</code> (Storage → New bucket).
          </p>
        </div>
      )}

      <GestorEventos eventos={eventos} />
    </>
  );
}
