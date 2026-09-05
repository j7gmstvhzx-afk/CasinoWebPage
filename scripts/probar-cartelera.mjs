#!/usr/bin/env node
/**
 * ¿SE PUEDE PONER LA HORA DE UNA PROMOCIÓN Y DICE LA PÁGINA LO MISMO QUE EL PANEL?
 *
 * Recorre el camino entero en un navegador de verdad: panel → nueva promoción →
 * fecha y hora → guardar → cartelera pública → portada → editar → borrar.
 *
 * LO QUE COMPRUEBA, Y POR QUÉ CADA COSA
 * --------------------------------------
 *   1. El panel ENSEÑA ANTES DE GUARDAR la frase que va a leer el cliente. Es
 *      la única forma de que quien llena cuatro casillas sepa qué está diciendo.
 *   2. La hora LLEGA A LA BASE y vuelve. `<input type="time">` manda 'HH:MM' y
 *      Postgres devuelve 'HH:MM:SS'; si alguien se olvida de recortar, el campo
 *      sale vacío al editar y la hora se pierde sin avisar.
 *   3. El panel y la página dicen EXACTAMENTE la misma frase. Es el fallo que
 *      ya pasó una vez en este sitio: el panel decía una cosa y el cliente veía
 *      otra, y el dueño no tenía forma de notarlo.
 *   4. Lo de hoy sale bajo "Ahora mismo" y CON la marca dorada.
 *   5. Quitar las horas deja la promoción como estaba, sin restos.
 *
 * CÓMO SE USA
 *
 *     npm run build && npx next start -p 3100 &
 *     node scripts/probar-cartelera.mjs
 *
 * Contra la copia local, NUNCA contra producción: crea y borra promociones.
 */

import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3100';
const CHROME =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const TITULO = 'Prueba de cartelera (borrar)';

/** El día de hoy en Puerto Rico, con la misma cuenta que hace el sitio. */
const hoy = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);

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
pagina.on('dialog', (d) => d.accept()); // el "¿Borrar…?" del final

const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e)));
pagina.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text());
});

/** La tarjeta de la promoción de prueba, en la lista del panel. */
const tarjetaPanel = () => pagina.locator(`li[data-cam-item="${TITULO}"]`);

// --- Crear con fecha de hoy y horas que cruzan la medianoche --------------
await pagina.goto(`${BASE}/admin/eventos`, { waitUntil: 'networkidle' });
await pagina.getByRole('button', { name: '+ Nueva promoción' }).click();

await pagina.locator('#titulo').fill(TITULO);
await pagina.locator('#inicio').fill(hoy);
await pagina.locator('#hora-inicio').fill('21:00');
await pagina.locator('#hora-fin').fill('01:00');

const ESPERADO = 'Hoy, de 9:00 p.m. a 1:00 a.m.';

const previa = pagina.locator('p:has-text("En la página se leerá:")');
comprobar(
  (await previa.textContent())?.includes(ESPERADO) ?? false,
  'el panel enseña la frase ANTES de guardar',
  (await previa.textContent())?.trim(),
);

await pagina.getByRole('button', { name: 'Guardar' }).click();
await pagina.waitForSelector(`li[data-cam-item="${TITULO}"]`, { timeout: 8000 }).catch(() => {});

const enPanel = (await tarjetaPanel().textContent()) ?? '';
comprobar(enPanel.includes(ESPERADO), 'y la misma frase queda en su tarjeta del panel');

// --- La hora sobrevive al viaje de ida y vuelta ---------------------------
//
// Postgres devuelve 'HH:MM:SS' y el campo del formulario solo entiende 'HH:MM'.
// Si no se recorta, al reabrir la promoción el campo sale VACÍO y el siguiente
// guardado le borra la hora sin decir nada.
await tarjetaPanel().getByRole('button', { name: 'Editar' }).click();
comprobar(
  (await pagina.locator('#hora-inicio').inputValue()) === '21:00' &&
    (await pagina.locator('#hora-fin').inputValue()) === '01:00',
  'al reabrirla, las horas siguen en sus casillas',
  `inicio="${await pagina.locator('#hora-inicio').inputValue()}" ` +
    `fin="${await pagina.locator('#hora-fin').inputValue()}"`,
);
await pagina.getByRole('button', { name: 'Cancelar' }).click();

// --- La cartelera pública -------------------------------------------------
await pagina.goto(`${BASE}/eventos`, { waitUntil: 'networkidle' });

