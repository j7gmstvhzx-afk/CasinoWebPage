#!/usr/bin/env node
/**
 * ¿DICE EL PANEL LA VERDAD SOBRE LO QUE SE VE EN LA PÁGINA?
 *
 * POR QUÉ EXISTE
 * --------------
 * El dueño reportó, dos veces, que lo que publica en el panel y lo que aparece
 * en la página no cuadran. Y era cierto: las consultas públicas filtran cosas
 * que las del panel no —una promoción vencida, una máquina de jackpot que se
 * cayó de la ventana de tres días— así que el panel enseñaba filas marcadas
 * como publicadas que ningún cliente estaba viendo.
 *
 * Arreglar los casos de hoy no basta: mañana alguien añade un filtro a una
 * consulta pública y el panel vuelve a mentir, en silencio y sin que nada
 * falle. Esto es lo que impide que vuelva a pasar.
 *
 * CÓMO FUNCIONA — SE MIRA LA PÁGINA DE VERDAD, NO EL CÓDIGO
 * ---------------------------------------------------------
 * Cada fila del panel lleva escrito lo que afirma:
 *
 *     data-cam-item="Promo de agosto"  data-cam-visible="no"
 *
 * El script entra al panel, recoge esas afirmaciones, abre la página pública
 * correspondiente y comprueba una por una:
 *
 *   - lo que el panel dice que SE VE, tiene que estar en la página;
 *   - lo que el panel dice que NO se ve, no puede estar.
 *
 * No compara una consulta con otra consulta: compara lo que el panel promete
 * con lo que un visitante recibe. Es la única comparación que no se puede
 * engañar a sí misma.
 *
 * CÓMO SE USA
 *
 *     npm run build && npx next start &
 *     node scripts/verificar-visibilidad.mjs
 *
 * Contra la base local de prueba, NUNCA contra producción: entra al panel con
 * la contraseña y lee páginas, pero no hay razón para apuntarlo a la base real.
 *
 * Sale con código 1 si alguna afirmación del panel no se cumple.
 */

import { readFileSync } from 'node:fs';

const BASE = process.env.CAM_BASE ?? 'http://127.0.0.1:3000';

/** Pares panel → página pública que tienen que cuadrar. */
const PAREJAS = [
  { que: 'Promociones', panel: '/admin/eventos', publica: '/eventos' },
  { que: 'Máquinas nuevas', panel: '/admin/maquinas-nuevas', publica: '/maquinas-nuevas' },
  { que: 'Ganadores', panel: '/admin/ganadores', publica: '/ganadores' },
  { que: 'Comida', panel: '/admin/menu', publica: '/menu' },
  { que: 'Galería', panel: '/admin/galeria', publica: '/galeria' },
  { que: 'Jackpots', panel: '/admin/jackpots', publica: '/jackpots' },
];

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

async function entrar() {
  const clave = contrasena();
  if (!clave) {
    console.error('Falta ADMIN_PASSWORD (en el entorno o en .env.local).');
    process.exit(2);
  }
  const r = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contrasena: clave }),
  });
  if (!r.ok) {
    console.error(`No se pudo entrar al panel (${r.status}). ¿Está el servidor en ${BASE}?`);
    process.exit(2);
  }
  const cookie = (r.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');
  if (!cookie) {
    console.error('El login no devolvió cookie de sesión.');
    process.exit(2);
  }
  return cookie;
}

/** Las afirmaciones del panel: [{ nombre, visible }] */
function afirmaciones(html) {
  const salida = [];
  // Los atributos salen juntos en el HTML del servidor, en este orden.
  const re = /data-cam-item="([^"]*)"[^>]*?data-cam-visible="(si|no)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    salida.push({ nombre: desescapar(m[1]), visible: m[2] === 'si' });
  }
  return salida;
}

const desescapar = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");

/** El texto que de verdad recibe el visitante, sin marcado ni scripts. */
function textoVisible(html) {
  return desescapar(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ');
}

async function bajar(ruta, cookie) {
  const r = await fetch(`${BASE}${ruta}`, { headers: cookie ? { cookie } : {} });
  if (!r.ok) throw new Error(`${ruta} respondió ${r.status}`);
  return r.text();
}

async function main() {
  const cookie = await entrar();
  const fallos = [];
  let comprobadas = 0;

  for (const p of PAREJAS) {
    const [htmlPanel, htmlPublica] = await Promise.all([
      bajar(p.panel, cookie),
      // Sin cookie: exactamente lo que recibe alguien de la calle.
      bajar(p.publica, null),
    ]);

    const filas = afirmaciones(htmlPanel);
    if (filas.length === 0) {
      console.log(`· ${p.que}: el panel no tiene ninguna fila que comprobar`);
      continue;
    }

    const texto = textoVisible(htmlPublica);
    // La galería identifica por la ruta de la imagen, que está en el `src`.
    const crudo = htmlPublica;

    // Dos filas pueden compartir identificador —dos premios de la misma
    // cantidad, uno publicado y otro no— y entonces encontrarlo en la página no
    // prueba nada sobre el oculto. En ese caso la comprobación negativa se
    // salta: vale más no comprobar algo que dar un fallo falso.
    const tambienVisible = new Set(filas.filter((f) => f.visible).map((f) => f.nombre));

    for (const f of filas) {
      comprobadas++;
      const sale = texto.includes(f.nombre) || crudo.includes(f.nombre);
      if (!f.visible && tambienVisible.has(f.nombre)) continue;
      if (f.visible && !sale) {
        fallos.push(
          `${p.que}: el panel dice que "${f.nombre}" SE VE en ${p.publica}, y no está.`,
        );
      } else if (!f.visible && sale) {
        fallos.push(
          `${p.que}: el panel dice que "${f.nombre}" NO se ve, y aparece en ${p.publica}.`,
        );
      }
    }

    const visibles = filas.filter((f) => f.visible).length;
    console.log(
      `· ${p.que}: ${filas.length} filas en el panel, ${visibles} marcadas como visibles`,
    );
  }

  console.log('');
  if (fallos.length > 0) {
    console.error('EL PANEL Y LA PÁGINA NO DICEN LO MISMO:\n');
    for (const f of fallos) console.error(`  ✗ ${f}`);
    console.error(
      '\nUna consulta pública filtra algo que src/lib/visibilidad.ts no refleja.',
    );
    process.exit(1);
  }

  console.log(`Bien: las ${comprobadas} filas del panel cuadran con la página pública.`);
}

main().catch((e) => {
  console.error('No se pudo comprobar:', e.message);
  process.exit(2);
});
