/**
 * Prueba de humo de la cuenta y del sorteo.
 *
 * POR QUÉ EXISTE
 * --------------
 * El dueño reportó que "la pantalla de crear cuenta debe poder crear una
 * cuenta". Crear la cuenta es lo que identifica a la persona en el sorteo: sin
 * eso no hay forma de saber quién participó ni de entregar un premio. Esa ruta
 * no tenía ninguna prueba automática — smoke-nav.mjs comprueba que se pueda
 * navegar, no que la cuenta llegue a la base.
 *
 * Aquí se recorre el camino completo con un navegador de verdad:
 *   crear cuenta → ver "no has participado" → tirar → ver "ya participaste"
 *   → intentar tirar otra vez → salir → volver a entrar
 *
 * Uso:  npm run build && npm start   (en otra terminal, contra una base local)
 *       node scripts/smoke-cuenta.mjs [url]
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3000';
// 555-01XX está reservado para ficción y el validador lo rechaza a propósito,
// así que un número "de prueba" de los de toda la vida no sirve aquí.
const CELULAR = process.env.CELULAR_PRUEBA ?? '7872360147';
// Igual que en smoke-nav.mjs. Las dos pruebas de humo se lanzan juntas y no
// tenía sentido que una aceptara CHROMIUM_PATH y la otra no: en cualquier
// entorno donde el Chromium no esté donde Playwright lo busca por defecto —el
// contenedor de CI, sin ir más lejos— esta se caía antes de la primera
// comprobación con un error de "Executable doesn't exist".
const CHROMIUM = process.env.CHROMIUM_PATH;
const NOMBRE = 'Prueba Automatica';
// La cuenta ahora lleva contraseña. No se saca de una variable de entorno a
// propósito: esto crea cuentas desechables en bases de prueba, y una constante
// a la vista deja claro que no es un secreto de nadie.
const CLAVE = 'prueba-automatica-9';

let fallos = 0;
const comprobar = (ok, texto) => {
  console.log(`  ${ok ? '✓' : '✗'} ${texto}`);
  if (!ok) fallos++;
};

/**
 * ¿Un clic en el centro de este elemento le llega de verdad, o lo intercepta otro?
 *
 * Se sube a la vista primero: `elementFromPoint` solo ve la ventana, así que un
 * botón perfectamente clicable que esté por debajo del pliegue devolvería null
 * y parecería un elemento tapado.
 */
async function recibeElClic(locator) {
  await locator.scrollIntoViewIfNeeded();
  const caja = await locator.boundingBox();
  if (!caja) return false;
  return locator.evaluate((el, c) => {
    const x = c.x + c.width / 2;
    const y = c.y + c.height / 2;
    const enElPunto = document.elementFromPoint(x, y);
    return el === enElPunto || el.contains(enElPunto);
  }, caja);
}

