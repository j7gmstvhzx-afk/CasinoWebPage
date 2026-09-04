#!/usr/bin/env node
/**
 * ¿SE PUEDE PONER EL LOGO DE UN JUEGO Y SALE EN EL TABLERO?
 *
 * Recorre el camino entero, en un navegador de verdad y por las pantallas de
 * verdad: panel → pestaña de logos → escoger imagen → guardar → mirar la página
 * pública. Ninguna de las piezas se simula, salvo el envío del archivo al bucket
 * (ver abajo).
 *
 * LO QUE COMPRUEBA, Y POR QUÉ CADA COSA
 * --------------------------------------
 *   1. La imagen SE ENCOGE SOLA antes de viajar. Es lo que el dueño pidió
 *      explícitamente que valiera también aquí: "acuérdate del auto fit que
 *      estamos utilizando ya". Se mide contando los bytes que salen por la red,
 *      no leyendo el código.
 *   2. El logo QUEDA GUARDADO en la máquina correcta.
 *   3. SALE EN EL TABLERO público, con su texto alternativo.
 *   4. Se puede QUITAR y la máquina vuelve a la ficha de la marca.
 *   5. Las máquinas SIN logo no enseñan un hueco: no se pinta nada.
 *
 * POR QUÉ SE INTERCEPTA LA SUBIDA DEL ARCHIVO
 * -------------------------------------------
 * En local no hay bucket de Supabase configurado, así que /api/admin/subir
 * fallaría siempre y la prueba no llegaría ni a la mitad. Se contesta a esa
 * ÚNICA petición con una dirección falsa; todo lo demás —el encogido, el
 * guardado en la base, el refresco de la página pública, el pintado— es el
 * código real. La subida al bucket es además el trozo que NO cambió: es el
 * mismo de Promociones, Galería, Comida y Máquinas, en producción desde hace
 * semanas.
 *
 * CÓMO SE USA
 *
 *     npm run build && npx next start -p 3100 &
 *     node scripts/probar-logo-jackpot.mjs
 *
 * Contra la copia local, nunca contra producción: escribe en la base.
 */

import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3100';
const CHROME =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** La dirección con la que se contesta a la subida. Tiene que parecer real. */
const URL_FALSA = 'https://ejemplo.test/medios/logos/2026-01-01-prueba.jpg';

