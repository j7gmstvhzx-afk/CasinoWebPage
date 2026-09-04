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
  /** Cuándo se abrió el pool que está guardado. Ver `edadDelPool`. */
  var __camSqlDesde: number | undefined;
  /** Cuándo se pidió por última vez. Ver `MAX_REPOSO_MS`. */
  var __camSqlUltimoUso: number | undefined;
}

/**
 * NO HAY COPIA LOCAL DEL POOL, Y ESO ES A PROPÓSITO.
 *
 * Aquí había un `let instancia` que guardaba el pool también en el módulo, para
 * ahorrarse mirar en `globalThis` en cada consulta. Era inofensivo mientras
 * nadie tirara el pool; en cuanto se pudo tirar (ver `descartarPool`), se
 * convirtió en un fallo grave, y salió en la primera prueba completa:
 *
 *     [db] se descarta el pool (llevaba 106 s sin usarse).
 *     [db] host=localhost ...            <- se abrió otro, bien
 *     Error: write CONNECTION_ENDED      <- y aun así, TODO falló a partir de ahí
 *
 * El motivo es que el empaquetador NO deja una sola copia de este archivo: en
 * el servidor conviven varias (una por trozo — se ven en el propio error:
 * `src_lib_db_ts_...` y `ssr/src_lib_queries_ts_...`). Cada copia tenía su
 * propio `instancia`. Al descartar, la copia que lo hizo se quedaba limpia,
 * pero LAS OTRAS seguían con el pool ya cerrado en su variable, y como su
 * `instancia` no estaba vacía nunca volvían a mirar `globalThis`: servían el
 * cadáver para siempre. Una página se recuperaba y las demás quedaban muertas
 * hasta el siguiente despliegue.
 *
 * `globalThis` es de la copia de nadie y de todas: es el único sitio donde
 * "tirar el pool" significa lo mismo para todo el proceso.
 */

/**
 * CUÁNTO PUEDE ESTAR QUIETO EL POOL ANTES DE NO FIARSE DE ÉL.
 *
 * Éste es el arreglo del esqueleto que tarda. La cadena es así:
 *
 *   1. En Vercel la función se CONGELA en cuanto contesta. Congelada no corre
 *      nada suyo: ni el temporizador que cierra conexiones ociosas, ni el
 *      latido de TCP que comprueba que el otro lado sigue ahí.
 *   2. El otro lado —el pooler de Supabase, o cualquier cortafuegos del
 *      camino— sí sigue contando, y pasados unos minutos de silencio da la
 *      conexión por muerta y deja de atenderla. A veces avisa, a veces no.
 *   3. La función despierta con la visita siguiente y en el pool tiene un
 *      socket que PARECE bueno. Como no hay nada que conectar, `connect_timeout`
 *      no salta. La consulta se escribe sin error... y no vuelve nunca.
 *   4. A los 6,5 s nos rendimos. Eso es el esqueleto que se queda puesto.
 *
 * Un temporizador no puede arreglar esto, porque el problema es justamente que
 * los temporizadores no corren. Lo que sí funciona es MIRAR EL RELOJ al pedir
 * el pool: si lleva más de esto sin usarse, no se usa — se tira y se abre otro.
 * Un reloj no se congela; el reloj es lo único que sigue corriendo.
 *
 * NOVENTA SEGUNDOS, Y NO SESENTA. Muy por debajo de cualquier plazo de
 * inactividad razonable del otro lado, y muy por encima del ritmo de alguien
 * navegando por el panel, así que en pleno uso no se nota nunca. El minuto
 * redondo, que era lo primero que se probó, cae JUSTO encima del `revalidate`
 * de las páginas públicas: con visitas de vez en cuando, el reposo se quedaría
 * rondando los 60 s exactos y el pool se tiraría casi en cada refresco, pagando
 * un saludo por minuto sin necesidad. Noventa no coincide con nada.
 *
 * El precio, cuando toca, es el saludo TCP + TLS —unas décimas— en vez de
 * 6,5 s tirados. No es un empate: es la diferencia entre que la pantalla salga
 * y que no.
 */
const MAX_REPOSO_MS = 90_000;

/**
 * Segundos que se le dan a un pool descartado para terminar lo que tenga en
 * vuelo antes de cerrarlo a la fuerza. Ver `descartarPool`: tiene que ser mayor
 * que `idle_in_transaction_session_timeout`, que es lo más largo que puede
 * durar legítimamente algo empezado.
 */
