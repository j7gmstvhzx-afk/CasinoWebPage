import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { intentar, LIMITE_PANEL_MS } from '@/lib/queries';
import { GestorGanadores, type GanadorAdmin } from './GestorGanadores';
import { FalloDeCarga } from '../FalloDeCarga';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Ganadores',
  robots: { index: false, follow: false },
};

export default async function PaginaGanadores() {
  const r = await intentar(
    () =>
      sql<GanadorAdmin[]>`
        select id, pueblo, monto_cents::text as monto_cents, gano_on::text, publicado
          from app.ganadores
         order by gano_on desc, orden, creado_en desc
         limit 100
      `.then((f) => [...f]),
    [] as GanadorAdmin[],
    LIMITE_PANEL_MS,
  );
  const ganadores = r.datos;

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Ganadores</h1>
      <p className="mt-2 max-w-2xl text-sm text-tenue">
        El pueblo y la cantidad, nada más. Sin nombre ni foto no hay que pedirle
        permiso a nadie, y sigue diciendo lo que importa: que aquí se paga y que
        le tocó a alguien de al lado. La fecha se pone sola.
      </p>

      {!r.ok && <FalloDeCarga que="los ganadores" />}

      <GestorGanadores ganadores={ganadores} />
    </>
  );
}
