import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { seguro } from '@/lib/queries';
import { almacenamientoListo } from '@/lib/storage';
import { GestorMaquinas, type MaquinaAdmin } from './GestorMaquinas';

export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Máquinas nuevas',
  robots: { index: false, follow: false },
};

export default async function PaginaAdminMaquinasNuevas() {
  const maquinas = await seguro(
    () => sql<MaquinaAdmin[]>`
      select id, name, description, image_path, arrived_on, bank_number, published
        from app.new_machines
       order by published desc, arrived_on desc
    `,
    [] as MaquinaAdmin[],
  );

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Máquinas nuevas</h1>
      <p className="mt-2 text-tenue">
        Anuncia lo que acaba de llegar al salón. Con el número de banco, el
        cliente sabe dónde buscarla.
      </p>

      {!almacenamientoListo() && (
        <div className="mt-6 rounded-2xl border border-dorado/40 bg-dorado/10 p-5 text-sm text-tinta">
          <p className="font-semibold">Falta configurar el almacenamiento de imágenes</p>
          <p className="mt-1.5 text-tenue">
            Se pueden añadir máquinas con texto, pero todavía no subir fotos.
            Define <code>SUPABASE_URL</code> y <code>SUPABASE_SERVICE_ROLE_KEY</code>,
            y crea en Supabase un bucket público llamado <code>medios</code>.
          </p>
        </div>
      )}

      <GestorMaquinas maquinas={maquinas} />
    </>
  );
}