const GRACIA_AL_CERRAR_S = 12;

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
  globalThis.__camSqlDesde = Date.now();
  globalThis.__camSqlUltimoUso = Date.now();

  const cadena = process.env.DATABASE_POOL_URL ?? process.env.DATABASE_URL;
  if (!cadena) {
    throw new Error(
      'Falta DATABASE_POOL_URL (o DATABASE_URL). Para Supabase usa la cadena ' +
        'del pooler en modo transacción, puerto 6543.',
    );
  }

  const local = /localhost|127\.0\.0\.1|\/var\/tmp|\/tmp/.test(cadena);

  // ¿Esto corre dentro de `next build`? Los plazos de una petición no valen ahí:
  // no hay nadie esperando, no hay función que se corte a los 15 s, y la base
  // está más fría que en ningún otro momento. Ver EN_BUILD en lib/queries.ts.
  //
  // Se calcula aquí y no se importa de queries.ts porque queries.ts importa
  // este archivo: importarlo de vuelta sería un círculo.
  const enBuild = process.env.NEXT_PHASE === 'phase-production-build';
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

  // LOS PLAZOS DEL LADO DEL SERVIDOR, Y POR QUÉ NO SIEMPRE SE MANDAN.
  //
  // Son la red de seguridad: matan en Postgres la consulta que nosotros ya
  // abandonamos, para que no se quede ocupando su conexión.
  //
  // El problema es CÓMO viajan. Estos ajustes van en el saludo inicial de la
  // conexión, y el pooler en modo transacción reparte una misma conexión de
  // base entre varios clientes: para eso tiene que emparejar a cada cliente con
  // una conexión que traiga los mismos ajustes. Los registros de producción
  // enseñan justo el síntoma que eso produce —el cliente se autentica, la
  // primera consulta pasa, y de ahí en adelante se queda esperando, sin error,
  // hasta que nos rendimos:
  //
  //     21:17:26.58  Connection authenticated  x3
  //     21:17:26.60  Backend authenticated     x3
  //     21:17:26.8   una consulta responde
  //     21:17:38     SEIS consultas se rinden a los 12 s
  //
  // Y no es la base: medido contra producción, el tablero de jackpots entero
  // tarda 0,29 ms y la base pesa 12 MB.
  //
  // SE PROBÓ A NO MANDARLOS POR EL POOLER, Y NO ERA ESO. Despliegue de las
  // 00:55: sin estos dos ajustes, el build se colgó exactamente igual —pool
  // abierto a las 00:55:23, una consulta acierta a los 334 ms, y a las 00:55:35
  // seis se rinden a los 12 s—. La sospecha era que el pooler no encontraba con
  // qué emparejar a un cliente que traía ajustes no estándar en el saludo.
  // Descartada, y vuelven: son la red de seguridad y no cuestan nada.
  const plazosDelServidor = {
    // El corte del lado del servidor. Cuando la página deja de esperar, eso
    // solo la suelta a ella: la consulta seguiría corriendo en Postgres,
    // ocupando su conexión del pooler y trabando a la siguiente petición que
    // llegue. Con esto la mata Postgres.
    //
    // TIENE QUE SER MAYOR QUE EL PLAZO DEL CLIENTE, PERO POR POCO.
    // Mayor, porque es la red de seguridad y no el primero en disparar (la
    // regla 3 de scripts/verificar-plazos.mjs). Por poco, porque cada
    // milisegundo entre que nosotros abandonamos —6,5 s— y Postgres mata es
    // tiempo en que una consulta que ya no le importa a nadie sigue
    // reteniendo su hueco en el pooler. Con 8 s era medio segundo largo de
    // más; 7 s deja el margen justo.
    //
    // No baja de ahí porque por aquí pasan también las escrituras de la
    // tirada y del panel, que no las cubre ningún plazo del cliente y que sí
    // pueden tardar más que una lectura del tablero.
    statement_timeout: enBuild ? 20_000 : 7_000,
    // Una transacción abierta y abandonada retiene sus candados. En
    // `execute_spin` eso bloquearía las tiradas de todo el mundo.
    idle_in_transaction_session_timeout: 10_000,
  };

  const cliente = postgres(corregida, {
    // CUATRO OTRA VEZ, Y AHORA CON UN MOTIVO MEDIDO EN EL OTRO LADO.
    //
    // Eran seis para dejarle hueco al reintento: una consulta abandonada seguía
    // ocupando su conexión, así que el reintento necesitaba otra libre. Desde
    // que un plazo agotado ya NO se reintenta (ver `esTransitorio` en
    // queries.ts), ese hueco no hace falta.
    //
    // Y sobra por una razón que solo se ve desde los registros de Supabase: el
    // pooler de este proyecto es de tamaño 15 y es COMPARTIDO por todo lo que
    // hable con la base. En el despliegue del 3 de septiembre, el build abrió
    // DIEZ conexiones en el mismo instante —Next lo hace en dos procesos, seis
    // por cada uno— y en la segunda tanda ocho clientes se autenticaron pero
    // solo cuatro consiguieron su conexión de base:
    //
    //     21:10:31.85  ClientHandler: Connection authenticated   x8
    //     21:10:31.85  DbHandler: Backend authenticated          x4
    //
    // Los otros cuatro se quedaron esperando en silencio hasta que nos rendimos
    // a los 12 s. Con cuatro por proceso se pide bastante menos de lo que hay.
    //
    // Y AHORA DOS, POR LO QUE ENSEÑÓ EL TRÁFICO DE VERDAD.
    //
    // El número que importa no es cuántas conexiones pide UNA función: es
    // cuántas piden TODAS a la vez. En los registros del 4 de septiembre a la
    // 01:13:25 hay once peticiones en el mismo segundo —una sola visita, porque
    // Next precarga las nueve pestañas del menú—, seis de ellas rehaciendo su
    // página, cada una en su propia función y cada una abriendo su propio
    // manojo. Seis por cuatro son veinticuatro contra un pooler de quince.
    //
    // Con dos, esas mismas seis funciones piden doce y caben. Y no cuesta nada:
    // la página más pesada lanza cinco consultas a la vez y cada una tarda 0,29
    // ms en la base, así que hacer cola de dos en dos añade décimas de
    // milisegundo, no segundos.
    //
    // Esto NO es "la causa encontrada": es quitarle peso a la única parte del
    // camino donde se ve que hay cola. El diagnóstico de `intentar()` dirá en el
    // próximo apretón si bastó — cuando dice "último acierto hace 5996 ms", con
    // el pool recién abierto, eso es cola, no conexión muerta.
    max: 2,
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
    // LOS PLAZOS DE AQUÍ TIENEN QUE CABER DENTRO DEL PLAZO DE `intentar()`.
    //
    // Estaban al revés y ése era EL fallo: `connect_timeout` daba 10 s para
    // abrir la conexión mientras `seguro()` se rendía a los 2.5. O sea que a
    // una conexión fría se le concedía cuatro veces más tiempo del que la
    // página estaba dispuesta a esperar: era imposible que llegara.
    //
    // Ahora abrir la conexión tiene 5 s y cada intento de `intentar()` tiene 6.
    // El que abre cabe dentro del que espera, que es la única forma de que un
    // arranque en frío pueda terminar.
    //
    // EN EL BUILD SON 10 Y NO 5, y no es una excepción caprichosa: la máquina
    // que hace el build no ha hablado con Supabase nunca, así que paga el
    // saludo entero —TCP, TLS, el pooler— y, si el proyecto llevaba rato
    // quieto, el despertar del servidor. Con 5 s no llegaba: el primer
    // despliegue que lanzaba en el build se cayó ahí. Y en un build no hay nadie
    // esperando ni función que se corte a los 15 s, así que esperar sale
    // gratis. Ver EN_BUILD en lib/queries.ts.
    connect_timeout: enBuild ? 10 : 5,

    // TRES MINUTOS SIN CERRAR, Y NO VEINTE SEGUNDOS.
    //
    // Con 20 s, en un casino de pueblo la conexión estaba fría casi siempre:
    // basta con que no entre nadie durante veinte segundos —lo normal a las
    // tres de la tarde de un martes— para que la siguiente visita tenga que
    // pagar el saludo TCP + TLS + autenticación contra Supabase entero.
    //
    // Ésa era la mitad del "a veces sale y a veces no": si alguien había
    // entrado hace poco, la conexión estaba caliente y la página cargaba; si
    // no, había que abrirla y no daba tiempo. La lotería no era de la base de
    // datos, era del reloj.
    //
    // El pooler de Supabase en modo transacción está hecho para sostener
    // conexiones ociosas: es su trabajo.
    idle_timeout: 180,
    ssl: local ? false : 'require',
    connection: plazosDelServidor,
  });

  // GLOBALTHIS ES EL ÚNICO SITIO DONDE VIVE EL POOL, TAMBIÉN EN PRODUCCIÓN.
  //
  // En desarrollo evita abrir una conexión por cada recarga de módulo hasta
  // agotar el límite de Postgres. En producción hace dos cosas más: si Next
  // reevalúa el módulo dentro de la misma lambda no se abre un pool nuevo
  // dejando el anterior colgando, y —lo importante desde que se puede
  // descartar— todas las copias del módulo que hace el empaquetador comparten
  // el MISMO pool y se enteran a la vez de que se tiró. Ver el comentario de
  // arriba, donde estaba `instancia`.
  globalThis.__camSql = cliente;
  return cliente;
}

