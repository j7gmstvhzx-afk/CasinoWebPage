import 'server-only';
import { sql } from './db';
import { normalizeVoucherCode } from './voucher';

export type CuponDetalle = {
  code: string;
  full_name: string;
  phone_e164: string;
  municipality: string;
  amount_cents: number;
  status: 'issued' | 'redeemed' | 'expired' | 'void';
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
};

export type Busqueda =
  | { ok: true; cupon: CuponDetalle; canjeable: boolean }
  | { ok: false; codigo: 'MAL_ESCRITO' | 'NO_EXISTE' };

/**
 * Busca un cupón. SOLO LECTURA — nunca canjea.
 *
 * Compartida entre la ruta de API y la página del panel para que el empleado
 * vea exactamente lo mismo escanee el QR (que llega por la URL y se resuelve en
 * el servidor) o teclee el código (que va por fetch). Duplicar esta lógica en
 * los dos sitios es cómo terminan divergiendo y mostrando estados distintos
 * para el mismo cupón.
 */
export async function buscarCupon(codigoCrudo: string): Promise<Busqueda> {
  const code = normalizeVoucherCode(codigoCrudo);
  // El dígito verificador atrapa el error de tecleo aquí, sin ir a la base de
  // datos, para poder decir "revísalo" en vez de "no existe" — que haría pensar
  // al empleado que el cliente trae un cupón falso.
  if (!code) return { ok: false, codigo: 'MAL_ESCRITO' };

  const [v] = await sql<CuponDetalle[]>`
    select v.code, p.full_name, p.phone_e164, m.name as municipality,
           v.amount_cents, v.status, v.issued_at, v.expires_at, v.redeemed_at
      from app.vouchers v
      join app.players p        on p.id = v.player_id
      join app.municipalities m on m.id = p.municipality_id
     where v.code = ${code}
  `;

  if (!v) return { ok: false, codigo: 'NO_EXISTE' };

  const vencido = v.status === 'issued' && new Date(v.expires_at) < new Date();

  return {
    ok: true,
    cupon: { ...v, status: vencido ? 'expired' : v.status },
    canjeable: v.status === 'issued' && !vencido,
  };
}

export const MENSAJES_CUPON: Record<string, string> = {
  MAL_ESCRITO: 'El código no está bien escrito. Revísalo y vuelve a intentar.',
  NO_EXISTE: 'Ese código no existe.',
  YA_CANJEADO: 'Este cupón ya fue canjeado.',
  VENCIDO: 'Este cupón está vencido.',
  ANULADO: 'Este cupón fue anulado.',
  NO_VALIDO: 'Este cupón no es válido.',
};
