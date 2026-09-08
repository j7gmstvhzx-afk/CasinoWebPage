import 'server-only';
import { sql } from './db';
import type { EstadoGuardado } from './historial-texto';

/**
 * El historial del jugador: sus premios y los días que ha jugado.
 *
 * Hasta ahora la cuenta solo sabía contestar "¿participaste HOY?". Todo lo
 * demás estaba guardado —cada tirada deja fila en `app.spins`, cada premio en
 * `app.wins` + `app.vouchers`— y no se le enseñaba a su dueño. Esto no calcula
 * nada nuevo: lee lo que ya existe.
 */

export type PremioDelJugador = {
  /** El día de juego en que cayó, 'YYYY-MM-DD'. */
  fecha: string;
  centavos: number;
  code: string;
  estado: EstadoGuardado;
  /** Instante, no día de calendario: el cupón vence a una hora. */
  expiraEn: string;
  canjeadoEn: string | null;
};

export type Historial = {
  dias: number;
  primero: string | null;
  ultimo: string | null;
  premios: PremioDelJugador[];
  /** Suma de lo ganado, sin contar los cupones anulados. */
  totalCentavos: number;
};

type Fila = {
  sessions_valid_from: Date | null;
  dias: number;
  primero: string | null;
  ultimo: string | null;
  premios: PremioDelJugador[] | null;
  total: number;
};

/**
 * Todo en UNA consulta, sello de sesión incluido.
 *
 * No es micro-optimización: el pooler de sesión de Supabase tiene un techo duro
 * de clientes para todo el proyecto, y cada viaje de ida y vuelta ocupa uno.
 * Preguntar aparte "¿sigue viva la sesión?" duplicaría el costo de abrir esta
 * pantalla. `/api/spin` resuelve lo mismo de la misma forma.
 *
 * Devuelve `null` cuando el jugador de la cookie ya no existe en la tabla —
 * cuenta borrada, o una cookie de otra base de datos.
 */
export async function leerHistorial(
  playerId: string,
): Promise<{ selloSesion: Date | null; historial: Historial } | null> {
  const [fila] = await sql<Fila[]>`
    with jugador as (
      select id, sessions_valid_from from app.players where id = ${playerId}::uuid
    ),
    tiradas as (
      select count(*)::int         as dias,
             min(gaming_date)::text as primero,
             max(gaming_date)::text as ultimo
        from app.spins where player_id = ${playerId}::uuid
    ),
    premios as (
      select
        json_agg(
          json_build_object(
            'fecha',      w.gaming_date::text,
            'centavos',   v.amount_cents,
            'code',       v.code,
            'estado',     v.status::text,
            'expiraEn',   v.expires_at,
            'canjeadoEn', v.redeemed_at
          ) order by w.gaming_date desc
        ) as lista,
        -- Un cupón anulado no es dinero que ganó: no suma.
        coalesce(sum(v.amount_cents) filter (where v.status <> 'void'), 0)::int as total
      from app.wins w
      join app.vouchers v on v.win_id = w.id
     where w.player_id = ${playerId}::uuid
    )
    select j.sessions_valid_from, t.dias, t.primero, t.ultimo,
           p.lista as premios, p.total
      from jugador j, tiradas t, premios p
  `;

  if (!fila) return null;

  return {
    selloSesion: fila.sessions_valid_from,
    historial: {
      dias: fila.dias,
      primero: fila.primero,
      ultimo: fila.ultimo,
      // `json_agg` de cero filas devuelve NULL, no un array vacío. Es la
      // diferencia entre una lista vacía y un `.map` sobre null.
      premios: fila.premios ?? [],
      totalCentavos: fila.total,
    },
  };
}
