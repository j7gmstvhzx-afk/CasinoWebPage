import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { intentar, LIMITE_PANEL_MS, getPremiosPagados, pagosEnCero } from '@/lib/queries';
import { nombreMesDe } from '@/lib/hora-pr';
import { money } from '@/lib/format';
import { GestorGanadores, type GanadorAdmin } from './GestorGanadores';
import { FalloDeCarga } from '../FalloDeCarga';
import { VerLaPagina } from '@/components/admin/VerLaPagina';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Ganadores',
  robots: { index: false, follow: false },
};

export default async function PaginaGanadores() {
  const [r, rPagado] = await Promise.all([
    intentar(
      () =>
        sql<GanadorAdmin[]>`
          select id, pueblo, monto_cents::text as monto_cents, gano_on::text, publicado
            from app.ganadores
           order by gano_on desc, orden, creado_en desc
           limit 100
        `.then((f) => [...f]),
      [] as GanadorAdmin[],
      LIMITE_PANEL_MS,
    ),
    intentar(getPremiosPagados, pagosEnCero(), LIMITE_PANEL_MS),
  ]);
  const ganadores = r.datos;
  const pagado = rPagado.datos;
  const { mes } = nombreMesDe(pagado.mes);

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Ganadores</h1>
      <p className="mt-2 max-w-2xl text-sm text-tenue">
        El pueblo y la cantidad, nada más. Sin nombre ni foto no hay que pedirle
        permiso a nadie, y sigue diciendo lo que importa: que aquí se paga y que
        le tocó a alguien de al lado. La fecha se pone sola.
      </p>

      <div className="mt-4">
        <VerLaPagina href="/ganadores" que="el muro" />
      </div>

      {/* LA MISMA CIFRA QUE SALE EN LA PORTADA, Y SALE DE LA MISMA FUNCIÓN.
          No es adorno: el total de premios pagados del mes se calcula sumando
          estos ganadores, y hasta ahora el dueño no tenía forma de saberlo. Vio
          "$0.00 pagados en septiembre" en la portada teniendo tres premios
          cargados aquí, y no había ninguna pantalla que conectara las dos
          cosas. Ahora lo dice donde se registran. */}
      <p className="tarjeta mt-6 px-5 py-4 text-sm">
        {pagado.premios === 0 ? (
          <>
            Todavía no hay premios de <strong>{mes}</strong>. La portada dice
            <strong> $0.00 pagados en {mes}</strong> hasta que registres el
            primero aquí abajo.
          </>
        ) : (
          <>
            En <strong>{mes}</strong> llevas{' '}
            <strong className="tabular">{money(pagado.totalCentavos)}</strong> en{' '}
            <strong>{pagado.premios}</strong>{' '}
            {pagado.premios === 1 ? 'premio' : 'premios'}. Es la cifra que sale
            en la portada. Los ocultos también suman: se pagaron igual, y el
            total no lleva nombres.
          </>
        )}
      </p>

      {!r.ok && <FalloDeCarga que="los ganadores" />}

      <GestorGanadores ganadores={ganadores} cargaFallida={!r.ok} />
    </>
  );
}
