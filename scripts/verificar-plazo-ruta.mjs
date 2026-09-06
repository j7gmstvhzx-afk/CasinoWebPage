#!/usr/bin/env node
/**
 * ¿CORTA DE VERDAD UNA ESCRITURA QUE NO CONTESTA, Y NO ESTORBA A LAS DEMÁS?
 *
 * POR QUÉ EXISTE
 * --------------
 * `conPlazo` envuelve TODAS las rutas que escriben en la base. Si se rompe, se
 * rompe de una de estas dos maneras y ninguna se ve mirando el código:
 *
 *   - De más: corta o cambia respuestas buenas, y entonces guardar deja de
 *     funcionar en todo el panel a la vez.
 *   - De menos: no corta nada, y volvemos a los quince segundos de espera y la
 *     página de error de Vercel, que es justo el hueco que vino a tapar.
 *
 * Y hay una tercera, peor que las dos, porque no da la cara: si la promesa
 * abandonada se queda sin dueño, Node mata la función ENTERA a mitad de otras
 * peticiones. Eso ya pasó en producción con las lecturas.
 *
 * CÓMO SE USA
 *
 *     node scripts/verificar-plazo-ruta.mjs
 *
 * No toca la base ni levanta el servidor: son manejadores de mentira. Por eso
 * puede correr en cada build sin costar tiempo.
 */

const { conPlazo, LIMITE_ESCRITURA_MS, LIMITE_ESCRITURA_LARGA_MS } = await import(
  '../src/lib/plazo-ruta.ts'
);

/** Plazo corto para que la prueba dure décimas y no diez segundos. */
const CORTO = 150;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? '  ok  ' : 'FALLA '} ${que}${detalle ? `\n         ${detalle}` : ''}`);
};

// Se silencia el registro de la ruta: la prueba provoca cortes a propósito y
// esas líneas son ruido aquí. Lo que sí se comprueba es que se escribieron.
const registrado = [];
const errorReal = console.error;
console.error = (...a) => registrado.push(a.join(' '));

// --- Lo normal: la ruta contesta y no se nota que hay plazo ---------------
{
  const ruta = conPlazo('guardar', async () => Response.json({ ok: true, id: 7 }), CORTO);
  const t = Date.now();
  const r = await ruta();
  const cuerpo = await r.json();
  comprobar(r.status === 200 && cuerpo.id === 7, 'una ruta que contesta pasa igual, con su cuerpo');
  comprobar(Date.now() - t < CORTO, 'y no espera al plazo para devolverla', `${Date.now() - t} ms`);
}

// --- Los argumentos llegan enteros ----------------------------------------
{
  const ruta = conPlazo('leer', async (req, ctx) => Response.json({ url: req.url, id: ctx.id }), CORTO);
  const cuerpo = await (await ruta({ url: '/api/x' }, { id: 'abc' })).json();
  comprobar(cuerpo.url === '/api/x' && cuerpo.id === 'abc', 'los argumentos de la ruta llegan intactos');
}

// --- Lo que vino a arreglar: la que no contesta ----------------------------
{
  const ruta = conPlazo('guardar la promoción', () => new Promise(() => {}), CORTO);
  const t = Date.now();
  const r = await ruta();
  const tardo = Date.now() - t;
  const cuerpo = await r.json();

  comprobar(r.status === 504, 'la que no contesta se corta con 504', `salió ${r.status}`);
  comprobar(tardo >= CORTO && tardo < CORTO * 4, 'y se corta cuando toca, ni antes ni mucho después', `${tardo} ms`);
  comprobar(cuerpo.ok === false, 'el cuerpo dice que NO salió bien');
  comprobar(
    typeof cuerpo.error === 'string' && cuerpo.error.includes('guardar la promoción'),
    'el mensaje dice en español qué se estaba haciendo',
    cuerpo.error,
  );
  comprobar(
    /puede que sí/i.test(cuerpo.error),
    'y avisa de que el guardado PUDO llegar: repetir a ciegas es apostar',
  );
  comprobar(r.headers.get('retry-after') === '5', 'lleva Retry-After para quien reintente solo');
  comprobar(
    registrado.some((l) => l.includes('guardar la promoción') && l.includes('NO se reintenta')),
    'y queda escrito en el registro, diciendo que no se reintenta',
  );
}

// --- Un error de verdad NO se disfraza de plazo ----------------------------
{
  const ruta = conPlazo('guardar', async () => {
    throw new Error('violación de restricción');
  }, CORTO);
  let subio = null;
  await ruta().catch((e) => (subio = e));
  comprobar(
    subio instanceof Error && subio.message === 'violación de restricción',
    'un error de verdad sigue subiendo tal cual, no se convierte en un 504',
  );
}

// --- La promesa abandonada tiene dueño ------------------------------------
//
// Si no lo tuviera, este proceso se moriría al romperse: Node trata un fallo
// sin dueño como fatal. Que el guion llegue vivo al final ES la comprobación.
{
  let romper;
  const ruta = conPlazo('tardar', () => new Promise((_, r) => (romper = r)), CORTO);
  await ruta();
  romper(new Error('la base la mató después, cuando ya no la esperaba nadie'));
  await new Promise((r) => setTimeout(r, 60));
  comprobar(true, 'el trabajo abandonado que falla después no mata la función');
}

// --- Los dos presupuestos declarados --------------------------------------
comprobar(
  LIMITE_ESCRITURA_MS === 10_000 && LIMITE_ESCRITURA_LARGA_MS === 45_000,
  'los plazos declarados son los que dice la documentación',
  `${LIMITE_ESCRITURA_MS} ms y ${LIMITE_ESCRITURA_LARGA_MS} ms`,
);

console.error = errorReal;
console.log(`\n12 comprobaciones, ${fallos} ${fallos === 1 ? 'fallo' : 'fallos'}.`);
process.exit(fallos === 0 ? 0 : 1);
