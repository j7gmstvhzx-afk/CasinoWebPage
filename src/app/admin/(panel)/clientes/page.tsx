import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { intentar, LIMITE_PANEL_MS, algunoFallo } from '@/lib/queries';
import { formatPhone } from '@/lib/phone';
import { dateTime } from '@/lib/format';
import { FalloDeCarga } from '../FalloDeCarga';

export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Clientes',
  robots: { index: false, follow: false },
};

type Cliente = {
  id: string;
  full_name: string;
  phone_e164: string;
  municipality: string;
  created_at: string;
  tiradas: number;
};

type PorPueblo = { municipality: string; n: number };

export default async function PaginaClientes() {
  const [rClientes, rPueblo, rTotal] = await Promise.all([
    intentar(
      () => sql<Cliente[]>`
        select p.id, p.full_name, p.phone_e164, m.name as municipality, p.created_at,
               (select count(*) from app.spins s where s.player_id = p.id) as tiradas
          from app.players p
          join app.municipalities m on m.id = p.municipality_id
         where p.blocked_at is null
         order by p.created_at desc
         limit 100
      `,
      [] as Cliente[],
      LIMITE_PANEL_MS,
    ),
    intentar(
      () => sql<PorPueblo[]>`
        select m.name as municipality, count(*)::int as n
          from app.players p
          join app.municipalities m on m.id = p.municipality_id
         where p.blocked_at is null
         group by m.name
         order by n desc
         limit 8
      `,
      [] as PorPueblo[],
      LIMITE_PANEL_MS,
    ),
    intentar(async () => {
      const [r] = await sql<{ n: number }[]>`
        select count(*)::int as n from app.players where blocked_at is null
      `;
      return r.n;
    }, 0, LIMITE_PANEL_MS),
  ]);
  const clientes = rClientes.datos;
  const porPueblo = rPueblo.datos;
  const total = rTotal.datos;
  const fallo = algunoFallo(rClientes, rPueblo, rTotal);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Clientes</h1>
          <p className="mt-2 text-tenue">
            {total} registrado{total === 1 ? '' : 's'} en total.
          </p>

      {fallo && <FalloDeCarga que="los clientes" />}
        </div>

        {/* Enlace directo, no fetch + descarga por JavaScript: así funciona
            igual en la tablet del mostrador y en cualquier navegador viejo. */}
        <a
          href="/api/admin/clientes/csv"
          className="rounded-2xl bg-cian px-6 py-3 font-semibold text-white"
        >
          Exportar a Excel (CSV)
        </a>
      </div>

      {porPueblo.length > 0 && (
        <>
          <h2 className="mt-10 font-display text-xl font-bold">De dónde vienen</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {porPueblo.map((p) => (
              <li
                key={p.municipality}
                className="rounded-full border border-linea bg-superficie px-4 py-2 text-sm"
              >
                {p.municipality}{' '}
                <span className="ml-1 font-semibold text-cian tabular">{p.n}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-10 font-display text-xl font-bold">
        Últimos registros{clientes.length === 100 ? ' (100 más recientes)' : ''}
      </h2>

      {clientes.length === 0 ? (
        <p className="tarjeta mt-5 px-6 py-10 text-center text-tenue">
          {fallo ? 'No se pudo leer la lista de clientes.' : 'Todavía no se ha registrado nadie.'}
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wider text-tenue">
                <th className="pb-3 pr-4 font-semibold">Nombre</th>
                <th className="pb-3 pr-4 font-semibold">Celular</th>
                <th className="pb-3 pr-4 font-semibold">Pueblo</th>
                <th className="pb-3 pr-4 font-semibold">Tiradas</th>
                <th className="pb-3 font-semibold">Registrado</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-b border-linea/50">
                  <td className="py-2.5 pr-4">{c.full_name}</td>
                  <td className="py-2.5 pr-4 tabular">{formatPhone(c.phone_e164)}</td>
                  <td className="py-2.5 pr-4 text-tenue">{c.municipality}</td>
                  <td className="py-2.5 pr-4 tabular">{c.tiradas}</td>
                  <td className="py-2.5 text-tenue">{dateTime(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-8 rounded-2xl border border-linea bg-superficie p-4 text-sm text-tenue">
        Estos datos se recogieron con consentimiento para fines de mercadeo. Si un
        cliente pide que lo saquen de la lista, hay que atenderlo — está en los
        términos y condiciones que aceptó.
      </p>
    </>
  );
}
