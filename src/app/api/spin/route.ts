import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { normalizePhone, PHONE_ERROR_ES } from '@/lib/phone';
import { losingReels, winningReels } from '@/lib/reels';
import { generateVoucherCode } from '@/lib/voucher';
import {
  getSession,
  getClientIp,
  signToken,
  cookieHeader,
  SESSION_COOKIE,
  DEVICE_COOKIE,
} from '@/lib/session';
import { nextMidnightPr } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Registro = z.object({
  nombre: z.string().trim().min(3).max(120).optional(),
  celular: z.string().trim().min(7).max(25).optional(),
  puebloId: z.coerce.number().int().min(1).max(78).optional(),
  acepta: z.boolean().optional(),
  // Trampa: un campo oculto que una persona nunca llena y un bot sí.
  website: z.string().max(0).optional(),
});

type FilaTirada = {
  out_spin_id: string;
  out_gaming_date: string;
  out_is_winner: boolean;
  out_reels: number[];
  out_replayed: boolean;
  out_voucher_code: string | null;
  out_voucher_exp: string | null;
};

const error = (codigo: string, mensaje: string, status = 400) =>
  NextResponse.json({ ok: false, error: codigo, mensaje }, { status });

/**
 * GET — estado del visitante, sin consumir la tirada del día.
 *
 * Existe para que el modal pueda saludar por su nombre a quien ya se registró y
 * mostrarle el resultado de hoy si ya tiró, sin disparar una tirada como efecto
 * secundario de abrir la página.
 */
export async function GET() {
  const { playerId } = await getSession();
  if (!playerId) {
    return NextResponse.json({ ok: true, registrado: false });
  }

  const [fila] = await sql<
    {
      full_name: string;
      is_winner: boolean | null;
      reels: number[] | null;
      code: string | null;
      expires_at: string | null;
    }[]
  >`
    select p.full_name, s.is_winner, s.reels, v.code, v.expires_at
      from app.players p
      left join app.spins s
        on s.player_id = p.id and s.gaming_date = app.gaming_date(now())
      left join app.wins w  on w.spin_id = s.id
      left join app.vouchers v on v.win_id = w.id and v.status <> 'void'
     where p.id = ${playerId}
  `;

  if (!fila) return NextResponse.json({ ok: true, registrado: false });

  return NextResponse.json({
    ok: true,
    registrado: true,
    nombre: fila.full_name.split(/\s+/)[0],
    tiroHoy: fila.is_winner !== null,
    reels: fila.reels,
    resultado: fila.is_winner === null ? null : fila.is_winner ? 'win' : 'lose',
    voucher: fila.code ? { code: fila.code, expiresAt: fila.expires_at } : null,
    proximaTirada: nextMidnightPr(),
  });
}

export async function POST(req: NextRequest) {
  const ip = await getClientIp();
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 512);

  const crudo = await req.json().catch(() => null);
  const parsed = Registro.safeParse(crudo ?? {});
  if (!parsed.success) return error('DATOS_INVALIDOS', 'Revisa los datos del formulario.');
  if (parsed.data.website) return error('DATOS_INVALIDOS', 'Revisa los datos del formulario.');

  const { playerId: sesion, deviceId } = await getSession();
  const dispositivo = deviceId ?? randomUUID();
  const cookiesNuevas: string[] = [];
  if (!deviceId) cookiesNuevas.push(cookieHeader(DEVICE_COOKIE, await signToken({ did: dispositivo })));

  let playerId = sesion;

  // --- Registro -------------------------------------------------------------
  if (!playerId) {
    const { nombre, celular, puebloId, acepta } = parsed.data;
    if (!nombre || !celular || !puebloId) {
      return error('REGISTRO_REQUERIDO', 'Completa tu nombre, celular y pueblo.');
    }
    if (!acepta) {
      return error('CONSENTIMIENTO_REQUERIDO', 'Debes aceptar los términos para participar.');
    }

    const tel = normalizePhone(celular);
    if (!tel.ok) return error('TELEFONO_INVALIDO', PHONE_ERROR_ES[tel.reason]);

    const [permitido] = await sql<{ rate_hit: boolean }[]>`
      select app.rate_hit('register_ip', ${ip}, interval '1 hour', 12) as rate_hit
    `;
    if (!permitido.rate_hit) {
      return error('DEMASIADOS_INTENTOS', 'Demasiados registros desde esta conexión. Intenta más tarde.', 429);
    }

    // DO UPDATE, no DO NOTHING: con DO NOTHING un conflicto devuelve cero filas
    // y RETURNING no da nada, así que haría falta un SELECT extra y un
    // reintento. Así siempre vuelve la fila.
    const [jugador] = await sql<{ id: string; blocked_at: string | null }[]>`
      insert into app.players (phone_e164, full_name, municipality_id, consent_at)
      values (${tel.e164}, ${nombre}, ${puebloId}, now())
      on conflict (phone_e164) do update
        set last_seen_at = now(),
            full_name    = excluded.full_name,
            municipality_id = excluded.municipality_id
      returning id, blocked_at
    `;

    // Un código de área de fuera de PR no se rechaza — puede ser un turista o
    // alguien que conserva su número de cuando vivía en Estados Unidos. Se deja
    // anotado para revisión y ya.
    if (!tel.isPuertoRico) {
      await sql`
        insert into app.risk_events (player_id, device_id, ip_inet, kind, score, detail)
        values (${jugador.id}, ${dispositivo}, ${ip}, 'area_code_no_pr', 10,
                ${sql.json({ areaCode: tel.areaCode })})
      `;
    }

    playerId = jugador.id;
    cookiesNuevas.push(cookieHeader(SESSION_COOKIE, await signToken({ pid: playerId })));
  }

  // --- Tirada ---------------------------------------------------------------
  // Toda la lógica vive dentro de execute_spin: una llamada, una transacción,
  // atómica. Ver supabase/migrations/0002_functions.sql.
  const [fila] = await sql<FilaTirada[]>`
    select * from app.execute_spin(
      ${playerId}::uuid,
      ${dispositivo}::uuid,
      ${ip}::inet,
      ${ua},
      ${losingReels()}::smallint[],
      ${winningReels()}::smallint[],
      ${generateVoucherCode()},
      7
    )
  `;

  const res = NextResponse.json({
    ok: true,
    reels: fila.out_reels,
    result: fila.out_is_winner ? 'win' : 'lose',
    alreadySpunToday: fila.out_replayed,
    voucher: fila.out_voucher_code
      ? { code: fila.out_voucher_code, expiresAt: fila.out_voucher_exp }
      : null,
    proximaTirada: nextMidnightPr(),
    // Nunca se envía winning_moment_at, ni si alguien ya ganó hoy, ni ninguna
    // probabilidad. Con cualquiera de esos datos el juego se vuelve resoluble
    // desde el navegador.
  });

  for (const c of cookiesNuevas) res.headers.append('Set-Cookie', c);
  return res;
}
