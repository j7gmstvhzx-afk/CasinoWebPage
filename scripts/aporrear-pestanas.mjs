/**
 * Aporrear las pestañas: entrar en todas, muchas veces seguidas, y no dejar
 * pasar ni un error.
 *
 * POR QUÉ ESTO NO ES EL HUMO DE SIEMPRE
 * -------------------------------------
 * `smoke-nav.mjs` recorre las pestañas UNA vez y comprueba que llegan. Sirve
 * para "no rompí la navegación". No sirve para lo que reportó el dueño, que es
 * otra cosa: que MOVIÉNDOSE por las pestañas, a veces, sale el esqueleto de
 * carga y se queda. Un fallo que aparece una de cada treinta veces no se caza
 * pasando una vez.
 *
 * Aquí se entra a cada pestaña cien veces seguidas —novecientas navegaciones en
 * el sitio público, mil en el panel— y se vigila TODO lo que puede salir mal:
 *
 *   - errores de consola y excepciones sin capturar en el navegador;
 *   - cualquier respuesta 4xx o 5xx, incluidas las que Next pide por su cuenta;
 *   - la página de error ("No pudimos cargar esta página");
 *   - el aviso de sección caída ("No pudimos cargar los premios…"), que es el
 *     que sale cuando una consulta se agota;
 *   - y el esqueleto que se queda puesto, que es el síntoma original.
 *
 * SE CORRE CONTRA LA COPIA LOCAL, NUNCA CONTRA PRODUCCIÓN. Novecientas
 * navegaciones contra el sitio en vivo son novecientas visitas contra la base
 * del casino: eso no se hace para probar.
 *
 * Uso:
 *   node scripts/aporrear-pestanas.mjs --area publico   [--vueltas 100]
 *   node scripts/aporrear-pestanas.mjs --area panel
 *   node scripts/aporrear-pestanas.mjs --area movil
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const CHROMIUM = process.env.CHROMIUM_PATH;

const arg = (nombre, pordefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : pordefecto;
};

const AREA = arg('area', 'publico');
const VUELTAS = Number(arg('vueltas', '100'));

/** Las pestañas de cada zona, con el texto que hay que tocar. */
const ZONAS = {
  publico: {
    entrada: '/',
    movil: false,
    pestanas: [
      ['Inicio', '/'],
      ['Jackpots', '/jackpots'],
      ['Máquinas Nuevas', '/maquinas-nuevas'],
      ['Eventos', '/eventos'],
      ['Galería', '/galeria'],
      ['Ganadores', '/ganadores'],
      ['Comida', '/menu'],
      ['Contacto', '/contacto'],
      ['Mi cuenta', '/cuenta'],
    ],
  },
  movil: {
    entrada: '/',
    movil: true,
    pestanas: [
      ['Inicio', '/'],
      ['Jackpots', '/jackpots'],
      ['Máquinas Nuevas', '/maquinas-nuevas'],
      ['Eventos', '/eventos'],
      ['Galería', '/galeria'],
      ['Ganadores', '/ganadores'],
      ['Comida', '/menu'],
      ['Contacto', '/contacto'],
      ['Mi cuenta', '/cuenta'],
    ],
  },
  panel: {
    entrada: '/admin',
    movil: false,
    admin: true,
    pestanas: [
      ['Resumen', '/admin'],
      ['Canjear', '/admin/canjear'],
      ['Jackpots', '/admin/jackpots'],
      ['Promociones', '/admin/eventos'],
      ['Máquinas nuevas', '/admin/maquinas-nuevas'],
      ['Comida', '/admin/menu'],
      ['Galería', '/admin/galeria'],
      ['Horario', '/admin/horario'],
      ['Ganadores', '/admin/ganadores'],
      ['Clientes', '/admin/clientes'],
    ],
  },
};

const zona = ZONAS[AREA];
if (!zona) {
  console.error(`No conozco el área "${AREA}". Hay: ${Object.keys(ZONAS).join(', ')}`);
  process.exit(2);
}

function contrasena() {
  const env = process.env.ADMIN_PASSWORD;
  if (env) return env;
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const m = /^ADMIN_PASSWORD=(.*)$/m.exec(txt);
    if (m) return m[1].trim().replace(/^"|"$/g, '');
  } catch {
    /* sin .env.local */
  }
  return null;
}

/** Texto que, si aparece, es un fallo aunque la página conteste 200. */
const SEÑALES_DE_FALLO = [
  'No pudimos cargar esta página',   // src/app/error.tsx
  'No pudimos cargar',               // FalloDeCarga, en el panel
  'Application error',               // el error crudo de Next, si se escapa
];

