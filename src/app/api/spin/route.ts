import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { registrarJugador } from '@/lib/registro';
import { losingReels, winningReels } from '@/lib/reels';
import { generateVoucherCode } from '@/lib/voucher';
import {
  getSession,
  getClientIp,
  signToken,
  cookieHeader,
  DEVICE_COOKIE,
} from '@/lib/session';
import { nextMidnightPr } from '@/lib/format';
import { getPromocionesPopup, seguro } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

const Registro = z.object({
  nombre: z.string().trim().min(3).max(120).optional(),
  celular: z.string().trim().min(7).max(25).optional(),
  puebloId: z.coerce.number().int().min(1).max(78).optional(),
  acepta: z.boolean().optional(),
  contrasena: z.string().min(8).max(200).optional(),
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

  // Las promociones del pop-up viajan en esta misma respuesta en vez de en una
  // llamada aparte: el modal ya hace esta petición al abrirse, y una segunda
  // haría parpadear la pantalla entre el arte y el estado del jugador.
  const promos = await seguro(getPromocionesPopup, []);

  if (!playerId) {
    return NextResponse.json({ ok: true, registrado: false, promos });
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

  if (!fila) return NextResponse.json({ ok: true, registrado: false, promos });

  return NextResponse.json({
    ok: true,
    registrado: true,
    promos,
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

  // --- Registro al vuelo ----------------------------------------------------
  // Caso de respaldo: normalmente la cuenta ya se creó en /api/registrar antes
  // de llegar a la máquina, y aquí solo se tira. Pero si llega una tirada sin
  // sesión (cookie perdida entre pasos, o un cliente que llama directo), se
  // registra con los mismos datos y la misma lógica, sin duplicarla.
  if (!playerId) {
    const r = await registrarJugador(parsed.data, { ip, deviceId: dispositivo });
    if (!r.ok) return error(r.codigo, r.mensaje, r.status);
    if (r.bloqueado) {
      return error('CUENTA_BLOQUEADA', 'Esta cuenta no puede participar. Pasa por Servicio al Cliente.', 403);
    }
    playerId = r.playerId;
    cookiesNuevas.push(r.cookieSesion);
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
