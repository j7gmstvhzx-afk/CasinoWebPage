/**
 * EL PLAZO DE UNA RUTA DE API, QUE ES EL QUE FALTABA.
 *
 * QUÉ PROTEGÍA A LAS ESCRITURAS HASTA AHORA, Y QUÉ NO
 * ---------------------------------------------------
 * Las lecturas de pantalla van por `intentar()`, que tiene su plazo y su
 * reintento. Las escrituras NO pueden ir por ahí —reintentar un guardado que
 * quizá sí llegó es cobrar dos veces o insertar la fila dos veces— así que
 * llaman a `sql` directo. Eso las dejaba con dos redes, las dos ajenas:
 *
 *   1. `statement_timeout` (7 s), que corre EN POSTGRES. Mata la consulta y
 *      devuelve un error de verdad. Funciona… mientras el saludo inicial de la
 *      conexión haya llegado y se haya aplicado.
 *   2. El techo de la función (15 s en Vercel). Cuando salta, la persona no ve
 *      un mensaje: ve la página de error de Vercel, y en el registro queda una
 *      función muerta sin explicación.
 *
 * El hueco es el caso que ya se vio en producción: una conexión que se abre y
 * no contesta. Ahí `statement_timeout` no llega a aplicarse —el saludo es
 * justo lo que no se completó— y la escritura se come los quince segundos
 * enteros para acabar en la pantalla fea.
 *
 * Esto cierra ese hueco: un plazo NUESTRO, más corto que el techo, que
 * responde en español y deja escrito qué se estaba haciendo.
 *
 * NO REINTENTA. NUNCA. Ésa es la diferencia entera con `intentar()`: cuando una
 * escritura no contesta, no se sabe si llegó o no, y volver a mandarla es
 * apostar. Se corta y se dice; repetir es decisión de la persona, que sí sabe
 * lo que quería hacer.
 *
 * TAMPOCO ATRAPA ERRORES. Un fallo de verdad —datos inválidos, una restricción
 * de la base— sigue subiendo como siempre. Aquí solo se mide el tiempo.
 */

/**
 * Lo que se le da a una ruta normal. Diez segundos.
 *
 * Entre los dos plazos que ya existen, y por ese orden a propósito:
 *
 *   - MAYOR que `statement_timeout` (7 s), para que la red de Postgres dispare
 *     PRIMERO. Así el caso normal —una consulta lenta— devuelve el error de
 *     verdad, con su código, y no un genérico "se pasó del tiempo" que no dice
 *     nada. Este plazo es para lo que aquélla no puede cubrir.
 *   - MENOR que el techo de la función (15 s), con cinco segundos de margen
 *     para que dé tiempo a redactar la respuesta y cerrar.
 *
 * `scripts/verificar-plazos.mjs` comprueba las dos cosas en cada build.
 */
export const LIMITE_ESCRITURA_MS = 10_000;

/**
 * El de las rutas que legítimamente tardan: la importación de la hoja de
 * jackpots escribe dieciocho máquinas dentro de una transacción. Esa ruta
 * declara `maxDuration = 60`, así que su plazo va acorde.
 */
export const LIMITE_ESCRITURA_LARGA_MS = 45_000;

/**
 * Envuelve el manejador de una ruta y le pone plazo.
 *
 *     export const POST = conPlazo('guardar la promoción', async (req) => { … });
 *
 * `que` se escribe como lo diría una persona —"guardar la promoción", "canjear
 * el cupón"— porque acaba en dos sitios que lee alguien: el registro y, si
 * hace falta, la pantalla.
 */
export function conPlazo<A extends unknown[]>(
  que: string,
  manejador: (...args: A) => Promise<Response>,
  limiteMs: number = LIMITE_ESCRITURA_MS,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    try {
      // EL `.catch` VACÍO NO ES CEREMONIA: SIN ÉL SE MUERE LA FUNCIÓN.
      //
      // Si el plazo gana la carrera, el trabajo de verdad sigue vivo y, cuando
      // Postgres lo mate, su promesa se romperá sin que nadie la espere. Node
      // trata un fallo sin dueño como fatal y se lleva el proceso ENTERO por
      // delante, a mitad de otras peticiones. Pasó en producción con las
      // lecturas (ver `intentar` en queries.ts) y aquí sería exactamente igual.
      const enMarcha = manejador(...args);
      enMarcha.catch(() => {});

      return await Promise.race([
        enMarcha,
        new Promise<Response>((resolver) => {
          temporizador = setTimeout(() => {
            console.error(
              `[ruta] "${que}" pasó de ${limiteMs} ms y se cortó. NO se reintenta: ` +
                'no se sabe si el guardado llegó a la base o no.',
            );
            resolver(
              Response.json(
                {
                  ok: false,
                  error:
                    `La base de datos está tardando demasiado y no pudimos ${que}. ` +
                    'Vuelve a intentarlo en un momento; si insistes, comprueba antes ' +
                    'si se guardó, porque puede que sí.',
                },
                // 504: el que no contestó a tiempo no fuimos nosotros, fue la
                // base. `Retry-After` para quien reintente automáticamente.
                { status: 504, headers: { 'retry-after': '5' } },
              ),
            );
          }, limiteMs);
        }),
      ]);
    } finally {
      // Sin esto el temporizador mantiene viva la función hasta que vence,
      // aunque la ruta haya contestado en cien milisegundos.
      clearTimeout(temporizador);
    }
  };
}
