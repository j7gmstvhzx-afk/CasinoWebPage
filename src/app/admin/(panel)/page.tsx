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
  /** Ojo: un `count(*)` llega como CADENA. Hay que pasarlo por Number(). */
  pagados_del_mes: string | number;
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
              where amount_cents is not null)                         as ultima_lectura,
            -- ¿Hay cifra de premios pagados del mes EN CURSO? Se compara contra
            -- el mes de Puerto Rico, no el del servidor: el día 1 a la 1 de la
            -- mañana en UTC todavía es día 31 en Manatí, y el aviso saldría un
            -- día antes de tiempo.
            (select count(*) from app.monthly_payouts
              where mes = date_trunc('month',
                          (now() at time zone 'America/Puerto_Rico'))::date) as pagados_del_mes
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

      {/* `Number(...)`: un `count(*)` de Postgres es un bigint, y el driver lo
          devuelve como CADENA. Sin la conversión, `"0" === 0` es false y el
          aviso no sale nunca — que es exactamente lo que pasó al probarlo. El
          tipo `Resumen` dice `number` y miente; el resto de los contadores se
          libran porque solo se pintan o se comparan con `>`, que sí convierte
          sola. */}
      <Pendientes faltaPagados={Number(resumen?.pagados_del_mes ?? 1) === 0} />

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
function Pendientes({ faltaPagados }: { faltaPagados: boolean }) {
  const avisos: { titulo: string; texto: string }[] = [];

  // ESTE AVISO EXISTE POR UN FALLO DE DISEÑO MÍO.
  //
  // La cifra de premios pagados del mes la escribe el personal. Si no está, la
  // portada NO PINTA el bloque —mejor eso que un "$0.00"— y el tablero de
  // premios cae a enseñar el total EN JUEGO, que es la suma de los progresivos
  // disponibles. Las dos cosas son correctas por separado, pero juntas dejan al
  // dueño mirando un total que no es el que esperaba SIN NINGUNA PISTA de qué
  // falta ni dónde ponerlo. Eso pasó de verdad.
  //
  // El aviso va aquí, en lo primero que se ve al entrar al panel, y no en la
  // página pública: el cliente no tiene nada que hacer con esta información.
  if (faltaPagados) {
    avisos.push({
      titulo: 'Falta la cifra de premios pagados de este mes',
      texto:
        'Hasta que la pongas, la portada no enseña el bloque de "pagado este mes" ' +
        'y la pestaña de Jackpots abre con el total EN JUEGO —la suma de los ' +
        'progresivos disponibles—, que no es lo mismo. Ponla en Jackpots → ' +
        'Premios pagados del mes y aparece en las dos al instante.',
    });
  }

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
