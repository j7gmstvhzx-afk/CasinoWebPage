export const PR_TIMEZONE = 'America/Puerto_Rico';

/** 1220401 -> "$12,204.01" */
export function money(cents: number | bigint | string | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  const n = Number(cents) / 100;
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

/** "$12,204" — para titulares donde los centavos solo estorban. */
export function moneyShort(cents: number | bigint | string | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  const n = Math.floor(Number(cents) / 100);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US')}`;
}

/**
 * Normaliza los espacios que mete Intl.
 *
 * Node y el navegador traen versiones distintas de ICU, y una pone U+202F
 * (espacio angosto sin quiebre) antes de "p. m." donde la otra pone un espacio
 * normal. El texto se ve idéntico, pero React lo detecta como discrepancia de
 * hidratación, descarta el subárbol y lo vuelve a pintar en el cliente.
 *
 * Cuesta más encontrarlo que arreglarlo: en el mensaje de error las dos cadenas
 * salen exactamente iguales.
 */
const espacios = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ');

const dt = (opts: Intl.DateTimeFormatOptions) => {
  const f = new Intl.DateTimeFormat('es-PR', { timeZone: PR_TIMEZONE, ...opts });
  return { format: (d: Date) => espacios(f.format(d)) };
};

/** "16 de agosto de 2026" */
export const longDate = (d: Date | string) =>
  dt({ day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d));

/** "16 ago 2026, 3:47 p.m." */
export const dateTime = (d: Date | string) =>
  dt({
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(d));

/** "hoy, 7:58 a.m." / "ayer, 7:58 a.m." / "14 ago, 7:58 a.m." */
export function relativeUpdate(d: Date | string): string {
  const date = new Date(d);
  const time = dt({ hour: 'numeric', minute: '2-digit' }).format(date);
  const dayOf = (x: Date) => dt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);

  if (dayOf(date) === dayOf(now)) return `hoy, ${time}`;
  if (dayOf(date) === dayOf(yesterday)) return `ayer, ${time}`;
  return `${dt({ day: 'numeric', month: 'short' }).format(date)}, ${time}`;
}

/**
 * Próxima medianoche en hora de Puerto Rico, en ISO.
 *
 * PR es AST (UTC-4) todo el año y no observa horario de verano, así que el
 * desplazamiento es fijo y esta aritmética no se desincroniza dos veces al año
 * como pasaría en casi cualquier otra zona.
 */
export function nextMidnightPr(): string {
  const AST_OFFSET_MS = 4 * 3_600_000;
  const asIfUtc = new Date(Date.now() - AST_OFFSET_MS);
  asIfUtc.setUTCHours(24, 0, 0, 0);
  return new Date(asIfUtc.getTime() + AST_OFFSET_MS).toISOString();
}

/** "5 h 12 min" — cuenta regresiva a la próxima tirada. */
export function untilLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'ya disponible';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h === 0) return `${m} min`;
  return `${h} h ${m} min`;
}
