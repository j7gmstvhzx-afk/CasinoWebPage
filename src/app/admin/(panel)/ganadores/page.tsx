import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { seguro } from '@/lib/queries';
import { GestorGanadores, type GanadorAdmin } from './GestorGanadores';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Ganadores',
  robots: { index: false, follow: false },
};

export default async function PaginaGanadores() {
  const ganadores = await seguro(
    () =>
      sql<GanadorAdmin[]>`
        select id, nombre, pueblo, maquina, monto_cents::text as monto_cents,
               gano_on::text, image_path, consentimiento_nota, publicado, orden
          from app.ganadores
         order by gano_on desc, orden, creado_en desc
         limit 100
      `.then((f) => [...f]),
    [] as GanadorAdmin[],
  );

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Ganadores</h1>
      <p className="mt-2 max-w-2xl text-sm text-tenue">
        La página que más convence de venir: un vecino con su premio. Aquí van
        tanto los del sorteo de $25 como los jackpots del salón.
      </p>

      <GestorGanadores ganadores={ganadores} />
    </>
  );
}
