/**
 * Prueba de humo: el visitante puede cerrar el modal y usar el menú.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * Esto llegó a producción: el botón de cerrar del modal quedaba por debajo del
 * contenido del propio modal, y el navegador entregaba el clic al texto de la
 * promoción en vez de a la X. Como el modal se abre solo a los 2.2 s de entrar,
 * el visitante quedaba atrapado — ni cerraba ni podía tocar ninguna pestaña.
 * El dueño lo reportó como "toco todos los tabs y ninguno funciona".
 *
 * No lo detectaron ni TypeScript, ni el linter, ni las pruebas de navegador que
 * había: aquellas manejaban el modal por sus propios botones y nunca intentaron
 * cerrarlo ni navegar. Un elemento tapado por otro solo se ve pulsando de
 * verdad, en el sitio de la pantalla donde la persona pone el dedo.
 *
 * Por eso aquí no se comprueba que los elementos existan, sino que el clic
 * LLEGA: se pregunta al navegador qué elemento hay en ese punto exacto.
 *
 * Uso:  npm run dev   (en otra terminal)
 *       node scripts/smoke-nav.mjs [url]
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3000';
// Sin CHROMIUM_PATH se usa el Chromium que instala Playwright. Antes había una
// ruta de Linux fija aquí y la prueba no arrancaba fuera de aquel sandbox.
const CHROMIUM = process.env.CHROMIUM_PATH;
// Los nombres tienen que cuadrar con NAV en src/lib/site.ts. Cuando la pestaña
// del menú pasó a llamarse "Comida", esta prueba falló — que es justo lo que
// tenía que hacer.
const PESTANAS = ['Jackpots', 'Máquinas Nuevas', 'Eventos', 'Galería', 'Ganadores', 'Comida', 'Contacto', 'Mi cuenta'];

let fallos = 0;
const comprobar = (ok, texto) => {
  console.log(`  ${ok ? '✓' : '✗'} ${texto}`);
  if (!ok) fallos++;
};

/** ¿Un clic en el centro de este elemento le llega de verdad, o lo intercepta otro? */
async function recibeElClic(locator) {
  const caja = await locator.boundingBox();
  if (!caja) return false;
  return locator.evaluate(
    (el, [x, y]) => {
      const encima = document.elementFromPoint(x, y);
      return Boolean(encima) && (el === encima || el.contains(encima));
    },
    [caja.x + caja.width / 2, caja.y + caja.height / 2],
  );
}

const navegador = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});

for (const [nombre, ancho, alto] of [
  ['celular', 390, 844],
  ['escritorio', 1440, 900],
]) {
  console.log(`\n=== ${nombre} (${ancho}px) ===`);
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto } });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text()));

  await p.goto(BASE + '/', { waitUntil: 'networkidle' });

  // El modal se abre solo. Se espera a que aparezca en vez de dormir un rato
  // fijo: con un sleep, la prueba pasaría por no haberlo visto nunca.
  const dialogo = p.getByRole('dialog');
  await dialogo.waitFor({ state: 'visible', timeout: 15000 });
  comprobar(true, 'el modal de la promoción se abre solo');

  const cerrar = p.getByRole('button', { name: 'Cerrar' });
  const caja = await cerrar.boundingBox();
  comprobar(
    Boolean(caja) && caja.y >= 0 && caja.y + caja.height <= alto,
    'la X se ve sin hacer scroll',
  );
  comprobar(await recibeElClic(cerrar), 'el clic en la X le llega a la X y no a otro elemento');

  // El clic va en try: si el modal es incerrable —  el fallo que ya llegó a
  // producción una vez —  la prueba tiene que SEGUIR y reportar también las
  // pestañas bloqueadas, no morirse en la primera excepción y ocultar el resto.
  try {
    await cerrar.click({ timeout: 5000 });
  } catch {
    /* se reporta abajo */
  }
  await p.waitForTimeout(400);
  comprobar((await p.getByRole('dialog').count()) === 0, 'el modal se cierra');

  // En celular el menú vive detrás del botón de hamburguesa.
  if (ancho < 1024) {
    await p.getByRole('button', { name: 'Abrir menú' }).click({ timeout: 4000 }).catch(() => {});
    await p.waitForTimeout(300);
  }

  for (const t of PESTANAS) {
    const antes = p.url();
    const enlace = p
      .getByRole('navigation')
      .getByRole('link', { name: t, exact: true })
      .first();
    try {
      await enlace.click({ timeout: 4000 });
      await p.waitForTimeout(600);
      comprobar(p.url() !== antes, `la pestaña ${t} navega`);
    } catch {
      comprobar(false, `la pestaña ${t} navega (el clic quedó bloqueado)`);
    }
    if (ancho < 1024) {
      await p.getByRole('button', { name: 'Abrir menú' }).click().catch(() => {});
      await p.waitForTimeout(250);
    }
  }

  comprobar(errores.length === 0, `sin errores de consola${errores.length ? ': ' + errores[0] : ''}`);
  await ctx.close();
}

await navegador.close();
console.log(fallos === 0 ? '\nTODO PASÓ ✓' : `\n${fallos} COMPROBACIONES FALLARON ✗`);
process.exit(fallos === 0 ? 0 : 1);
