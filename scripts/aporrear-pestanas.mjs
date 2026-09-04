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
pagina.on('console', (m) => {
  if (m.type() === 'error') anota(dónde.vuelta, dónde.pestana, 'consola', m.text().slice(0, 200));
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

if (fallos.length) {
  const porTipo = {};
  for (const f of fallos) porTipo[f.tipo] = (porTipo[f.tipo] ?? 0) + 1;
  console.error(`\n${fallos.length} FALLO(S):`);
  for (const [t, n] of Object.entries(porTipo)) console.error(`  ${n} × ${t}`);
  console.error(`\nEl primero: vuelta ${fallos[0].vuelta}, ${fallos[0].pestana} — ${fallos[0].detalle}`);
  process.exit(1);
}
console.log('\nNi un error en ninguna de las vueltas. ✓');
