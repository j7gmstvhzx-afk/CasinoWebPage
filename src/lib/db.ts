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
 *   max: 4          Una lambda atiende UNA petición a la vez, y de ahí salió el
 *                   `max: 1` que había aquí: "un pool mayor solo consume
 *                   ranuras de Supabase sin dar nada a cambio". Es falso, y
 *                   costó una cifra en cero en la página pública.
 *
 *                   Una petición no hace UNA consulta. La pestaña de premios
 *                   lanza cinco a la vez con Promise.all. Con una sola
 *                   conexión no corren en paralelo: hacen cola. Pero el
 *                   límite de tiempo de `seguro()` arranca para las cinco en
 *                   el mismo instante, así que la última de la fila tiene que
 *                   caber en 2.5 s CONTANDO lo que tardaron las cuatro de
 *                   delante más el saludo TLS del arranque en frío. La que
 *                   pierde no es la lenta: es la última.
 *
 *                   Así se vio: el total del salón salió "$0.00 repartidos en
 *                   0 máquinas" mientras la lista de debajo enseñaba sus
 *                   quince máquinas con sus montos. La consulta del total
 *                   corre en 40 ms contra la base de producción; nunca fue
 *                   lenta, era la quinta.
 *
 *                   Cuatro conexiones es el ancho de la ráfaga más grande que
 *                   hace este sitio. El pooler de Supabase en modo transacción
 *                   está hecho justo para esto y las devuelve al acabar cada
 *                   sentencia.
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
    max: 4,
    prepare: false,
    types: {
      // Las columnas `date` vuelven como CADENA 'YYYY-MM-DD', no como Date.
      //
      // Una fecha de Postgres es un DÍA DE CALENDARIO, no un instante. El
      // driver, por defecto, la convierte en un Date a medianoche UTC, y de ahí
      // salieron dos fallos de verdad:
      //
      //   1. /eventos se quedaba EN BLANCO por completo, con eventos publicados
      //      y todo. La página compara `e.starts_on <= hoy` contra una cadena
      //      'YYYY-MM-DD'; con un Date de un lado, JavaScript convierte el otro
      //      operando a número, sale NaN, y TODA comparación da false. Los
      //      eventos no caían ni en "Ahora mismo" ni en "Próximamente" y la
      //      sección se pintaba vacía. Sin error, sin aviso, sin nada.
      //
      //   2. Todas las fechas salían UN DÍA ANTES. Medianoche UTC del día 28,
      //      mirada desde Puerto Rico (UTC-4), es el día 27 a las 8 p.m. Un
      //      torneo del viernes se anunciaba el jueves.
      //
      // Los tipos de TypeScript ya decían `string | null` en todas partes: no
      // era el código el que mentía, era el driver. Devolviendo la cadena cruda
      // el tipo pasa a ser cierto, las comparaciones funcionan, `.slice(0, 10)`
      // del panel deja de ser una llamada a un método que no existe, y no hay
      // ninguna zona horaria de por medio que pueda correr el día.
      //
      // Esto NO toca `timestamptz` (created_at, reading_at…): esos SÍ son
      // instantes y tienen que seguir llegando como Date.
      fecha: {
        to: 1082,
        from: [1082],
        serialize: (x: string) => x,
        parse: (x: string) => x,
      },
    },
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: local ? false : 'require',
    connection: {
      // El corte del lado del servidor. `seguro()` deja de esperar a los 2.5 s,
      // pero eso solo suelta a la página: la consulta seguiría corriendo en
      // Postgres, ocupando la única conexión de esta lambda y trabando a la
      // siguiente petición que llegue. Con esto la mata Postgres.
      //
      // 8 s y no 2.5: aquí también pasan las escrituras de la tirada y del
      // panel, que no las cubre `seguro()` y que sí pueden tardar más que una
      // lectura del tablero.
      statement_timeout: 8_000,
      // Una transacción abierta y abandonada retiene sus candados. En
      // `execute_spin` eso bloquearía las tiradas de todo el mundo.
      idle_in_transaction_session_timeout: 10_000,
    },
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
