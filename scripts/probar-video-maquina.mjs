#!/usr/bin/env node
/**
 * ¿ARRANCA EL VIDEO AL TOCAR LA MÁQUINA, Y NO ANTES?
 *
 * Son dos afirmaciones, y las dos hay que probarlas en un navegador de verdad
 * porque las dos dependen de lo que el navegador hace, no de lo que dice el
 * código:
 *
 *   1. ANTES de tocar no puede existir ni un iframe. Es lo que hace que la
 *      pestaña siga abriendo rápido con doce máquinas: un iframe de YouTube
 *      arrastra cerca de un mega de JavaScript por cada uno.
 *   2. DESPUÉS de tocar tiene que existir, apuntando al video correcto y con
 *      autoplay pedido.
 *
 * Y una tercera que es de no estorbar: una máquina SIN video no puede tener
 * botón. Una tarjeta que parece que se puede tocar y no hace nada es peor que
 * una tarjeta quieta.
 *
 * LA MÁQUINA DE PRUEBA SE CREA Y SE BORRA AQUÍ
 * --------------------------------------------
 * La primera versión daba por hecho que en la base ya había una máquina con
 * video, metida a mano. Eso convierte la prueba en algo que solo funciona en el
 * ordenador donde se escribió: en cualquier otro no encontraría el botón y
 * pasaría en verde sin haber comprobado nada.
 *
 * Ahora se crea por la API de verdad —la misma que usa el panel, con su
 * contraseña y su validación— y se borra al terminar. De paso queda probado el
 * camino de guardado, que es donde vive la comprobación del enlace.
 *
 * CÓMO SE USA
 *
 *     npm run build && npx next start -p 3100 &
 *     node scripts/probar-video-maquina.mjs
 *
 * Contra la copia local, nunca contra producción: escribe en la base.
 */

import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3100';
const CHROME =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** El video de prueba. Once caracteres, como manda la restricción de la base. */
const VIDEO = 'dQw4w9WgXcQ';
const NOMBRE = 'ZZZ Máquina de prueba automática';

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
  // 429 es el limitador de intentos, no un fallo del sitio: pasa cuando se han
  // encadenado varias corridas del aporreo, que entra al panel en cada una. Se
  // dice con esas palabras para no perder media hora buscando lo que no es.
  console.error(
    login.status() === 429
      ? 'El limitador de intentos está activo (demasiados logins seguidos). ' +
          'Espera, o vacía app.rate_events en la base LOCAL de prueba.'
      : `No se pudo entrar al panel (${login.status()}). ¿Está el servidor en ${BASE}?`,
  );
  process.exit(2);
}

const pagina = await contexto.newPage();

// LAS LLAMADAS A LA API VAN DESDE LA PÁGINA, NO DESDE `contexto.request`.
//
// La cookie del panel es `Secure`, y eso tiene una consecuencia poco obvia: el
// NAVEGADOR la manda igualmente a localhost —los navegadores tratan localhost
// como sitio seguro aunque sea http— pero el cliente de peticiones de
// Playwright, que corre por fuera del navegador, aplica la regla a rajatabla y
// no la manda. Resultado: el login daba 200 y la llamada siguiente 401.
//
// Hacerlas con `fetch` dentro de la página usa el tarro de galletas del propio
// navegador, que es además el camino que recorre el panel de verdad.
await pagina.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });

const api = (metodo, cuerpo) =>
  pagina.evaluate(
    async ({ metodo, cuerpo }) => {
      const r = await fetch('/api/admin/contenido', {
        method: metodo,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      return { estado: r.status, cuerpo: await r.json().catch(() => ({})) };
    },
    { metodo, cuerpo },
  );

// Se crea por la MISMA ruta que usa el panel: si la validación del enlace se
// rompiera, esto fallaría aquí y no en una comprobación de adorno más abajo.
const alta = await api('POST', {
  tipo: 'maquinas',
  datos: {
    name: NOMBRE,
    arrived_on: new Date().toISOString().slice(0, 10),
    video_id: VIDEO,
    published: true,
  },
});
if (alta.estado !== 200 || !alta.cuerpo.id) {
  console.error(
    'No se pudo crear la máquina de prueba:',
    alta.estado,
    JSON.stringify(alta.cuerpo),
  );
  await navegador.close();
  process.exit(2);
}

const limpiar = () =>
  api('DELETE', { tipo: 'maquinas', id: alta.cuerpo.id }).catch(() => {});

// Los fallos de red se apuntan CON SU DIRECCIÓN, no como "hubo un error".
//
// En el contenedor donde corre esta prueba no hay salida a internet, así que
// todo lo que apunte a YouTube va a fallar por fuerza. Eso no es un fallo del
// sitio y no puede contarse como tal — pero tampoco se puede silenciar a ciegas
// "cualquier error de red", porque entonces un fallo de verdad en un recurso
// nuestro pasaría de largo. Se separan por dominio.
const FUERA = /(^|\.)(youtube-nocookie\.com|youtube\.com|ytimg\.com|googlevideo\.com)$/;
const esDeFuera = (u) => {
  try {
    return FUERA.test(new URL(u).hostname);
  } catch {
    return false;
  }
};

const errores = [];
const bloqueados = [];
pagina.on('requestfailed', (r) => {
  const motivo = r.failure()?.errorText ?? '';
  if (esDeFuera(r.url())) {
    bloqueados.push(`${r.url()} — ${motivo}`);
    return;
  }
  // Precarga de ruta que el navegador cancela al salir del panel hacia la
  // página pública. No es un fallo: nada se quedó esperándola.
  if (motivo === 'net::ERR_ABORTED' && r.url().includes('_rsc=')) return;
  errores.push(`${r.url()} — ${motivo}`);
});
pagina.on('console', (m) => {
  // El mensaje de consola de un recurso que no cargó no trae la dirección, así
  // que se ignora aquí: ya quedó apuntado, con su URL, en `requestfailed`.
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text());
});
pagina.on('pageerror', (e) => errores.push(String(e)));

await pagina.goto(`${BASE}/maquinas-nuevas`, { waitUntil: 'networkidle' });

// --- 1. Antes de tocar: ni un solo iframe --------------------------------
const iframesAntes = await pagina.locator('iframe').count();
comprobar(iframesAntes === 0, 'antes de tocar no hay ningún iframe', `había ${iframesAntes}`);

// --- 2. La máquina con video tiene botón ---------------------------------
const botones = pagina.locator('button[aria-label^="Ver el video de"]');
const cuantos = await botones.count();
comprobar(cuantos > 0, 'la máquina con video tiene su botón de play', `encontrados: ${cuantos}`);

// --- 3. Las máquinas SIN video no tienen botón ---------------------------
//
// Se cuentan las tarjetas y se compara: si todas tuvieran botón, el componente
// estaría poniéndolo también donde no hay video.
const tarjetas = await pagina.locator('main ul > li').count();
comprobar(
  tarjetas > cuantos,
  'las máquinas sin video NO tienen botón',
  `${tarjetas} tarjetas, ${cuantos} con botón`,
);

if (cuantos > 0) {
  const etiqueta = await botones.first().getAttribute('aria-label');

  // --- 4. Al tocar aparece el reproductor -------------------------------
  await botones.first().click();
  const marco = pagina.locator('iframe').first();
  await marco.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});

  const src = (await marco.getAttribute('src').catch(() => null)) ?? '';
  comprobar(src.length > 0, 'al tocar aparece el reproductor', etiqueta ?? '');
  comprobar(
    src.startsWith('https://www.youtube-nocookie.com/embed/'),
    'el reproductor va al dominio sin cookies',
    src,
  );
  comprobar(src.includes('autoplay=1'), 'pide arrancar solo', src);

  const permiso = (await marco.getAttribute('allow')) ?? '';
  comprobar(
    permiso.includes('autoplay'),
    'el marco tiene permiso de autoplay',
    `allow="${permiso}"`,
  );

  // --- 5. El botón desaparece: no se puede tocar dos veces ---------------
  comprobar(
    (await pagina.locator(`button[aria-label="${etiqueta}"]`).count()) === 0,
    'el botón se va cuando el video ocupa su sitio',
  );

  // --- 6. Los demás siguen sin cargar -----------------------------------
  comprobar(
    (await pagina.locator('iframe').count()) === 1,
    'tocar una máquina no carga el video de las demás',
  );
}

comprobar(
  errores.length === 0,
  'sin errores propios de la página',
  errores.slice(0, 3).join(' · '),
);

// No es una comprobación, es una nota: aquí dentro no hay internet, así que
// esto SIEMPRE va a salir. Se imprime para que quede claro que se vio y se
// descartó a propósito, y no que nadie miró.
if (bloqueados.length) {
  console.log(
    `  nota  ${bloqueados.length} peticiones a YouTube bloqueadas por el ` +
      'contenedor (aquí no hay salida a internet). En el sitio de verdad cargan.',
  );
  for (const b of bloqueados.slice(0, 3)) console.log(`         ${b}`);
}

// Se borra pase lo que pase: una prueba que deja basura en la base hace que la
// siguiente empiece con el terreno sucio.
await limpiar();
await navegador.close();
console.log(`\n${fallos === 0 ? 'Todo bien.' : `${fallos} fallos.`}`);
process.exit(fallos === 0 ? 0 : 1);
