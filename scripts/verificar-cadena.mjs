#!/usr/bin/env node
/**
 * ¿ARREGLA LA DIRECCIÓN DE LA BASE LO QUE TIENE QUE ARREGLAR, Y NADA MÁS?
 *
 * POR QUÉ EXISTE
 * --------------
 * `normalizarCadena` toca la única cadena de la que depende TODO el sitio, y la
 * toca a ciegas: nadie la ve nunca —lleva la contraseña dentro— y si se
 * estropea, el síntoma no es un error claro sino nueve pestañas en blanco. Ya
 * pasó una vez por un puerto (modo sesión, techo de 15 clientes) y otra por un
 * usuario sin el sufijo del proyecto, que además se presenta como
 * "password authentication failed" y manda a cambiar contraseñas buenas.
 *
 * Lo que de verdad da miedo no es que corrija de menos: es que corrija de más.
 * Media prueba de aquí abajo comprueba QUÉ NO SE TOCA — la conexión directa,
 * la de casa, la que ya viene bien— y que la contraseña sale igual que entró.
 *
 * CÓMO SE USA
 *
 *     node scripts/verificar-cadena.mjs
 *
 * No toca la base ni levanta nada: es lógica pura. Corre en cada build.
 */

const { normalizarCadena } = await import('../src/lib/db.ts');

const REF = 'huapsylwprxycbelhfeq';
const POOLER = 'aws-0-us-east-1.pooler.supabase.com';
/** Contraseña de mentira. Aquí nunca va una de verdad. */
const CLAVE = 'clave-de-mentira';

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? '  ok  ' : 'FALLA '} ${que}${detalle ? `\n         ${detalle}` : ''}`);
};

/** Corre `normalizarCadena` con un entorno controlado y lo deja como estaba. */
function con(entorno, cadena) {
  const antes = { ...process.env };
  Object.assign(process.env, entorno);
  for (const k of ['SUPABASE_URL', 'CAM_POOLER_TRANSACCION']) {
    if (!(k in entorno)) delete process.env[k];
  }
  try {
    return normalizarCadena(cadena);
  } finally {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, antes);
  }
}

const conRef = { SUPABASE_URL: `https://${REF}.supabase.co` };
const usuario = `postgres.${REF}`;

// --- El puerto: por defecto NO se toca -------------------------------------
//
// Se probó en producción cambiarlo al 6543 y el sitio se cayó entero: la
// conexión se abre y no contesta. El detalle está en `aTransacción` en db.ts.
// Lo que se comprueba aquí es que ese cambio está APAGADO y que el interruptor
// sigue funcionando, para poder volver a probarlo sin tocar código.
{
  const entrada = `postgresql://${usuario}:${CLAVE}@${POOLER}:5432/postgres`;
  comprobar(con(conRef, entrada) === entrada, 'el puerto del pooler NO se cambia por su cuenta');

  const salida = con({ ...conRef, CAM_POOLER_TRANSACCION: 'si' }, entrada);
  const u = new URL(salida);
  comprobar(u.port === '6543', 'con CAM_POOLER_TRANSACCION=si sí pasa al 6543', salida.replace(CLAVE, '···'));
  comprobar(u.password === CLAVE, 'y la contraseña sale exactamente igual que entró');
  comprobar(decodeURIComponent(u.username) === usuario, 'y el usuario no se toca');
  comprobar(u.hostname === POOLER && u.pathname === '/postgres', 'y el servidor y la base tampoco');
}

// --- Lo que SÍ se corrige siempre: el usuario sin el sufijo del proyecto ----
{
  const salida = con(conRef, `postgresql://postgres:${CLAVE}@${POOLER}:5432/postgres`);
  const u = new URL(salida);
  comprobar(
    decodeURIComponent(u.username) === usuario && u.port === '5432',
    'el usuario "postgres" se completa con el proyecto, y el puerto se deja',
  );
}
{
  // Una contraseña con caracteres codificados tiene que sobrevivir al viaje.
  // Si `toString()` los tocara, el error que saldría es "password
  // authentication failed" — el mensaje que manda a cambiar la contraseña
  // buena.
  const rara = 'a%40b%3Ac';
  const salida = con(
    { ...conRef, CAM_POOLER_TRANSACCION: 'si' },
    `postgresql://${usuario}:${rara}@${POOLER}:5432/postgres`,
  );
  comprobar(new URL(salida).password === rara, 'una contraseña con símbolos codificados sale intacta');
}

// --- Lo que NO se toca -----------------------------------------------------
const intactas = [
  [
    `postgresql://${usuario}:${CLAVE}@${POOLER}:6543/postgres`,
    'la que ya viene en modo transacción se devuelve TAL CUAL, sin reescribir',
  ],
  [
    `postgresql://postgres:${CLAVE}@db.${REF}.supabase.co:5432/postgres`,
    'la conexión DIRECTA no se toca: ahí el 5432 es el puerto de verdad',
  ],
  [
    'postgresql://postgres@localhost:5433/cam',
    'la base local de pruebas no se toca',
  ],
  ['esto no es una url', 'una cadena rota se devuelve igual, para que falle con su propio error'],
];
for (const [entrada, porque] of intactas) {
  const salida = con(conRef, entrada);
  comprobar(salida === entrada, porque, salida === entrada ? '' : `salió ${salida.replace(CLAVE, '···')}`);
}

// --- Sin SUPABASE_URL ------------------------------------------------------
{
  // No se puede deducir el proyecto, así que el usuario se queda como está y se
  // avisa por el registro. Lo que NO puede pasar es que se estropee la cadena.
  const entrada = `postgresql://postgres:${CLAVE}@${POOLER}:5432/postgres`;
  comprobar(con({}, entrada) === entrada, 'sin SUPABASE_URL la cadena se devuelve intacta');
}
{
  // El interruptor del puerto no depende de SUPABASE_URL: son dos arreglos
  // independientes y uno no puede llevarse al otro por delante.
  const salida = con({ CAM_POOLER_TRANSACCION: 'si' }, `postgresql://postgres:${CLAVE}@${POOLER}:5432/postgres`);
  const u = new URL(salida);
  comprobar(
    u.port === '6543' && decodeURIComponent(u.username) === 'postgres',
    'y aun así el interruptor del puerto sigue funcionando solo',
  );
}

console.log(`\n14 comprobaciones, ${fallos} ${fallos === 1 ? 'fallo' : 'fallos'}.`);
process.exit(fallos === 0 ? 0 : 1);
