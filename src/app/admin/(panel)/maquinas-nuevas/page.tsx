import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { intentar, LIMITE_PANEL_MS } from '@/lib/queries';
import { FalloDeCarga } from '../FalloDeCarga';
import { VerLaPagina } from '@/components/admin/VerLaPagina';
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
  // `intentar` y no `seguro`: hace falta SABER si la consulta falló.
  //
  // Esta consulta no lleva filtro —pide todas las filas—, así que ver cero
  // mientras la página pública enseña una máquina es imposible... salvo que la
  // consulta no llegara a correr. Eso es lo que pasaba: se agotaba el tiempo,
  // el respaldo vacío llegaba a la pantalla y se pintaba como "no has añadido
  // ninguna". Ahora se distingue, y se espera más (ver LIMITE_PANEL_MS).
  const r = await intentar(
    () => sql<MaquinaAdmin[]>`
      select id, name, description, image_path, arrived_on, bank_number,
             video_id, published
        from app.new_machines
       order by published desc, arrived_on desc
    `,
    [] as MaquinaAdmin[],
    LIMITE_PANEL_MS,
  );
  const maquinas = r.datos;

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Máquinas nuevas</h1>
      <p className="mt-2 text-tenue">
        Anuncia lo que acaba de llegar al salón. Con el número de banco, el
        cliente sabe dónde buscarla.
      </p>

      <div className="mt-4">
        <VerLaPagina href="/maquinas-nuevas" que="las máquinas" />
      </div>

      {!r.ok && <FalloDeCarga que="las máquinas nuevas" />}

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

      <GestorMaquinas maquinas={maquinas} cargaFallida={!r.ok} />
    </>
  );
}