const tarjeta = pagina.locator('li').filter({ hasText: TITULO }).first();
comprobar((await tarjeta.count()) > 0, 'la promoción sale en la cartelera');

const texto = (await tarjeta.textContent()) ?? '';
comprobar(
  texto.includes(ESPERADO),
  'la página dice EXACTAMENTE lo mismo que el panel',
  texto.replace(/\s+/g, ' ').trim().slice(0, 120),
);
// EL SELLO, NO LA PALABRA.
//
// Esta comprobación decía `texto.includes('Hoy')` y se quedaba en verde con el
// sello borrado, porque la frase de la fecha ya empieza por "Hoy". Se probó
// quitando el sello a propósito y no se enteró. Ahora se busca un elemento cuyo
// texto sea EXACTAMENTE "Hoy", que es el sello y nada más.
// Hijo DIRECTO de la tarjeta: el sello va pegado al arte, mientras que la
// frase de la fecha vive dentro del bloque de texto. Sin esta distinción, un
// evento cuya frase sea justo "Hoy" hacía pasar la comprobación con el sello
// borrado (probado).
const sello = tarjeta.locator(':scope > span').filter({ hasText: /^Hoy$/ });
comprobar(
  (await sello.count()) === 1,
  'y lleva la marca dorada de "Hoy" (el sello, no la palabra dentro de la frase)',
  `${await sello.count()} sello(s)`,
);

// Bajo "Ahora mismo", no bajo "Esta semana": lo de hoy ya está pasando.
const bloque = await pagina.evaluate((titulo) => {
  const tarjetas = [...document.querySelectorAll('li')];
  const mia = tarjetas.find((li) => li.textContent?.includes(titulo));
  if (!mia) return null;
  const seccion = mia.closest('div');
  return seccion?.querySelector('h2')?.textContent?.trim() ?? null;
}, TITULO);
comprobar(bloque === 'Ahora mismo', 'y está en el bloque de "Ahora mismo"', `bloque: ${bloque}`);

// --- Ninguna tarjeta se queda con la línea vacía ---------------------------
//
// `cuando()` devuelve null cuando no hay ni fecha ni hora, y entonces la línea
// no se pinta. Si alguna vez devolviera una cadena vacía, saldría un hueco de
// una línea debajo de un título y nadie sabría de dónde sale.
const vacias = await pagina.evaluate(
  () => [...document.querySelectorAll('p.text-cian')].filter((p) => !p.textContent?.trim()).length,
);
comprobar(vacias === 0, 'ninguna tarjeta pinta una línea de fecha vacía', `${vacias} vacía(s)`);

// --- La portada cuenta lo mismo -------------------------------------------
await pagina.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const enPortada = await pagina.evaluate((titulo) => {
  const li = [...document.querySelectorAll('li')].find((x) => x.textContent?.includes(titulo));
  return li ? li.textContent : null;
}, TITULO);
comprobar(
  enPortada !== null && enPortada.includes(ESPERADO),
  'la portada dice la misma frase que la cartelera',
  enPortada ? enPortada.replace(/\s+/g, ' ').trim().slice(0, 120) : 'no salió en la portada',
);

// --- Quitar las horas la deja como estaba ---------------------------------
await pagina.goto(`${BASE}/admin/eventos`, { waitUntil: 'networkidle' });
await tarjetaPanel().getByRole('button', { name: 'Editar' }).click();
await pagina.locator('#hora-inicio').fill('');
await pagina.locator('#hora-fin').fill('');
await pagina.getByRole('button', { name: 'Guardar' }).click();
await pagina.waitForTimeout(1500);

const sinHoras = (await tarjetaPanel().textContent()) ?? '';
comprobar(
  sinHoras.includes('Hoy') && !sinHoras.includes('p.m.'),
  'al quitar las horas vuelve a decir solo "Hoy"',
  sinHoras.replace(/\s+/g, ' ').trim().slice(0, 100),
);

// --- Limpieza --------------------------------------------------------------
await tarjetaPanel().getByRole('button', { name: 'Borrar' }).click();
await pagina.waitForTimeout(1500);
comprobar((await tarjetaPanel().count()) === 0, 'la promoción de prueba se borró');

comprobar(errores.length === 0, 'sin errores en la consola', errores.slice(0, 2).join(' · '));

await navegador.close();
console.log(`\n${fallos === 0 ? 'Todo bien.' : `${fallos} fallos.`}`);
process.exit(fallos === 0 ? 0 : 1);
