#!/usr/bin/env node
/**
 * APUNTAR UN PREMIO DE OTRO DÍA, Y CORREGIR LA FECHA DE UNO YA SUBIDO.
 *
 * POR QUÉ EXISTE
 * --------------
 * El muro fechaba cada premio con el día en que se subía. El dueño lo vio en su
 * propia lista: catorce premios de septiembre, todos con la fecha de la tarde
 * en que los apuntó. Los premios se pagan un día y se apuntan otro, y esa fecha
 * no es un adorno — la página los agrupa POR SEMANAS usando ese día.
 *
 * Se prueba el camino entero contra la base: se apunta un premio del sábado
 * pasado, se comprueba que quedó guardado con esa fecha y no con la de hoy, se
 * corrige la fecha de otro ya guardado, y se comprueba que la página pública lo
 * pone en la semana que le toca.
 *
 * Uso:  npm run build && npx next start -p 3100
 *       node scripts/probar-ganadores.mjs
 *
 * Contra la base LOCAL. Limpia lo que planta, gane o falle.
 */

import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import postgres from 'postgres';
import { hoyEnPR, sumarDias } from '../src/lib/hora-pr.ts';

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

const HOY = hoyEnPR();
const SABADO = sumarDias(HOY, -6);   // el fin de semana pasado
const OTRO = sumarDias(HOY, -20);    // tres semanas atrás, otra semana del muro
const PUEBLO = 'Pruebavilla';

const limpiar = () => sql`delete from app.ganadores where pueblo = ${PUEBLO}`;
const fechaDe = (monto) => sql`
  select gano_on::text as f from app.ganadores where pueblo = ${PUEBLO} and monto_cents = ${monto}
`.then((r) => r[0]?.f ?? null);

const nav = await chromium.launch({ executablePath: CHROME });
const pagina = await nav.newPage();

