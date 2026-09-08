#!/usr/bin/env node
/**
 * GUARDAR UN MONTO NO PUEDE BORRAR EL QUE ACABA DE ESCRIBIR OTRO.
 *
 * POR QUÉ EXISTE
 * --------------
 * El servidor borra la lectura de hoy de todas las máquinas que le llegan en la
 * petición — tiene que hacerlo, porque es la única forma de vaciar una cifra
 * mal tecleada. Y la pantalla mandaba LAS DIECIOCHO en cada guardado, con
 * casilla o sin ella.
 *
 * Juntando las dos cosas, cualquier pestaña vieja se volvía una bomba: se abre
 * el panel, otro empleado escribe los montos del día, y al guardar la pestaña
 * vieja —con sus casillas todavía en blanco— los borra sin decir nada. Ni
 * siquiera hacen falta dos personas: basta con tener el panel abierto dos
 * veces.
 *
 * Esta prueba monta ese choque a propósito.
 *
 * Uso:  npm run build && npx next start -p 3100
 *       node scripts/probar-jackpots.mjs
 *
 * Contra la base LOCAL. Limpia lo que planta, gane o falle.
 */

import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import postgres from 'postgres';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3100';
const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const leerEnv = (clave) => {
  const m = new RegExp(`^${clave}=(.*)$`, 'm').exec(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
  return m ? m[1].trim().replace(/^"|"$/g, '') : null;
};

const sql = postgres(process.env.DATABASE_POOL_URL ?? leerEnv('DATABASE_POOL_URL'), {
  prepare: false, max: 1, ssl: false,
});

let fallos = 0;
const comprobar = (ok, texto, detalle = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${texto}${ok ? '' : `\n      ${detalle}`}`);
  if (!ok) fallos++;
};

const hoyDe = (id) => sql`
  select amount_cents::text as monto from app.jackpot_readings
   where machine_id = ${id} and app.gaming_date(reading_at) = app.gaming_date(now())
   order by reading_at desc limit 1
`.then((f) => f[0]?.monto ?? null);

const limpiar = (ids) => sql`
  delete from app.jackpot_readings
   where machine_id = any(${ids}::uuid[])
     and app.gaming_date(reading_at) = app.gaming_date(now())
`;

const maquinas = await sql`select id, name from app.machines where active order by bank_number, name limit 2`;
if (maquinas.length < 2) {
  console.error('Hacen falta al menos dos máquinas activas en la base local.');
  process.exit(2);
}
const [otra, mia] = maquinas;
const ids = maquinas.map((m) => m.id);

const nav = await chromium.launch({ executablePath: CHROME });
const pagina = await nav.newPage();

try {
  await limpiar(ids);

  await pagina.goto(`${BASE}/admin/entrar`, { waitUntil: 'networkidle' });
  await pagina.getByLabel(/Contraseña/i).fill(leerEnv('ADMIN_PASSWORD'));
  await pagina.getByRole('button', { name: /ENTRAR/i }).click();
  await pagina.waitForURL(/\/admin(\/|$)/, { timeout: 15_000 });

  const abrirPanel = async () => {
    // "Escribir montos" ya es la pestaña de entrada al abrir: pulsarla la
    // cerraba y dejaba la pantalla sin casillas.
    // 'domcontentloaded' y no 'networkidle': el panel deja peticiones vivas
    // —revalidación de rutas— y esperar a que la red calle se queda colgado.
    // Lo que hay que esperar es la casilla, y eso se espera abajo.
    await pagina.goto(`${BASE}/admin/jackpots`, { waitUntil: 'domcontentloaded' });
    await pagina.getByLabel(new RegExp(`Premio de ${mia.name}`, 'i')).first().waitFor({ timeout: 15_000 });
  };
  const guardar = async () => {
    // El botón se llama "Publicar en la página": el "Guardar" de cada fila es
    // el de editar el nombre de la máquina, que es otra cosa.
    await pagina.getByRole('button', { name: /Publicar en la página/i }).first().click();
    await pagina.waitForTimeout(2500);
    return (await pagina.locator('body').innerText()).replace(/\s+/g, ' ');
  };
  const escribir = (m, v) =>
    pagina.getByLabel(new RegExp(`Premio de ${m.name}`, 'i')).first().fill(v);

  console.log('\n▶ La pestaña vieja contra el trabajo del otro');
  await abrirPanel();                       // se abre con las dos casillas vacías
  await sql`
    insert into app.jackpot_readings (machine_id, amount_cents, reading_at)
    values (${otra.id}, 777700, now())
  `;                                        // el otro empleado escribe su monto
  await escribir(mia, '123.45');            // yo escribo el mío en la pestaña vieja
  await guardar();

  comprobar((await hoyDe(otra.id)) === '777700',
    `el monto de "${otra.name}", escrito por otro, SIGUE AHÍ`,
    `quedó: ${await hoyDe(otra.id)}`);
  comprobar((await hoyDe(mia.id)) === '12345', 'y el mío se guardó', `quedó: ${await hoyDe(mia.id)}`);

  console.log('\n▶ Guardar sin tocar nada');
  await abrirPanel();
  const aviso = await guardar();
  comprobar(/No cambiaste ningún monto/.test(aviso), 'lo dice, en vez de fingir un guardado', aviso.slice(0, 200));
  comprobar((await hoyDe(otra.id)) === '777700', 'y no borra nada por el camino');

  console.log('\n▶ Vaciar una casilla sigue quitando el monto');
  await abrirPanel();
  await escribir(mia, '');
  const aviso2 = await guardar();
  comprobar((await hoyDe(mia.id)) === null, 'el monto se fue del tablero, que es para lo que existe el borrado');
  comprobar(/deja[n]? de salir en el tablero/.test(aviso2), 'y se anuncia como retirada, no como "0 publicados"', aviso2.slice(0, 200));
  comprobar((await hoyDe(otra.id)) === '777700', 'sin llevarse por delante el del otro');
} finally {
  await nav.close();
  await limpiar(ids);
  await sql.end();
}

console.log(fallos === 0 ? '\n✓ todo bien\n' : `\n✗ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
