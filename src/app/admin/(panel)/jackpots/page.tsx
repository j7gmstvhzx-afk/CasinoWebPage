import type { Metadata } from 'next';
import { PanelJackpots } from './PanelJackpots';
import { PremiosPagados } from './PremiosPagados';
import {
  getHistorialPagos,
  getJackpots,
  getMaquinasParaEntrada,
  getUltimaActualizacion,
  intentar, LIMITE_PANEL_MS, algunoFallo,
} from '@/lib/queries';
import { money, relativeUpdate } from '@/lib/format';
import { FalloDeCarga } from '../FalloDeCarga';
import { VerLaPagina } from '@/components/admin/VerLaPagina';

export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Jackpots',
  robots: { index: false, follow: false },
};

export default async function PaginaAdminJackpots() {
  const [r0, r1, r2, r3] = await Promise.all([
    intentar(getJackpots, [], LIMITE_PANEL_MS),
    intentar(getMaquinasParaEntrada, [], LIMITE_PANEL_MS),
    intentar(getUltimaActualizacion, null, LIMITE_PANEL_MS),
    intentar(getHistorialPagos, [], LIMITE_PANEL_MS),
  ]);
  const jackpots = r0.datos;
  const maquinas = r1.datos;
  const ultima = r2.datos;
  const pagos = r3.datos;
  const fallo = algunoFallo(r0, r1, r2, r3);

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Jackpots</h1>
      <p className="mt-2 text-tenue">
        {/* Sin punto al final: en español "p. m." ya lo trae, y quedaba "p. m..". */}
        {ultima
          ? `Última actualización: ${relativeUpdate(ultima)}`
          : fallo
            ? 'No se pudieron leer los premios.'
            : 'Todavía no se ha publicado ningún premio.'}
      </p>

      <div className="mt-4">
        <VerLaPagina href="/jackpots" que="el tablero" />
      </div>

      {fallo && <FalloDeCarga que="los premios" />}

      <PanelJackpots maquinas={maquinas} />

      <PremiosPagados historial={pagos} />

      {jackpots.length > 0 && (
        <>
          <h2 className="mt-12 font-display text-2xl font-bold">
            Publicado ahora mismo ({jackpots.length})
          </h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-linea text-left text-xs uppercase tracking-wider text-tenue">
                  <th className="pb-3 pr-4 font-semibold">Máquina</th>
                  <th className="pb-3 pr-4 font-semibold">Banco</th>
                  <th className="pb-3 pr-4 font-semibold">Premio</th>
                  <th className="pb-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {jackpots.map((j) => (
                  <tr key={j.id} className="border-b border-linea/50">
                    <td className="py-2.5 pr-4">{j.nombre}</td>
                    <td className="py-2.5 pr-4 tabular">{j.banco}</td>
                    <td className="py-2.5 pr-4 font-semibold text-dorado tabular">
                      {money(j.centavos)}
                    </td>
                    <td className="py-2.5 text-tenue">
                      {j.caliente ? '🔥 Caliente' : j.tendencia === 'sube' ? '↑ Subió' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
