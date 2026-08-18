import postgres from 'postgres';

/**
 * Cliente de Postgres.
 *
 * Dos opciones que NO son cosméticas cuando esto corre en Vercel contra el
 * pooler de Supabase (puerto 6543, modo transacción):
 *
 *   prepare: false  PgBouncer en modo transacción no soporta sentencias
 *                   preparadas a nivel de protocolo. Sin esto, bajo carga
 *                   aparece "prepared statement s1 already exists" de forma
 *                   intermitente — el peor tipo de fallo, porque con poco
 *                   tráfico no se ve nunca.
 *
 *   max: 1          Cada lambda de Vercel atiende una petición a la vez. Un
 *                   pool mayor solo consume ranuras de conexión de Supabase
 *                   sin dar nada a cambio.
 *
 * La conexión se crea PEREZOSAMENTE. Si se creara al importar el módulo, el
 * build fallaría en cualquier entorno sin credenciales (CI, un `next build`
 * limpio) aunque ninguna página consulte nada en tiempo de compilación.
 */

type Sql = ReturnType<typeof postgres>;

declare global {
  var __camSql: Sql | undefined;
}

let instancia: Sql | undefined;

/**
 * Corrige el usuario cuando la cadena apunta al pooler de Supabase.
 *
 * El pooler enruta por el NOMBRE DE USUARIO: hay que entrar como
 * `postgres.<ref-del-proyecto>`, no como `postgres` a secas. Si falta el sufijo,
 * el pooler no sabe a qué proyecto mandarte y responde
 * "password authentication failed for user postgres" — un mensaje que apunta a
 * la contraseña cuando el problema es el usuario. Se han perdido tardes enteras
 * cambiando contraseñas buenas por culpa de ese texto.
 *
 * El `ref` se saca de SUPABASE_URL, que ya está configurada para el almacenamiento.
 *
 * Esto NO toca una cadena que ya venga bien (la de un proyecto correcto queda
 * igual), ni una conexión directa a `db.<ref>.supabase.co`, donde el usuario
 * `postgres` sí es el correcto.
 */
function normalizarCadena(cadena: string): string {
  let u: URL;
  try {
    u = new URL(cadena);
  } catch {
    return cadena; // formato raro: se deja como está, que falle con su propio error
  }

  const esPooler = /\.pooler\.supabase\.com$/i.test(u.hostname);
  const usuario = decodeURIComponent(u.username);
  if (!esPooler || usuario !== 'postgres') return cadena;

  const ref = process.env.SUPABASE_URL?.match(
    /https?:\/\/([a-z0-9]+)\.supabase\.(co|in)/i,
  )?.[1];
  if (!ref) {
    console.error(
      '[db] La cadena usa el pooler con el usuario "postgres" (le falta el ' +
        'sufijo del proyecto) y no hay SUPABASE_URL para deducirlo. Corrige ' +
        'DATABASE_POOL_URL: el usuario debe ser postgres.<ref-del-proyecto>.',
    );
    return cadena;
  }

  u.username = `postgres.${ref}`;
  console.warn(
    `[db] DATABASE_POOL_URL venía con el usuario "postgres"; se corrigió a ` +
      `"postgres.${ref}" para el pooler. Arréglala en Vercel para no depender de esto.`,
  );
  return u.toString();
}

function crear(): Sql {
  if (globalThis.__camSql) return globalThis.__camSql;

  const cadena = process.env.DATABASE_POOL_URL ?? process.env.DATABASE_URL;
  if (!cadena) {
    throw new Error(
      'Falta DATABASE_POOL_URL (o DATABASE_URL). Para Supabase usa la cadena ' +
        'del pooler en modo transacción, puerto 6543.',
    );
  }

  const local = /localhost|127\.0\.0\.1|\/var\/tmp|\/tmp/.test(cadena);
  const corregida = normalizarCadena(cadena);

  // Huella de la conexión, SIN la contraseña. Cuando el sitio sale vacío, la
  // pregunta siempre es la misma —  ¿a qué base está hablando y como quién? —  y
  // sin esto hay que adivinarlo desde un error que no lo dice.
  try {
    const u = new URL(corregida);
    console.info(
      `[db] host=${u.hostname} puerto=${u.port || '(por defecto)'} ` +
        `usuario=${decodeURIComponent(u.username)} base=${u.pathname.slice(1)}`,
    );
  } catch {
    console.error('[db] DATABASE_POOL_URL no tiene formato de URL válido.');
  }

  const cliente = postgres(corregida, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: local ? false : 'require',
  });

  // En desarrollo Next recarga los módulos en cada cambio. Sin esto se abriría
  // una conexión nueva por recarga hasta agotar el límite de Postgres.
  if (process.env.NODE_ENV !== 'production') globalThis.__camSql = cliente;
  return cliente;
}

export function getSql(): Sql {
  instancia ??= crear();
  return instancia;
}

/**
 * Se expone como Proxy para que los llamadores usen la plantilla etiquetada de
 * siempre —  sql`select 1` — sin enterarse de la inicialización perezosa.
 */
export const sql = new Proxy((() => {}) as unknown as Sql, {
  apply(_t, _thisArg, args: unknown[]) {
    // @ts-expect-error — se reenvía la llamada de plantilla etiquetada tal cual
    return getSql()(...args);
  },
  get(_t, prop, receiver) {
    return Reflect.get(getSql() as object, prop, receiver);
  },
});
