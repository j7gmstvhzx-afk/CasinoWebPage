#!/usr/bin/env node
/**
 * ¿SE AJUSTA SOLA CUALQUIER FOTO QUE SUBAN, PESE LO QUE PESE?
 *
 * SE PRUEBA EL SUBIDOR DE VERDAD, NO UNA COPIA DE SU LÓGICA
 * ---------------------------------------------------------
 * La primera versión de este guion reimplementaba `encogerImagen` aquí dentro
 * y comprobaba el resultado de la copia. Eso demuestra que el lienzo del
 * navegador hace lo que se espera, y NO demuestra nada sobre el módulo que se
 * despliega: el día que los dos se separen, la copia seguiría en verde.
 *
 * Así que ahora se abre el panel, se mete la foto en el subidor de verdad
 * —`SubirImagen`, el mismo de Promociones, Galería, Comida y Máquinas— y se
 * MIDEN LOS BYTES QUE SALEN POR LA RED. Es la única cifra que le importa al
 * cliente que va a descargar esa foto.
 *
 * La subida se intercepta y se contesta que sí. No hace falta que el
 * almacenamiento esté configurado en local, y así el guion no deja basura en
 * ningún bucket.
 *
 * LOS CUATRO CASOS QUE IMPORTAN
 * -----------------------------
 *   1. Foto enorme de teléfono   -> encoge por dimensiones. El caso común.
 *   2. PNG opaco, cabe pero pesa -> encoge por PESO. Este es el que se escapaba
 *      antes: 1200 px de lado, varios megas, y se subía entero porque nadie
 *      miraba la báscula. Es el flyer de promoción típico.
 *   3. PNG CON transparencia     -> NO puede acabar en JPEG. Un logo recortado
 *      con el fondo pintado de negro es peor que una foto pesada.
 *   4. Foto que ya está bien     -> no se toca.
 *
 * CÓMO SE USA
 *
 *     npm run build && npx next start -p 3100 &
 *     node scripts/probar-encoger.mjs
 *
 * Contra la copia local, nunca contra producción: entra al panel con la
 * contraseña.
 */

import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3100';
const CHROME =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

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
  console.error(`No se pudo entrar al panel (${login.status()}). ¿Está el servidor en ${BASE}?`);
  process.exit(2);
}

const pagina = await contexto.newPage();

// Lo que el subidor manda de verdad. Es la medida que cuenta: no lo que dice
// haber hecho, sino los bytes que viajan.
let ultimaSubida = null;
await pagina.route('**/api/admin/subir', async (ruta) => {
  const cuerpo = ruta.request().postDataBuffer();
  ultimaSubida = { bytes: cuerpo ? cuerpo.length : 0, cuerpo: cuerpo?.subarray(0, 4096) };
  await ruta.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, url: '/medios/prueba.jpg' }),
  });
});

// La galería es la pantalla más simple con subidor: el campo está a la vista
// desde que carga, sin abrir ningún formulario antes.
await pagina.goto(`${BASE}/admin/galeria`, { waitUntil: 'networkidle' });

/**
 * Fabrica una imagen del tamaño y tipo pedidos, la mete en el input del subidor
 * REAL y espera a que la petición salga.
 *
 * La imagen es RUIDO puro a propósito: un degradado o un color plano se
 * comprimen a casi nada y harían pasar la prueba por el motivo equivocado. El
 * ruido es lo más parecido a una foto de verdad en lo que a comprimir se
 * refiere.
 */
