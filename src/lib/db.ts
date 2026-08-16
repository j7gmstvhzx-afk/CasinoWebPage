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

  const cliente = postgres(cadena, {
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
