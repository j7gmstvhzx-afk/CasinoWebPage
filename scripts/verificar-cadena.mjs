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
  for (const k of ['SUPABASE_URL', 'CAM_POOLER_SESION']) {
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

// --- Lo que SÍ se corrige --------------------------------------------------
{
  const salida = con(conRef, `postgresql://${usuario}:${CLAVE}@${POOLER}:5432/postgres`);
  const u = new URL(salida);
  comprobar(u.port === '6543', 'el modo sesión (5432) pasa a modo transacción (6543)', salida.replace(CLAVE, '···'));
  comprobar(u.password === CLAVE, 'y la contraseña sale exactamente igual que entró');
  comprobar(decodeURIComponent(u.username) === usuario, 'y el usuario no se toca');
  comprobar(u.hostname === POOLER && u.pathname === '/postgres', 'y el servidor y la base tampoco');
}
{
  const salida = con(conRef, `postgresql://postgres:${CLAVE}@${POOLER}:5432/postgres`);
  const u = new URL(salida);
  comprobar(
    u.port === '6543' && decodeURIComponent(u.username) === usuario,
    'las dos cosas a la vez: puerto y usuario sin sufijo',
  );
}
{
  // Una contraseña con caracteres codificados tiene que sobrevivir al viaje.
  // Si `toString()` los tocara, el error que saldría es "password
  // authentication failed" — el mensaje que manda a cambiar la contraseña
  // buena.
  const rara = 'a%40b%3Ac';
  const salida = con(conRef, `postgresql://${usuario}:${rara}@${POOLER}:5432/postgres`);
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

// --- La puerta de atrás ----------------------------------------------------
{
  const entrada = `postgresql://${usuario}:${CLAVE}@${POOLER}:5432/postgres`;
  const salida = con({ ...conRef, CAM_POOLER_SESION: 'si' }, entrada);
  comprobar(salida === entrada, 'con CAM_POOLER_SESION=si el puerto se deja como venga');
}
{
  // Sin SUPABASE_URL no se puede deducir el proyecto, así que el usuario se
  // queda como está (y se avisa) — pero el puerto sí se arregla igual.
  const salida = con({}, `postgresql://postgres:${CLAVE}@${POOLER}:5432/postgres`);
  comprobar(
    new URL(salida).port === '6543' && decodeURIComponent(new URL(salida).username) === 'postgres',
    'sin SUPABASE_URL se arregla el puerto aunque no se pueda arreglar el usuario',
  );
}

console.log(`\n13 comprobaciones, ${fallos} ${fallos === 1 ? 'fallo' : 'fallos'}.`);
process.exit(fallos === 0 ? 0 : 1);