async function subir({ w, h, tipo, transparencia = false, plano = false }) {
  ultimaSubida = null;

  await pagina.evaluate(
    async ({ w, h, tipo, transparencia, plano }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d');

      if (plano) {
        x.fillStyle = '#123456';
        x.fillRect(0, 0, w, h);
      } else {
        const d = x.createImageData(w, h);
        for (let i = 0; i < d.data.length; i += 4) {
          d.data[i] = (Math.random() * 255) | 0;
          d.data[i + 1] = (Math.random() * 255) | 0;
          d.data[i + 2] = (Math.random() * 255) | 0;
          d.data[i + 3] = 255;
        }
        x.putImageData(d, 0, 0);
      }
      if (transparencia) x.clearRect(0, 0, Math.round(w / 4), Math.round(h / 4));

      const blob = await new Promise((r) =>
        c.toBlob(r, tipo, tipo === 'image/jpeg' ? 1 : undefined),
      );
      const nombre = tipo === 'image/png' ? 'prueba.png' : 'prueba.jpg';
      const archivo = new File([blob], nombre, { type: tipo });
      window.__tamanoOriginal = archivo.size;

      // Se mete en el input REAL y se dispara el mismo evento que dispararía
      // una persona escogiendo el archivo. React escucha 'change' en la raíz,
      // así que esto entra por el mismo camino que un clic de verdad.
      const dt = new DataTransfer();
      dt.items.add(archivo);
      const input = document.querySelector('input[type="file"]');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { w, h, tipo, transparencia, plano },
  );

  // Se espera a que la petición haya salido de verdad.
  for (let i = 0; i < 120 && ultimaSubida === null; i++) {
    await pagina.waitForTimeout(100);
  }

  const original = await pagina.evaluate(() => window.__tamanoOriginal);
  const aviso = await pagina
    .locator('[role="status"]')
    .filter({ hasText: 'Se ajustó sola' })
    .first()
    .textContent()
    .catch(() => null);

  // El tipo que acabó viajando se lee de la cabecera del multipart.
  const cabecera = ultimaSubida?.cuerpo?.toString('latin1') ?? '';
  const tipoEnviado = /Content-Type: (image\/[a-z]+)/.exec(cabecera)?.[1] ?? null;

  return { original, enviado: ultimaSubida?.bytes ?? null, aviso, tipoEnviado };
}

// --- 1. Foto enorme de teléfono ------------------------------------------
{
  const r = await subir({ w: 4000, h: 3000, tipo: 'image/jpeg' });
  comprobar(
    r.enviado !== null && r.enviado < r.original / 4,
    'foto de teléfono 4000×3000: sale por la red mucho más ligera',
    `${kb(r.original)} en el disco → ${kb(r.enviado)} por la red`,
  );
  comprobar(!!r.aviso, 'y se le dice a quien la subió lo que se hizo', r.aviso ?? '(sin aviso)');
}

// --- 2. PNG opaco que CABE por lado pero PESA ----------------------------
{
  const r = await subir({ w: 1200, h: 1200, tipo: 'image/png' });
  comprobar(
    r.enviado !== null && r.enviado < r.original / 2,
    'PNG opaco que CABE pero PESA: se recomprime igual (era el agujero)',
    `${kb(r.original)} → ${kb(r.enviado)}`,
  );
  comprobar(
    r.tipoEnviado === 'image/jpeg',
    'y viaja como JPEG, que es de donde sale el ahorro',
    `viajó como ${r.tipoEnviado}`,
  );
}

// --- 3. PNG CON transparencia: no puede acabar en JPEG -------------------
{
  const r = await subir({ w: 1200, h: 1200, tipo: 'image/png', transparencia: true });
  comprobar(
    r.tipoEnviado === 'image/png',
    'PNG CON transparencia: sigue siendo PNG, no se pinta de negro',
    `viajó como ${r.tipoEnviado}`,
  );
}

// --- 4. Foto que ya está bien: no se toca -------------------------------
{
  const r = await subir({ w: 800, h: 600, tipo: 'image/jpeg', plano: true });
  comprobar(
    r.aviso === null,
    'foto que ya está bien: no se toca ni se anuncia nada',
    `${kb(r.original)}, aviso: ${r.aviso ?? 'ninguno'}`,
  );
}

await navegador.close();
console.log(`\n${fallos === 0 ? 'Todo bien.' : `${fallos} fallos.`}`);
process.exit(fallos === 0 ? 0 : 1);
