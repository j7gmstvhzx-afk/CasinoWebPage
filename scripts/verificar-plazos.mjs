/**
 * Comprueba que los plazos de espera encajan unos dentro de otros.
 *
 * POR QUÉ ESTO ES UN SCRIPT Y NO UN COMENTARIO
 * --------------------------------------------
 * El fallo que costó semanas —"a veces sale la información y a veces no"— fue
 * exactamente esto: `connect_timeout` daba 10 s para abrir la conexión mientras
 * la página se rendía a los 2.5. A una conexión fría se le concedía cuatro
 * veces más tiempo del que nadie iba a esperar, así que era imposible que
 * llegara. Nadie lo vio porque los dos números viven en archivos distintos y
 * cada uno, por separado, parecía razonable.
 *
 * Un comentario no lo habría evitado: hay que poder COMPROBARLO. Este script
 * lee los números de verdad de los archivos y falla si dejan de encajar.
 *
 * LAS REGLAS
 * ----------
 * 1. Abrir la conexión tiene que caber en lo que espera un intento. Si no, un
 *    arranque en frío no puede terminar nunca.
 * 2. Todos los intentos juntos, con sus pausas, tienen que caber en el techo de
 *    la función de Vercel. Si no, el último intento muere cortado a mitad y se
 *    gasta el tiempo sin llegar a nada.
 * 3. El corte del lado del servidor tiene que ser MAYOR que el del cliente: es
 *    la red de seguridad que mata la consulta que ya abandonamos, no el primero
 *    en disparar.
 * 4. LAS MISMAS DOS REGLAS, OTRA VEZ, PARA EL BUILD. El build tiene sus propios
 *    plazos —mucho más largos— porque ahí la base está fría del todo y no hay
 *    nadie esperando. Faltaba comprobarlos y se notó: el primer despliegue con
 *    `exigir` se cayó en Vercel con "la consulta pasó de 6000 ms" mientras
 *    prerrenderizaba la portada, con un código que en local pasaba todas las
 *    comprobaciones. En local la base está en la misma máquina; el build de
 *    Vercel abre la conexión a Supabase desde cero. Los números del build no
 *    los vigilaba nadie, así que ahora se vigilan igual que los otros.
 */
import { readFileSync } from 'node:fs';

const leer = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const num = (txt, re, que) => {
  const m = re.exec(txt);
  if (!m) throw new Error(`No encontré ${que}`);
  return Number(m[1].replace(/_/g, ''));
};

const q = leer('src/lib/queries.ts');
const db = leer('src/lib/db.ts');
const pagina = leer('src/app/admin/(panel)/maquinas-nuevas/page.tsx');

const v = {
  publico:   num(q,  /LIMITE_CONSULTA_MS = ([\d_]+)/, 'LIMITE_CONSULTA_MS'),
  panel:     num(q,  /LIMITE_PANEL_MS = ([\d_]+)/, 'LIMITE_PANEL_MS'),
  intentos:  num(q,  /const INTENTOS = (\d+)/, 'INTENTOS'),
  pausa:     num(q,  /const PAUSA_MS = ([\d_]+)/, 'PAUSA_MS'),
  conectar:  num(db, /connect_timeout: enBuild \? \d+ : (\d+)/, 'connect_timeout') * 1000,
  sentencia: num(db, /statement_timeout: enBuild \? [\d_]+ : ([\d_]+)/, 'statement_timeout'),
  techo:     num(pagina, /maxDuration = (\d+)/, 'maxDuration') * 1000,

  // Los del build.
  build:          num(q,  /LIMITE_BUILD_MS = ([\d_]+)/, 'LIMITE_BUILD_MS'),
  intentosBuild:  num(q,  /INTENTOS_BUILD = (\d+)/, 'INTENTOS_BUILD'),
  conectarBuild:  num(db, /connect_timeout: enBuild \? (\d+)/, 'connect_timeout del build') * 1000,
  sentenciaBuild: num(db, /statement_timeout: enBuild \? ([\d_]+)/, 'statement_timeout del build'),
};

const reglas = [
  ['abrir la conexión cabe en un intento público', v.conectar < v.publico],
  ['abrir la conexión cabe en un intento del panel', v.conectar < v.panel],
  ['los intentos públicos caben en el techo',
   v.intentos * v.publico + (v.intentos - 1) * v.pausa < v.techo],
  ['los intentos del panel caben en el techo',
   v.intentos * v.panel + (v.intentos - 1) * v.pausa < v.techo],
  ['el corte del servidor es mayor que el del cliente', v.sentencia > v.panel],

  // El build. Sin techo que respetar —no es una función de Vercel—, pero las
  // dos reglas de encaje valen igual.
  ['en el build, abrir la conexión cabe en un intento', v.conectarBuild < v.build],
  ['en el build, el corte del servidor es mayor que el del cliente',
   v.sentenciaBuild > v.build],
  ['el build espera más que una petición, no menos',
   v.build > v.publico && v.conectarBuild > v.conectar && v.intentosBuild >= v.intentos],
];

console.log('Plazos:', Object.entries(v).map(([k, n]) => `${k}=${n}ms`).join('  '));
let mal = 0;
for (const [texto, ok] of reglas) {
  console.log(`  ${ok ? 'OK  ' : 'MAL '} ${texto}`);
  if (!ok) mal++;
}
if (mal) {
  console.error(`\n${mal} regla(s) rotas. Los plazos ya no encajan: revisa src/lib/db.ts y src/lib/queries.ts.`);
  process.exit(1);
}
console.log('\nTodos los plazos encajan.');