async function main() {
  const navegador = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  const contexto = await navegador.newContext();
  const pagina = await contexto.newPage();

  const erroresConsola = [];
  pagina.on('console', (m) => {
    if (m.type() !== 'error') return;
    // El navegador apunta como error de consola CUALQUIER respuesta 4xx, y esta
    // prueba provoca una a propósito: el intento con la contraseña mala. Se
    // descarta por su URL, no por el texto del mensaje, que no dice cuál fue.
    if ((m.location()?.url ?? '').includes('/api/entrar')) return;
    erroresConsola.push(m.text());
  });

  console.log(`\n▶ Crear cuenta en ${BASE}/cuenta`);
  await pagina.goto(`${BASE}/cuenta`, { waitUntil: 'networkidle' });

  const boton = pagina.getByRole('button', { name: 'CREAR MI CUENTA' });
  await boton.waitFor();
  comprobar(await recibeElClic(boton), 'el botón de crear cuenta recibe el clic');

  await pagina.getByLabel('Nombre completo').fill(NOMBRE);
  await pagina.getByLabel('Celular').fill(CELULAR);
  await pagina.getByLabel('Pueblo').selectOption({ label: 'Manatí' });
  await pagina.getByLabel('Contraseña').fill(CLAVE);
  await pagina.getByRole('checkbox').check();
  await boton.click();

  await pagina.waitForSelector('text=/Todavía no has participado hoy|Ya participaste hoy/', {
    timeout: 10_000,
  });
  comprobar(true, 'la cuenta se creó y la pantalla pasa al resumen');
  comprobar(
    await pagina.getByText('Todavía no has participado hoy').isVisible(),
    'una cuenta nueva sale como que no ha participado',
  );

  console.log('\n▶ La tirada del día');
  await pagina.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  // Antes de la máquina hay que pasar el arte de las promociones del día.
  //
  // Esto faltaba, y la prueba pasaba igual: en la base que se usaba no había
  // ninguna promoción marcada para el pop-up, así que la máquina salía
  // directa. Con promociones cargadas —  o sea, en producción —  se quedaba
  // esperando un botón que estaba tres pantallas más allá. Una prueba que solo
  // pasa con la base vacía no está probando el camino de la gente.
  for (let i = 0; i < 6; i++) {
    const siguiente = pagina
      .getByRole('button', { name: /SIGUIENTE|IR A LA TRAGAMONEDAS/i })
      .first();
    if (!(await siguiente.count())) break;
    await siguiente.click();
    await pagina.waitForTimeout(350);
  }

  const girar = pagina.getByRole('button', { name: /GIRAR|TIRAR/i }).first();
  await girar.waitFor({ timeout: 10_000 });
  comprobar(await recibeElClic(girar), 'el botón de girar recibe el clic');
  await girar.click();

  await pagina.waitForSelector('text=/GANASTE|Casi|Ya tiraste hoy/', { timeout: 25_000 });
  comprobar(true, 'la tirada devuelve un resultado');

  console.log('\n▶ El reset es una vez al día');
  await pagina.goto(`${BASE}/cuenta`, { waitUntil: 'networkidle' });
  await pagina.waitForSelector('text=Ya participaste hoy', { timeout: 10_000 });
  comprobar(true, 'después de tirar, la cuenta dice que ya participó');

  const proxima = await pagina.getByText(/Próxima tirada en/).isVisible();
  comprobar(proxima, 'se muestra cuánto falta para la próxima tirada');

  const segunda = await pagina.evaluate(async () => {
    const r = await fetch('/api/spin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return r.json();
  });
  comprobar(
    segunda.alreadySpunToday === true,
    'una segunda tirada el mismo día se rechaza (alreadySpunToday)',
  );
  comprobar(
    typeof segunda.proximaTirada === 'string' && segunda.proximaTirada.length > 0,
    'el servidor dice cuándo vuelve a haber tirada',
  );

  console.log('\n▶ Salir y volver a entrar');
  await pagina.getByRole('button', { name: /Salir/i }).click();
  await pagina.waitForSelector('text=Crea tu cuenta', { timeout: 10_000 });
  comprobar(true, 'al salir vuelve el formulario de registro');

  await pagina.getByRole('button', { name: /Ya te registraste/i }).click();
  await pagina.getByLabel('Celular').fill(CELULAR);
  await pagina.getByLabel('Contraseña').fill(CLAVE);
  await pagina.getByRole('button', { name: 'ENTRAR' }).click();
  await pagina.waitForSelector('text=Ya participaste hoy', { timeout: 10_000 });
  comprobar(true, 'entrar con celular y contraseña recupera la misma cuenta');

  // Y con la contraseña MALA no entra. Sin esta comprobación, la prueba de
  // humo pasaría igual si el servidor dejara de mirar la contraseña.
  await pagina.getByRole('button', { name: /Salir/i }).click().catch(() => {});
  await pagina.waitForSelector('text=Crea tu cuenta', { timeout: 10_000 });
  await pagina.getByRole('button', { name: /Ya te registraste/i }).click();
  await pagina.getByLabel('Celular').fill(CELULAR);
  await pagina.getByLabel('Contraseña').fill(CLAVE + 'x');
  await pagina.getByRole('button', { name: 'ENTRAR' }).click();
  const rechazo = await pagina
    .waitForSelector('text=/No encontramos esa combinaci/', { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  comprobar(rechazo, 'con la contraseña mala NO entra');

  comprobar(erroresConsola.length === 0, `sin errores de consola (${erroresConsola.length})`);
  if (erroresConsola.length) erroresConsola.slice(0, 5).forEach((e) => console.log(`      ${e}`));

  await navegador.close();
  console.log(fallos === 0 ? '\n✓ todo bien\n' : `\n✗ ${fallos} fallo(s)\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n✗ la prueba reventó:', e.message);
  process.exit(1);
});