const fallos = [];
const anota = (vuelta, pestana, tipo, detalle) => {
  fallos.push({ vuelta, pestana, tipo, detalle });
  console.error(`  ✗ vuelta ${vuelta} · ${pestana} · ${tipo}: ${detalle}`);
};

const navegador = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
const contexto = await navegador.newContext(
  zona.movil ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {},
);

if (zona.admin) {
  const clave = contrasena();
  if (!clave) {
    console.error('Falta ADMIN_PASSWORD (en el entorno o en .env.local).');
    process.exit(2);
  }
  const r = await contexto.request.post(`${BASE}/api/admin/login`, {
    data: { contrasena: clave },
  });
  if (!r.ok()) {
    console.error(`No se pudo entrar al panel (${r.status()}). ¿Está el servidor en ${BASE}?`);
    process.exit(2);
  }
}

const pagina = await contexto.newPage();

// Todo lo que el navegador se queje, con su vuelta y su pestaña.
let dónde = { vuelta: 0, pestana: '(arranque)' };

// LOS FALLOS DE RED SE APUNTAN CON SU DIRECCIÓN.
//
// Antes se apuntaba el mensaje de consola tal cual, y el de un recurso que no
// carga es siempre el mismo: "Failed to load resource: net::ERR_...". Sin la
// dirección no hay forma de saber si lo que falló es algo NUESTRO —que sería un
// fallo de verdad— o el mapa de Google y la miniatura de YouTube, que en este
// contenedor no pueden cargar porque no hay salida a internet. Salían cien
// fallos idénticos y ninguno decía de qué.
//
// Ahora se separan por dominio. Lo de fuera se cuenta aparte y se enseña al
// final como una nota, no como un fallo; lo nuestro sigue siendo un fallo.
const FUERA = /(^|\.)(youtube-nocookie\.com|youtube\.com|ytimg\.com|googlevideo\.com|google\.com|gstatic\.com|googleapis\.com)$/;
const deFuera = new Map();
let canceladas = 0;
pagina.on('requestfailed', (r) => {
  let host = '';
  try {
    host = new URL(r.url()).hostname;
  } catch {
    /* dirección rara */
  }
  const motivo = r.failure()?.errorText ?? '';
  const texto = `${r.url()} [${motivo}]`;

  if (FUERA.test(host)) {
    deFuera.set(host, (deFuera.get(host) ?? 0) + 1);
    return;
  }

  // ERR_ABORTED en una petición de navegación (`?_rsc=`) NO es un fallo: es el
  // navegador cancelando algo que ya no hace falta porque este guion clica la
  // siguiente pestaña antes de que termine la anterior. Una persona no va tan
  // rápido; el aporreo sí, y por eso lo provoca él mismo.
  //
  // Y se puede descartar sin miedo por una razón concreta: si esa carga hubiera
  // fallado DE VERDAD, la pestaña se habría quedado sin contenido, y eso lo
  // comprueba aparte el detector de esqueletos y de texto en <main>. O sea que
  // no se está tapando nada: hay una segunda red debajo.
  if (motivo === 'net::ERR_ABORTED' && r.url().includes('_rsc=')) {
    canceladas++;
    return;
  }

  anota(dónde.vuelta, dónde.pestana, 'red', texto.slice(0, 200));
});

pagina.on('console', (m) => {
  // El mensaje de "no cargó un recurso" no trae la dirección, así que aquí no
  // sirve de nada: ya quedó apuntado, con su URL y su dominio, más arriba.
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) {
    anota(dónde.vuelta, dónde.pestana, 'consola', m.text().slice(0, 200));
  }
});
pagina.on('pageerror', (e) => anota(dónde.vuelta, dónde.pestana, 'excepción', String(e).slice(0, 200)));
pagina.on('response', (r) => {
  if (r.status() >= 400) {
    anota(dónde.vuelta, dónde.pestana, `HTTP ${r.status()}`, new URL(r.url()).pathname);
  }
});

await pagina.goto(`${BASE}${zona.entrada}`, { waitUntil: 'domcontentloaded' });

// El pop-up de promociones tapa el menú en el sitio público: se cierra una vez.
for (let i = 0; i < 6; i++) {
  const b = pagina.getByRole('button', { name: /SIGUIENTE|IR A LA TRAGAMONEDAS|Cerrar/i }).first();
  if (!(await b.count())) break;
  await b.click().catch(() => {});
  await pagina.waitForTimeout(200);
}

console.log(`\n▶ ${AREA}: ${zona.pestanas.length} pestañas × ${VUELTAS} vueltas = ` +
  `${zona.pestanas.length * VUELTAS} navegaciones\n`);

const t0 = Date.now();
let hechas = 0;
let esqueletosLargos = 0;

