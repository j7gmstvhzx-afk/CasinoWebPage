import type { Metadata } from 'next';
import { PanelJackpots } from './PanelJackpots';
import {
  getJackpots,
  getMaquinasParaEntrada,
  getUltimaActualizacion,
  seguro,
} from '@/lib/queries';
import { money, relativeUpdate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Jackpots',
  robots: { index: false, follow: false },
};

export default async function PaginaAdminJackpots() {
  const [jackpots, maquinas, ultima] = await Promise.all([
    seguro(getJackpots, []),
    seguro(getMaquinasParaEntrada, []),
    seguro(getUltimaActualizacion, null),
  ]);

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Jackpots</h1>
      <p className="mt-2 text-tenue">
        {/* Sin punto al final: en español "p. m." ya lo trae, y quedaba "p. m..". */}
        {ultima
          ? `Última actualización: ${relativeUpdate(ultima)}`
          : 'Todavía no se ha publicado ningún premio.'}
      </p>

      <PanelJackpots maquinas={maquinas} />

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
