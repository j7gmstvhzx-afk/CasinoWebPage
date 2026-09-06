/**
 * Cuándo se emitió un token, en milisegundos.
 *
 * Vive en su propio archivo, y no junto al resto de la revocación, por una
 * razón concreta: `lib/revocar.ts` habla con la base y lleva `server-only`, y
 * esto lo necesita también `lib/session.ts`, que se usa en sitios donde no se
 * quiere arrastrar la base detrás. Es lógica pura: no toca nada.
 *
 * Prefiere `ms` —la marca con milisegundos que pone `signToken`— y cae a `iat`,
 * que es la del estándar y va en segundos, para los tokens firmados ANTES de
 * que existiera `ms`. Esos quedan con precisión de segundo, y en el empate se
 * les trata como anteriores al cierre: para un token viejo, ésa es justo la
 * respuesta prudente.
 */
export function emitidoEnMs(payload: unknown): number | null {
  const p = payload as { ms?: unknown; iat?: unknown } | null | undefined;
  if (!p) return null;
  if (typeof p.ms === 'number' && Number.isFinite(p.ms)) return p.ms;
  if (typeof p.iat === 'number' && Number.isFinite(p.iat)) return p.iat * 1000;
  return null;
}
