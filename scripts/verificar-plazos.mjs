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
 * 4. LAS MISMAS REGLAS, OTRA VEZ, PARA EL BUILD — INCLUIDO SU TECHO. El build
 *    tiene sus propios plazos y su propio techo, que es DISTINTO y que yo no
 *    sabía que existía: Next mata cualquier página que tarde más de 60 s en
 *    generarse (`staticPageGenerationTimeout`, por defecto 60, en
 *    node_modules/next/dist/server/config.js).
 *
 *    Por no saberlo rompí dos despliegues seguidos: puse tres intentos de 30 s
 *    —94 s— creyendo que en un build se podía esperar lo que hiciera falta, y
 *    la página moría a los 60 s sin llegar a su respaldo. La regla 2 existía
 *    exactamente para esto y yo la había desactivado para el build, con el
 *    comentario "sin techo que respetar". Techo hay siempre; lo que cambia es
 *    cuál.
 * 5. EL RELOJ TIENE QUE DECIDIR ANTES QUE EL TEMPORIZADOR. Un pool que lleva
 *    rato quieto se descarta mirando el reloj (`MAX_REPOSO_MS`), no esperando a
 *    que lo cierre `idle_timeout`: en Vercel la función se congela entre
 *    peticiones y sus temporizadores no corren, así que el que cierra por
 *    tiempo solo funciona cuando no hace falta. Si `idle_timeout` fuera el más
 *    corto de los dos, la protección sería de mentira.
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
const config = leer('next.config.ts');

// El techo del build sale de next.config.ts si está puesto a mano; si no, del
// valor por defecto de Next, que es 60 s.
const techoBuild =
  (/staticPageGenerationTimeout:\s*(\d+)/.exec(config)?.[1] ?? 60) * 1000;

const v = {
  publico:   num(q,  /LIMITE_CONSULTA_MS = ([\d_]+)/, 'LIMITE_CONSULTA_MS'),
  panel:     num(q,  /LIMITE_PANEL_MS = ([\d_]+)/, 'LIMITE_PANEL_MS'),
  intentos:  num(q,  /const INTENTOS = (\d+)/, 'INTENTOS'),
  pausa:     num(q,  /const PAUSA_MS = ([\d_]+)/, 'PAUSA_MS'),
  conectar:  num(db, /connect_timeout: enBuild \? \d+ : (\d+)/, 'connect_timeout') * 1000,
  reposo:    num(db, /MAX_REPOSO_MS = ([\d_]+)/, 'MAX_REPOSO_MS'),
  ocioso:    num(db, /idle_timeout: ([\d_]+)/, 'idle_timeout') * 1000,
  gracia:    num(db, /GRACIA_AL_CERRAR_S = ([\d_]+)/, 'GRACIA_AL_CERRAR_S') * 1000,
  enTx:      num(db, /idle_in_transaction_session_timeout: ([\d_]+)/, 'idle_in_transaction_session_timeout'),
  sentencia: num(db, /statement_timeout: enBuild \? [\d_]+ : ([\d_]+)/, 'statement_timeout'),
  techo:     num(pagina, /maxDuration = (\d+)/, 'maxDuration') * 1000,

  // Los del build.
  build:          num(q,  /LIMITE_BUILD_MS = ([\d_]+)/, 'LIMITE_BUILD_MS'),
  intentosBuild:  num(q,  /INTENTOS_BUILD = (\d+)/, 'INTENTOS_BUILD'),
  pausaBuild:     num(q,  /PAUSA_BUILD_MS = ([\d_]+)/, 'PAUSA_BUILD_MS'),
  techoBuild:     Number(techoBuild),
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
  // OJO: desde que estos dos plazos NO se mandan por el pooler (ver
  // `plazosDelServidor` en src/lib/db.ts, es un experimento en curso), esta
  // regla y la de la gracia cubren la conexión DIRECTA y la local, no la de
  // producción. Se quedan porque los números tienen que seguir encajando el día
  // que se devuelvan, pero no hay que leerlas como "en producción esto pasa".
  ['el corte del servidor es mayor que el del cliente (conexión directa)',
   v.sentencia > v.panel],

  // El reloj tiene que decidir ANTES que el temporizador, porque en una función
  // congelada el temporizador puede no llegar a correr nunca. Ver MAX_REPOSO_MS
  // en src/lib/db.ts: si `idle_timeout` fuera el más corto, quien cierra las
  // conexiones sería un temporizador que solo funciona cuando no hace falta.
  ['el reloj descarta el pool antes de que lo cierre el temporizador',
   v.reposo < v.ocioso],
  // Descartar el pool obliga a volver a abrir conexión en la siguiente
  // consulta: ese saludo tiene que caber en lo que espera la página (regla 1).
  ['volver a abrir tras el descarte cabe en un intento', v.conectar < v.publico],
  // Descartar un pool no puede cortar una escritura que iba bien: la gracia al
  // cerrarlo tiene que durar más que lo más largo que puede haber en vuelo.
  ['la gracia al cerrar aguanta una transacción entera (conexión directa)',
   v.gracia > v.enTx && v.gracia > v.sentencia],

  // El build, con su techo propio: Next mata la página a los 60 s.
  ['en el build, abrir la conexión cabe en un intento', v.conectarBuild < v.build],
  ['los intentos del build caben en el techo de Next por página',
   v.intentosBuild * v.build + (v.intentosBuild - 1) * v.pausaBuild < v.techoBuild],
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
