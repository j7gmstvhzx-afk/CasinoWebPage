import Link from 'next/link';
import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { seguro } from '@/lib/queries';
import { money, dateTime, relativeUpdate } from '@/lib/format';
import { formatVoucherCode } from '@/lib/voucher';

export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Panel',
  robots: { index: false, follow: false },
};

type Resumen = {
  clientes: number;
  clientes_hoy: number;
  tiradas_hoy: number;
  pendientes: number;
  maquinas: number;
  ultima_lectura: string | null;
};

type Cupon = {
  code: string;
  full_name: string;
  amount_cents: number;
  status: string;
  issued_at: string;
  expires_at: string;
};

export default async function PaginaResumen() {
  const [resumen, cupones] = await Promise.all([
    seguro(
      async () => {
        const [r] = await sql<Resumen[]>`
          select
            (select count(*) from app.players)                        as clientes,
            (select count(*) from app.players
              where created_at >= date_trunc('day', now()))           as clientes_hoy,
            (select count(*) from app.spins
              where gaming_date = app.gaming_date(now()))             as tiradas_hoy,
            (select count(*) from app.vouchers
              where status = 'issued' and expires_at > now())         as pendientes,
            (select count(*) from app.machines where active)          as maquinas,
            (select max(reading_at) from app.jackpot_readings
              where amount_cents is not null)                         as ultima_lectura
        `;
        return r;
      },
      null as Resumen | null,
    ),
    seguro(
      () => sql<Cupon[]>`
        select v.code, p.full_name, v.amount_cents, v.status, v.issued_at, v.expires_at
          from app.vouchers v
          join app.players p on p.id = v.player_id
         order by v.issued_at desc
         limit 12
      `,
      [] as Cupon[],
    ),
  ]);

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Resumen</h1>

      <Pendientes />

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta n={resumen?.clientes ?? 0} t="Clientes registrados" sub={`+${resumen?.clientes_hoy ?? 0} hoy`} />
        <Tarjeta n={resumen?.tiradas_hoy ?? 0} t="Tiradas hoy" />
        <Tarjeta n={resumen?.pendientes ?? 0} t="Cupones por canjear" acento />
        <Tarjeta
          n={resumen?.maquinas ?? 0}
          t="Máquinas activas"
          sub={resumen?.ultima_lectura ? `Actualizado ${relativeUpdate(resumen.ultima_lectura)}` : 'Sin datos'}
        />
      </ul>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/admin/canjear"
          className="rounded-2xl bg-gradient-to-b from-dorado-3 to-dorado-2 px-6 py-3.5 font-display font-bold text-tinta"
        >
          Canjear un cupón
        </Link>
        <Link
          href="/admin/jackpots"
          className="rounded-2xl border border-linea px-6 py-3.5 font-medium transition-colors hover:border-cian hover:text-cian"
        >
          Actualizar jackpots
        </Link>
      </div>

      <h2 className="mt-12 font-display text-2xl font-bold">Cupones recientes</h2>
      {cupones.length === 0 ? (
        <p className="tarjeta mt-5 px-6 py-10 text-center text-tenue">
          Todavía no se ha emitido ningún cupón.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wider text-tenue">
                <th className="pb-3 pr-4 font-semibold">Código</th>
                <th className="pb-3 pr-4 font-semibold">Ganador</th>
                <th className="pb-3 pr-4 font-semibold">Monto</th>
                <th className="pb-3 pr-4 font-semibold">Estado</th>
                <th className="pb-3 font-semibold">Emitido</th>
              </tr>
            </thead>
            <tbody>
              {cupones.map((c) => (
                <tr key={c.code} className="border-b border-linea/50">
                  <td className="py-3 pr-4 font-mono tabular">{formatVoucherCode(c.code)}</td>
                  <td className="py-3 pr-4">{c.full_name}</td>
                  <td className="py-3 pr-4 tabular">{money(c.amount_cents)}</td>
                  <td className="py-3 pr-4">
                    <Estado estado={c.status} vence={c.expires_at} />
                  </td>
                  <td className="py-3 text-tenue">{dateTime(c.issued_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Tarjeta({
  n,
  t,
  sub,
  acento,
}: {
  n: number;
  t: string;
  sub?: string;
  acento?: boolean;
}) {
  return (
    <li className={`tarjeta p-5 ${acento && n > 0 ? 'border-dorado/40' : ''}`}>
      <p className={`font-display text-4xl font-bold tabular ${acento && n > 0 ? 'text-dorado' : 'text-cian'}`}>
        {n}
      </p>
      <p className="mt-1.5 text-sm">{t}</p>
      {sub && <p className="mt-0.5 text-xs text-tenue">{sub}</p>}
    </li>
  );
}

function Estado({ estado, vence }: { estado: string; vence: string }) {
  const vencido = estado === 'issued' && new Date(vence) < new Date();
  const real = vencido ? 'expired' : estado;

  const mapa: Record<string, [string, string]> = {
    issued: ['Pendiente', 'text-dorado border-dorado/40'],
    redeemed: ['Canjeado', 'text-gana border-gana/40'],
    expired: ['Vencido', 'text-tenue border-linea'],
    void: ['Anulado', 'text-pierde border-pierde/40'],
  };
  const [texto, clase] = mapa[real] ?? ['—', 'text-tenue border-linea'];

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${clase}`}>{texto}</span>;
}

/**
 * Lo que el casino tiene pendiente, en el sitio donde está quien puede
 * arreglarlo.
 *
 * ESTO ANTES SE LE ENSEÑABA AL CLIENTE.
 * -------------------------------------
 * El aviso de "Términos — borrador pendiente de revisión legal" salía en la
 * página pública de Términos, con instrucciones de configuración incluidas, a
 * la vista de cualquier visitante. Se comprobó contra el sitio en vivo: ahí
 * estaba. Anunciarle al público que las bases de la promoción no están
 * revisadas es justo lo que no conviene el día que alguien discuta un premio.
 *
 * El recordatorio hace falta —si desaparece del todo, se olvida— pero le hace
 * falta al dueño, no al cliente. Así que vive aquí.
 */
function Pendientes() {
  const avisos: { titulo: string; texto: string }[] = [];

  if (process.env.TERMINOS_APROBADOS !== 'si') {
    avisos.push({
      titulo: 'Los términos no han pasado revisión legal',
      texto:
        'El texto de /terminos describe con exactitud lo que hace el sistema, ' +
        'pero no lo ha aprobado un abogado. El cliente no ve ningún aviso: esto ' +
        'es un recordatorio interno. Cuando esté revisado, pon TERMINOS_APROBADOS=si ' +
        'en Vercel y este recuadro desaparece.',
    });
  }

  if (avisos.length === 0) return null;

  return (
    <ul className="mt-6 grid gap-3">
      {avisos.map((a) => (
        <li
          key={a.titulo}
          className="flex items-start gap-3 rounded-2xl border border-dorado/40 bg-dorado/10 px-4 py-3.5 text-sm"
        >
          <span aria-hidden="true" className="mt-px shrink-0">⚠️</span>
          <span>
            <strong className="font-semibold">{a.titulo}</strong>
            <span className="mt-0.5 block text-tenue">{a.texto}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