export function getSql(): Sql {
  // El reloj, antes que nada. Ver MAX_REPOSO_MS: un pool que lleva un rato
  // quieto en una función congelada no es un pool, es una trampa.
  const reposo = Date.now() - (globalThis.__camSqlUltimoUso ?? 0);
  if (globalThis.__camSql && reposo > MAX_REPOSO_MS) {
    descartarPool(`llevaba ${Math.round(reposo / 1000)} s sin usarse`);
  }

  const cliente = globalThis.__camSql ?? crear();
  globalThis.__camSqlUltimoUso = Date.now();
  return cliente;
}

/**
 * Cuántos milisegundos lleva abierto el pool. -1 si todavía no hay ninguno.
 *
 * Es un dato de diagnóstico, no de funcionamiento: acompaña al registro de una
 * consulta que se agotó para poder distinguir DOS causas que desde el mensaje
 * de error se ven exactamente igual. Ver `descartarPool`.
 */
export function edadDelPool(): number {
  const desde = globalThis.__camSqlDesde;
  return globalThis.__camSql && desde ? Date.now() - desde : -1;
}

/**
 * Tirar el pool y empezar de cero en la siguiente consulta.
 *
 * EL PROBLEMA QUE ESTO ATACA
 * --------------------------
 * En Vercel la función se CONGELA entre una petición y la siguiente. Mientras
 * está congelada no corre ni un temporizador suyo: ni el que cierra las
 * conexiones ociosas ni el latido de TCP. Pero el otro extremo —el pooler de
 * Supabase, o cualquier cortafuegos que haya por el camino— sí sigue contando,
 * y a los pocos minutos da la conexión por muerta y deja de atenderla.
 *
 * Al descongelarse, esta función tiene en el pool un socket que *parece* bueno:
 * está abierto, así que `connect_timeout` no salta —no hay nada que conectar—,
 * la consulta se escribe sin error... y no vuelve nunca. Se queda esperando una
 * respuesta que nadie va a mandar, hasta que se agota nuestro propio plazo.
 *
 * Y como el pool guarda VARIAS conexiones de la misma época, todas están igual
 * de muertas: por eso en producción el reintento fallaba también, sin una sola
 * excepción. No era mala suerte; era el mismo socket podrido dos veces.
 *
 * QUÉ HACE, Y QUÉ NO
 * ------------------
 * No reintenta nada: a la petición que se agotó ya no la salva nadie. Lo que
 * hace es que la SIGUIENTE no herede el problema — suelta el pool sospechoso y
 * la próxima consulta abre conexiones nuevas. Sin esto, una lambda envenenada
 * se queda envenenada: cada pestaña que abra el dueño en los minutos siguientes
 * se come sus 6,5 s de esqueleto.
 *
 * El cierre se pide con GRACIA y SIN ESPERARLO.
 *
 * Con gracia porque bajo `fluid compute` la misma función puede estar
 * atendiendo otra petición a la vez —una escritura del panel dentro de una
 * transacción, por ejemplo— y cortarla en seco sería romper algo que iba bien.
 * Por eso la gracia son DOCE segundos y no cinco: tiene que durar más que lo
 * más largo que puede haber legítimamente en vuelo, y eso es una transacción
 * abandonada, que aguanta hasta `idle_in_transaction_session_timeout` (10 s).
 * Con cinco, un `sql.begin` lento se quedaría a medias por culpa de una lectura
 * ajena que se agotó. Comprobado en local: una consulta en vuelo sobrevive al
 * descarte y termina normal.
 *
 * Sin esperarlo porque el pool ya está desenganchado: nadie va a pedirle nada
 * nuevo, y a quien está esperando ahora mismo no le sirve de nada.
 */
export function descartarPool(motivo: string): void {
  const viejo = globalThis.__camSql;
  globalThis.__camSql = undefined;
  globalThis.__camSqlDesde = undefined;
  globalThis.__camSqlUltimoUso = undefined;
  if (!viejo) return;

  console.warn(
    `[db] se descarta el pool (${motivo}). La próxima consulta abrirá ` +
      'conexiones nuevas.',
  );
  void viejo.end({ timeout: GRACIA_AL_CERRAR_S }).catch(() => {});
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