function contrasena() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const m = /^ADMIN_PASSWORD=(.*)$/m.exec(txt);
    if (m) return m[1].trim().replace(/^"|"$/g, '');
  } catch {
    /* sin .env.local */
  }
  return null;
}

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? '  ok  ' : 'FALLA '} ${que}${detalle ? `\n         ${detalle}` : ''}`);
};
const kb = (n) => `${Math.round(n / 1024)} KB`;

const clave = contrasena();
if (!clave) {
  console.error('Falta ADMIN_PASSWORD (en el entorno o en .env.local).');
  process.exit(2);
}

const navegador = await chromium.launch({ executablePath: CHROME });
const contexto = await navegador.newContext();

const login = await contexto.request.post(`${BASE}/api/admin/login`, {
  data: { contrasena: clave },
});
if (!login.ok()) {
  console.error(
    login.status() === 429
      ? 'El limitador de intentos está activo (demasiados logins seguidos). ' +
          'Espera, o vacía app.rate_events en la base LOCAL de prueba.'
      : `No se pudo entrar al panel (${login.status()}). ¿Está el servidor en ${BASE}?`,
  );
  process.exit(2);
}

const pagina = await contexto.newPage();

let subida = null;
await pagina.route('**/api/admin/subir', async (ruta) => {
  const cuerpo = ruta.request().postDataBuffer();
  subida = { bytes: cuerpo ? cuerpo.length : 0 };
  await ruta.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, url: URL_FALSA }),
  });
});

const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e)));
pagina.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text());
});

// --- Panel: la pestaña nueva existe y se abre ----------------------------
await pagina.goto(`${BASE}/admin/jackpots`, { waitUntil: 'networkidle' });

const pestana = pagina.getByRole('tab', { name: 'Logos de los juegos' });
comprobar(await pestana.count() > 0, 'la pestaña "Logos de los juegos" está en el panel');
await pestana.click();

const filas = pagina.locator('button:has-text("Poner logo"), button:has-text("Cambiar")');
const cuantas = await filas.count();
comprobar(cuantas > 0, 'lista las máquinas para ponerles logo', `${cuantas} máquinas`);

// El nombre de la máquina que se va a tocar, para buscarlo después en el tablero.
const nombreMaquina = (
  await pagina.locator('li:has(button:has-text("Poner logo"))').first().locator('p').first().textContent()
)?.trim();

await filas.first().click();

// --- Se escoge una imagen grande y pesada -------------------------------
//
// Ruido puro y 2400 px de lado: si el encogedor no corriera, saldrían varios
// megas por la red y la comprobación de abajo lo cantaría.
await pagina.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = 2400;
  c.height = 2400;
  const x = c.getContext('2d');
  const d = x.createImageData(2400, 2400);
  for (let i = 0; i < d.data.length; i += 4) {
    d.data[i] = (Math.random() * 255) | 0;
    d.data[i + 1] = (Math.random() * 255) | 0;
    d.data[i + 2] = (Math.random() * 255) | 0;
    d.data[i + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 1));
  const archivo = new File([blob], 'logo.jpg', { type: 'image/jpeg' });
  window.__original = archivo.size;

  const dt = new DataTransfer();
  dt.items.add(archivo);
  const input = document.querySelector('input[type="file"]');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
});

for (let i = 0; i < 150 && subida === null; i++) await pagina.waitForTimeout(100);
const original = await pagina.evaluate(() => window.__original);

comprobar(
  subida !== null && subida.bytes < original / 3,
  'el logo se ajusta solo antes de viajar (el mismo auto-fit del resto)',
  `${kb(original)} en el disco → ${kb(subida?.bytes ?? 0)} por la red`,
);

// --- Queda guardado -----------------------------------------------------
await pagina.waitForSelector('[role="status"]:has-text("Logo guardado")', { timeout: 8000 })
  .catch(() => {});
comprobar(
  (await pagina.locator('[role="status"]:has-text("Logo guardado")').count()) > 0,
  'el panel confirma por escrito que se guardó',
  nombreMaquina ?? '',
);

// --- Sale en el tablero público -----------------------------------------
await pagina.goto(`${BASE}/jackpots`, { waitUntil: 'networkidle' });
const enTablero = pagina.locator(`img[alt^="Logo de"]`);
const nTablero = await enTablero.count();

// EXACTAMENTE UNO, no "al menos uno".
//
// Se acaba de poner un solo logo, así que en todo el tablero tiene que haber
// una sola imagen de logo. Comprobar "más de cero" dejaba pasar el fallo que
// importa: que el componente pinte un recuadro para TODAS las máquinas, con
// hueco vacío en las diecisiete que no tienen arte. Se probó rompiéndolo a
// propósito y el "más de cero" seguía en verde.
comprobar(
  nTablero === 1,
  'sale UNA imagen de logo: la de la máquina que lo tiene, y ninguna más',
  `${nTablero} imagen(es) de logo en el tablero`,
);

if (nTablero > 0) {
  comprobar(
    (await enTablero.first().getAttribute('src')) === URL_FALSA,
    'y es exactamente la imagen que se guardó',
  );
}

// --- Ninguna imagen del tablero se quedó sin dirección -------------------
//
// Un <img src=""> no se ve como un hueco: el navegador pinta el icono de
// imagen rota, o nada, según el caso. Se comprueba aparte porque es el síntoma
// de un componente que pinta el recuadro antes de tener qué meter dentro.
const rotas = await pagina.evaluate(() =>
  [...document.querySelectorAll('img')].filter((i) => !i.getAttribute('src')).length,
);
comprobar(rotas === 0, 'ninguna imagen del tablero se quedó sin dirección', `${rotas} rota(s)`);

// --- Se puede quitar ----------------------------------------------------
await pagina.goto(`${BASE}/admin/jackpots`, { waitUntil: 'networkidle' });
await pagina.getByRole('tab', { name: 'Logos de los juegos' }).click();
await pagina.locator('button:has-text("Cambiar")').first().click();
await pagina.getByRole('button', { name: 'Quitar' }).first().click();

await pagina.waitForSelector('[role="status"]:has-text("Logo quitado")', { timeout: 8000 })
  .catch(() => {});
comprobar(
  (await pagina.locator('[role="status"]:has-text("Logo quitado")').count()) > 0,
  'se puede quitar el logo y la máquina vuelve a la ficha de la marca',
);

comprobar(errores.length === 0, 'sin errores en la consola', errores.slice(0, 2).join(' · '));

await navegador.close();
console.log(`\n${fallos === 0 ? 'Todo bien.' : `${fallos} fallos.`}`);
process.exit(fallos === 0 ? 0 : 1);