for (let vuelta = 1; vuelta <= VUELTAS; vuelta++) {
  for (const [pestana, ruta] of zona.pestanas) {
    dónde = { vuelta, pestana };

    // En móvil hay que abrir el menú antes de cada salto.
    if (zona.movil) {
      const hamburguesa = pagina.getByRole('button', { name: /menú|menu/i }).first();
      if (await hamburguesa.count()) {
        await hamburguesa.click().catch(() => {});
        await pagina.waitForTimeout(120);
      }
    }

    const enlace = pagina.getByRole('link', { name: pestana, exact: true }).first();
    if (!(await enlace.count())) {
      anota(vuelta, pestana, 'pestaña', 'no está en el menú');
      continue;
    }

    const yaEstaba = new URL(pagina.url()).pathname === ruta;
    const antes = Date.now();
    await enlace.click().catch((e) => anota(vuelta, pestana, 'clic', String(e).slice(0, 120)));

    // PRIMERO SE COMPRUEBA QUE SE LLEGÓ, Y LUEGO SI QUEDA ESQUELETO.
    //
    // El orden importa y la primera versión lo tenía mal: miraba el esqueleto
    // nada más hacer clic, cuando en pantalla todavía estaba la pestaña
    // ANTERIOR —que, claro, ya no tenía esqueleto—, así que daba por buena una
    // navegación que ni siquiera había empezado. Un contador de esqueletos que
    // mide la página equivocada siempre sale a cero. Lo cazó un agente
    // revisando el guion, no el guion a sí mismo.
    //
    // Ahora se espera a que la URL sea la de la pestaña. Si el clic no navega
    // —el fallo más silencioso de todos— esto lo dice en vez de callarse.
    let llegó = true;
    if (!yaEstaba) {
      try {
        await pagina.waitForURL((u) => new URL(u).pathname === ruta, { timeout: 8000 });
      } catch {
        llegó = false;
        anota(vuelta, pestana, 'no navegó', `sigue en ${new URL(pagina.url()).pathname}`);
      }
    }

    // Y ahora sí, sobre la página nueva: que el esqueleto se haya ido y que
    // haya contenido de verdad debajo.
    if (llegó) {
      try {
        await pagina.waitForFunction(
          () => {
            if (document.querySelector('[data-cargando], .animate-pulse')) return false;
            const main = document.querySelector('main');
            return !!main && (main.innerText ?? '').trim().length > 40;
          },
          undefined,
          { timeout: 8000 },
        );
      } catch {
        esqueletosLargos++;
        anota(vuelta, pestana, 'esqueleto', 'seguía cargando (o vacía) a los 8 s');
      }
    }
    const tardó = Date.now() - antes;
    if (tardó > 3000) anota(vuelta, pestana, 'lento', `${tardó} ms`);

    const texto = await pagina.locator('body').innerText().catch(() => '');
    for (const señal of SEÑALES_DE_FALLO) {
      if (texto.includes(señal)) {
        anota(vuelta, pestana, 'mensaje de error en pantalla', señal);
        break;
      }
    }

    hechas++;
  }

  if (vuelta % 10 === 0) {
    const seg = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`  vuelta ${vuelta}/${VUELTAS} — ${hechas} navegaciones, ${fallos.length} fallos, ${seg}s`);
  }
}

await navegador.close();

const seg = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\n${hechas} navegaciones en ${seg}s. Esqueletos que no se fueron: ${esqueletosLargos}.`);

// Se enseña siempre, aunque esté todo verde: que quede claro que se vio y se
// descartó a propósito, y no que nadie miró. En el sitio de verdad estas
// direcciones sí cargan; aquí dentro no hay salida a internet.
if (canceladas) {
  console.log(
    `\n${canceladas} cargas de pestaña canceladas por ir más rápido que una ` +
      'persona. No cuentan: el contenido de cada pestaña se comprueba aparte.',
  );
}

if (deFuera.size) {
  const total = [...deFuera.values()].reduce((a, b) => a + b, 0);
  console.log(
    `\n${total} peticiones a sitios de fuera bloqueadas por el contenedor ` +
      '(aquí no hay internet). No cuentan como fallo:',
  );
  for (const [host, n] of [...deFuera].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)} × ${host}`);
  }
}

if (fallos.length) {
  const porTipo = {};
  for (const f of fallos) porTipo[f.tipo] = (porTipo[f.tipo] ?? 0) + 1;
  console.error(`\n${fallos.length} FALLO(S):`);
  for (const [t, n] of Object.entries(porTipo)) console.error(`  ${n} × ${t}`);
  console.error(`\nEl primero: vuelta ${fallos[0].vuelta}, ${fallos[0].pestana} — ${fallos[0].detalle}`);
  process.exit(1);
}
console.log('\nNi un error en ninguna de las vueltas. ✓');
