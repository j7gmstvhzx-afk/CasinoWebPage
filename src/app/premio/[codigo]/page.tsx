import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { sql } from '@/lib/db';
import { normalizeVoucherCode, formatVoucherCode } from '@/lib/voucher';
import { money, dateTime, longDate } from '@/lib/format';
import { SITE, PROMO } from '@/lib/site';
import { ChipMark } from '@/components/site/Logo';

export const dynamic = 'force-dynamic';

/**
 * Cupón digital — SOLO LECTURA.
 *
 * Esta página no canjea nada, y no es un detalle menor: si un GET mutara
 * estado, los rastreadores de vista previa de WhatsApp, iMessage, Facebook y
 * Slack canjearían el cupón en silencio en cuanto el ganador compartiera el
 * enlace con su familia. El prefetch del navegador haría lo mismo.
 *
 * El canje es un POST desde una sesión de empleado autenticada, en /admin/canjear.
 */

type Voucher = {
  code: string;
  amount_cents: number;
  status: 'issued' | 'redeemed' | 'expired' | 'void';
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
  full_name: string;
  municipality: string;
};

async function buscar(codigoCrudo: string): Promise<Voucher | null> {
  const code = normalizeVoucherCode(decodeURIComponent(codigoCrudo));
  // Un código malformado se descarta aquí sin tocar la base de datos: el dígito
  // verificador detecta el error de tecleo antes de ir a buscar.
  if (!code) return null;

  const [row] = await sql<Voucher[]>`
    select v.code, v.amount_cents, v.status, v.issued_at, v.expires_at,
           v.redeemed_at, p.full_name, m.name as municipality
      from app.vouchers v
      join app.players p       on p.id = v.player_id
      join app.municipalities m on m.id = p.municipality_id
     where v.code = ${code}
  `;
  return row ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigo: string }>;
}): Promise<Metadata> {
  const { codigo } = await params;
  const v = await buscar(codigo);
  return {
    title: v ? `Cupón ${formatVoucherCode(v.code)}` : 'Cupón no encontrado',
    // El cupón no se indexa: es un documento personal con el nombre de una
    // persona real, no una página del sitio.
    robots: { index: false, follow: false },
  };
}

export default async function PaginaPremio({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const v = await buscar(codigo);
  if (!v) notFound();

  const vencido = v.status === 'issued' && new Date(v.expires_at) < new Date();
  const estado = vencido ? 'expired' : v.status;

  // El QR lleva al empleado a la pantalla de canje con el código ya puesto.
  // Si lo escanea el cliente, se topa con el login del panel y no pasa nada.
  const qr = await QRCode.toString(`${SITE.url}/admin/canjear?codigo=${v.code}`, {
    type: 'svg',
    margin: 0,
    width: 176,
    color: { dark: '#0A2547', light: '#FFFFFF' },
  });

  const sello = {
    issued: { texto: 'PENDIENTE DE CANJE', clase: 'text-dorado border-dorado/50 bg-dorado/10' },
    redeemed: { texto: '✓ CANJEADO', clase: 'text-gana border-gana/50 bg-gana/10' },
    expired: { texto: 'VENCIDO', clase: 'text-pierde border-pierde/50 bg-pierde/10' },
    void: { texto: 'ANULADO', clase: 'text-pierde border-pierde/50 bg-pierde/10' },
  }[estado];

  const activo = estado === 'issued';

  return (
    <div className="contenedor flex justify-center py-12 sm:py-16">
      <div className="w-full max-w-md">
        <div
          className={`overflow-hidden rounded-3xl border bg-noche-2/90 ${
            activo ? 'border-dorado/40 shadow-premio' : 'border-linea opacity-90'
          }`}
        >
          <div className="flex items-center gap-2.5 border-b border-linea px-6 py-4">
            <ChipMark className="h-7 w-7" />
            <p className="font-display text-sm font-semibold tracking-wide">{SITE.name}</p>
          </div>

          <div className="px-6 py-8 text-center">
            <p className="text-xs uppercase tracking-[0.28em] text-tenue">
              Premio en efectivo
            </p>
            <p
              className={`mt-2 font-display text-6xl font-bold tabular ${
                activo ? 'texto-dorado' : 'text-tenue'
              }`}
            >
              {money(v.amount_cents)}
            </p>

            <div className="mt-7 flex justify-center">
              <div
                className={`rounded-2xl bg-white p-3 ${activo ? '' : 'opacity-40 grayscale'}`}
                dangerouslySetInnerHTML={{ __html: qr }}
              />
            </div>

            <p className="mt-5 font-display text-2xl font-bold tracking-[0.2em] tabular">
              {formatVoucherCode(v.code)}
            </p>

            <dl className="mt-7 space-y-2 text-left text-sm">
              <Fila etiqueta="Ganador" valor={v.full_name} />
              <Fila etiqueta="Pueblo" valor={v.municipality} />
              <Fila etiqueta="Ganado" valor={dateTime(v.issued_at)} />
              <Fila
                etiqueta={estado === 'redeemed' ? 'Canjeado' : 'Vence'}
                valor={
                  estado === 'redeemed' && v.redeemed_at
                    ? dateTime(v.redeemed_at)
                    : longDate(v.expires_at)
                }
              />
            </dl>

            {activo && (
              <ul className="mt-7 space-y-2 rounded-2xl border border-linea bg-white/5 p-4 text-left text-sm text-tenue">
                <li>▸ Presenta esta pantalla en Servicio al Cliente.</li>
                <li>▸ Requiere identificación con foto.</li>
                <li>▸ Válido por {PROMO.voucherDays} días desde que lo ganaste.</li>
              </ul>
            )}
          </div>

          <div className={`border-t px-6 py-4 text-center ${sello.clase}`}>
            <p className="font-display text-sm font-bold tracking-[0.2em]">{sello.texto}</p>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-tenue">
          <Link href="/" className="underline underline-offset-4 hover:text-cian">
            Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-linea/60 pb-2">
      <dt className="text-tenue">{etiqueta}</dt>
      <dd className="text-right font-medium text-crema">{valor}</dd>
    </div>
  );
}