try {
  await limpiar();

  await pagina.goto(`${BASE}/admin/entrar`, { waitUntil: 'domcontentloaded' });
  await pagina.getByLabel(/Contraseña/i).fill(leerEnv('ADMIN_PASSWORD'));
  await pagina.getByRole('button', { name: /ENTRAR/i }).click();
  await pagina.waitForURL(/\/admin(\/|$)/, { timeout: 15_000 });

  // Se navega y, si hace falta, se vuelve a navegar: al entrar, la propia app
  // salta al Resumen, y esa navegación del cliente pisaba a la de aquí — se
  // acababa esperando el formulario de Ganadores en la pantalla de Resumen.
  const abrir = async () => {
    for (let i = 0; i < 3; i++) {
      await pagina.goto(`${BASE}/admin/ganadores`, { waitUntil: 'domcontentloaded' });
      const salio = await pagina
        .getByLabel('Pueblo')
        .waitFor({ timeout: 8_000 })
        .then(() => true)
        .catch(() => false);
      if (salio) return;
    }
    throw new Error('no se pudo abrir /admin/ganadores');
  };

  const anadir = async (dolares, fecha) => {
    await pagina.getByLabel('Pueblo').fill(PUEBLO);
    await pagina.getByLabel('Cantidad').fill(dolares);
    await pagina.getByLabel(/Qué día cayó/i).fill(fecha);
    await pagina.getByRole('button', { name: /^Añadir$/ }).click();
    await pagina.waitForTimeout(2000);
    return (await pagina.locator('body').innerText()).replace(/\s+/g, ' ');
  };

  console.log('\n▶ Un premio del sábado, apuntado hoy');
  await abrir();
  const puestaHoy = await pagina.getByLabel(/Qué día cayó/i).inputValue();
  comprobar(puestaHoy === HOY, 'el campo viene puesto con la fecha de hoy', `traía ${puestaHoy}`);

  const aviso = await anadir('1234.56', SABADO);
  comprobar((await fechaDe(123456)) === SABADO,
    `se guardó con la fecha del sábado (${SABADO}) y NO con la de hoy`,
    `quedó: ${await fechaDe(123456)}`);
  comprobar(/ya sale en la página/.test(aviso), 'y el panel lo confirma', aviso.slice(0, 200));

  console.log('\n▶ La fecha no se limpia entre premios del mismo día');
  const sigueAhi = await pagina.getByLabel(/Qué día cayó/i).inputValue();
  comprobar(sigueAhi === SABADO,
    'después de guardar, la fecha tecleada sigue puesta para el siguiente',
    `traía ${sigueAhi}`);

  console.log('\n▶ Fechas que no pueden ser');
  // El 31 de febrero no se puede teclear por aquí: el propio campo de fecha del
  // navegador se niega a aceptarlo. Y una de mañana la para el atributo `max`
  // antes de que el formulario llegue a enviarse. Las dos son defensas que
  // salen gratis — pero ninguna es LA defensa, porque no todo el que escribe en
  // esta API es un navegador. Así que después se le pregunta a la API a bocajarro.
  await abrir();
  await pagina.getByLabel('Pueblo').fill(PUEBLO);
  await pagina.getByLabel('Cantidad').fill('50.00');
  await pagina.getByLabel(/Qué día cayó/i).fill(sumarDias(HOY, 1));
  await pagina.getByRole('button', { name: /^Añadir$/ }).click();
  await pagina.waitForTimeout(1200);

  const bloqueado = await pagina
    .getByLabel(/Qué día cayó/i)
    .evaluate((el) => el.validity.rangeOverflow);
  comprobar(bloqueado === true, 'el navegador no deja ni enviar una fecha de mañana');
  comprobar((await sql`select count(*)::int as n from app.ganadores where pueblo = ${PUEBLO}`)[0].n === 1,
    'y no se coló ninguna fila de más');

  // Y ahora sin navegador de por medio, que es como llegaría alguien de fuera.
  const alaApi = (ganoEn) =>
    pagina.evaluate(async ({ ganoEn, pueblo }) => {
      const r = await fetch('/api/admin/ganadores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pueblo, dolares: 50, ganoEn, publicado: true }),
      });
      return { status: r.status, cuerpo: await r.json() };
    }, { ganoEn, pueblo: PUEBLO });

  const manana = await alaApi(sumarDias(HOY, 1));
  comprobar(manana.status === 400 && /todavía no ha llegado/i.test(manana.cuerpo.error ?? ''),
    'la API rechaza por su cuenta una fecha de mañana', JSON.stringify(manana));

  const febrero = await alaApi('2026-02-31');
  comprobar(febrero.status === 400 && /no existe en el calendario/i.test(febrero.cuerpo.error ?? ''),
    'y el 31 de febrero, aunque el navegador no lo hubiera parado', JSON.stringify(febrero));

  comprobar((await sql`select count(*)::int as n from app.ganadores where pueblo = ${PUEBLO}`)[0].n === 1,
    'ninguna de las dos llegó a la base');

  console.log('\n▶ Corregir la fecha de uno ya subido');
  await abrir();
  await pagina.getByRole('button', { name: SABADO, exact: true }).first().click();
  await pagina.locator('input[type="date"]').nth(1).fill(OTRO);
  await pagina.getByRole('button', { name: /Guardar fecha/i }).click();
  await pagina.waitForTimeout(2000);
  comprobar((await fechaDe(123456)) === OTRO,
    `la fecha se corrigió a ${OTRO}`,
    `quedó: ${await fechaDe(123456)}`);

  console.log('\n▶ Y el muro lo pone en la semana que le toca');
  const muro = await pagina.evaluate(async (base) => {
    const r = await fetch(`${base}/ganadores`, { cache: 'no-store' });
    return r.text();
  }, BASE);
  comprobar(muro.includes('$1,234.56'), 'el premio sale en la página pública');
  comprobar(!/Esta semana[\s\S]{0,400}1,234\.56/.test(muro),
    'y NO cae en "Esta semana", que es donde estaba antes de corregirlo');
} finally {
  await nav.close();
  await limpiar();
  await sql.end();
}

console.log(fallos === 0 ? '\n✓ todo bien\n' : `\n✗ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
