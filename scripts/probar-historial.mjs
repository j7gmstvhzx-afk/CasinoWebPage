/**
 * EL HISTORIAL DE LA CUENTA, CONTRA UNA BASE DE VERDAD Y UN NAVEGADOR DE VERDAD.
 *
 * POR QUÉ NO BASTA CON verificar-historial.mjs
 * --------------------------------------------
 * Aquel prueba las palabras: que un cupón vencido se diga vencido. Este prueba
 * que el CAMINO COMPLETO llegue hasta ahí — la consulta con sus tres CTE, la
 * ruta que comprueba la sesión, y la pantalla que lo pinta. Los dos fallos que
 * más miedo dan viven justo en ese camino y ninguno da error:
 *
 *   · `json_agg` de cero filas devuelve NULL, no lista vacía.
 *   · una sesión cerrada en otro aparato tiene que dejar de ver el historial.
 *
 * Se planta a mano una cuenta desechable con historia: cinco días jugados, un
 * cupón canjeado, uno vencido (pero con la columna todavía en `issued`, que es
 * la trampa), y un premio con su cupón anulado más el bueno que lo sustituye.
 *
 * Uso:  npm run build && npm start   (contra la base LOCAL, nunca producción)
 *       node scripts/probar-historial.mjs [url]
 *
 * Limpia todo lo que planta, gane o falle.
 */

import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import postgres from 'postgres';
// El generador del propio sitio, no códigos inventados: `code` lleva dígito
// verificador, y uno escrito a mano lo falla. La primera versión de esta prueba
// plantó un código a mano y la página del cupón contestó 404 — con razón.
import { generateVoucherCode } from '../src/lib/voucher.ts';

const BASE = process.argv[2] ?? process.env.BASE ?? 'http://127.0.0.1:3100';
const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// Un número válido según la NANP (el segundo grupo no puede empezar por 0 ni 1)
// y que no es de nadie: 787-236-01xx es el rango que ya usan las otras pruebas.
const CELULAR = '7872360199';
const NOMBRE = 'Prueba Historial';
const CLAVE = 'prueba-historial-9';
const CORREO_STAFF = 'prueba-historial@ejemplo.test';

/** Los cuatro cupones que se plantan: canjeado, vencido, anulado y el bueno. */
const CODIGOS = { canjeado: generateVoucherCode(), vencido: generateVoucherCode(), anulado: generateVoucherCode(), bueno: generateVoucherCode() };

function urlBase() {
  if (process.env.DATABASE_POOL_URL) return process.env.DATABASE_POOL_URL;
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const m = /^DATABASE_POOL_URL=(.*)$/m.exec(txt);
  if (!m) throw new Error('sin DATABASE_POOL_URL');
  return m[1].trim().replace(/^"|"$/g, '');
}

let fallos = 0;
const comprobar = (ok, texto, detalle = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${texto}${detalle && !ok ? `\n      ${detalle}` : ''}`);
  if (!ok) fallos++;
};

const sql = postgres(urlBase(), { prepare: false, max: 1, ssl: false });

async function limpiar() {
  const [j] = await sql`select id from app.players where phone_e164 = ${'+1' + CELULAR}`;
  if (j) {
    await sql`delete from app.voucher_events where voucher_id in (select id from app.vouchers where player_id = ${j.id})`;
    await sql`delete from app.vouchers where player_id = ${j.id}`;
    await sql`delete from app.wins where player_id = ${j.id}`;
    await sql`delete from app.risk_events where player_id = ${j.id}`;
    await sql`delete from app.spins where player_id = ${j.id}`;
    await sql`delete from app.players where id = ${j.id}`;
  }
  await sql`delete from app.staff where email = ${CORREO_STAFF}`;
}

/** Los cinco días jugados y los tres premios, plantados directo en la base. */
async function plantarHistoria(playerId) {
  const [empleado] = await sql`
    insert into app.staff (display_name, email) values ('Prueba Historial', ${CORREO_STAFF})
    on conflict (email) do update set display_name = excluded.display_name
    returning id
  `;

  // Días atrás. Los tres premios van separados 30+ días a la fuerza: la base
  // tiene una restricción de exclusión que no deja dos ventanas superpuestas.
  const atras = [71, 40, 9, 3, 1];
  const tiradas = [];
  for (const d of atras) {
    const [s] = await sql`
      insert into app.spins (player_id, gaming_date, is_winner, reels)
      -- El desplazamiento va con tipo. Sin el ::int, Postgres resuelve la resta
      -- como fecha menos FECHA, que devuelve un número de días, y entonces la
      -- columna recibe un entero donde espera una fecha.
      values (${playerId}, app.gaming_date(now()) - ${d}::int, ${[71, 40, 1].includes(d)},
              array[1,2,3]::smallint[])
      returning id, gaming_date::text as fecha
    `;
    tiradas.push({ dias: d, ...s });
  }

  const premio = async (dias, spin) => {
    const [w] = await sql`
      insert into app.wins (player_id, spin_id, gaming_date, won_at, cooldown)
      values (${playerId}, ${spin.id}, ${spin.fecha}::date,
              now() - ${`${dias} days`}::interval,
              tstzrange(now() - ${`${dias} days`}::interval,
                        now() - ${`${dias} days`}::interval + interval '30 days', '[)'))
      returning id
    `;
    return w.id;
  };

  const t = (d) => tiradas.find((x) => x.dias === d);

  // 1. Canjeado hace 71 días.
  const w1 = await premio(71, t(71));
  await sql`
    insert into app.vouchers (win_id, player_id, code, status, issued_at, expires_at, redeemed_at, redeemed_by)
    values (${w1}, ${playerId}, ${CODIGOS.canjeado}, 'redeemed',
            now() - interval '71 days', now() - interval '64 days',
            now() - interval '70 days', ${empleado.id})
  `;

  // 2. LA TRAMPA: emitido hace 40 días, venció hace 33, y la columna sigue
  //    diciendo 'issued' porque nada la cambia nunca.
  const w2 = await premio(40, t(40));
  await sql`
    insert into app.vouchers (win_id, player_id, code, status, issued_at, expires_at)
    values (${w2}, ${playerId}, ${CODIGOS.vencido}, 'issued',
            now() - interval '40 days', now() - interval '33 days')
  `;

  // 3. Ayer: uno anulado y el bueno que lo sustituye, sobre el MISMO premio.
  const w3 = await premio(1, t(1));
  await sql`
    insert into app.vouchers (win_id, player_id, code, status, issued_at, expires_at, void_reason)
    values (${w3}, ${playerId}, ${CODIGOS.anulado}, 'void',
            now() - interval '1 day', now() + interval '6 days', 'prueba')
  `;
  await sql`
    insert into app.vouchers (win_id, player_id, code, status, issued_at, expires_at)
    values (${w3}, ${playerId}, ${CODIGOS.bueno}, 'issued',
            now() - interval '1 day', now() + interval '6 days')
  `;

  return { dias: atras.length };
}

async function main() {
  await limpiar();

  const navegador = await chromium.launch({ executablePath: CHROME });
  const pagina = await navegador.newPage();
  const erroresConsola = [];
  pagina.on('console', (m) => m.type() === 'error' && erroresConsola.push(m.text()));

  try {
    console.log(`\n▶ Cuenta nueva en ${BASE}/cuenta`);
    await pagina.goto(`${BASE}/cuenta`, { waitUntil: 'networkidle' });
    await pagina.getByLabel('Nombre completo').fill(NOMBRE);
    await pagina.getByLabel('Celular').fill(CELULAR);
    await pagina.getByLabel('Pueblo').selectOption({ label: 'Manatí' });
    await pagina.getByLabel('Fecha de nacimiento').fill('1985-04-12');
    await pagina.getByLabel('Contraseña', { exact: true }).fill(CLAVE);
    await pagina.getByRole('checkbox').check();
    await pagina.getByRole('button', { name: 'CREAR MI CUENTA' }).click();
    await pagina.waitForSelector('text=/Todavía no has participado hoy/', { timeout: 15_000 });

    // Una cuenta recién hecha no tiene nada que contar, y eso también se pinta.
    await pagina.waitForSelector('text=Tu historial', { timeout: 15_000 });
    comprobar(
      await pagina.getByText('Tu primera tirada te está esperando.').isVisible(),
      'una cuenta nueva no enseña un hueco: enseña una invitación',
    );
    comprobar(
      await pagina.getByText('Todavía no has ganado').isVisible(),
      'y dice que todavía no ha ganado, sin fingir que hay premios',
    );
    comprobar(
      (await pagina.getByRole('heading', { name: 'Tus premios' }).count()) === 0,
      'sin premios no sale la lista de premios (json_agg de cero filas no revienta)',
    );

    console.log('\n▶ Con historia plantada');
    const [j] = await sql`select id from app.players where phone_e164 = ${'+1' + CELULAR}`;
    const { dias } = await plantarHistoria(j.id);

    await pagina.reload({ waitUntil: 'networkidle' });
    await pagina.waitForSelector('text=Tus premios', { timeout: 15_000 });

    const texto = await pagina.locator('body').innerText();

    comprobar(new RegExp(`${dias} días`).test(texto), `cuenta los ${dias} días jugados`, texto.slice(0, 200));
    comprobar(/Desde el /.test(texto), 'y dice desde cuándo');

    // 25 + 25 + 25 = 75. El anulado NO suma.
    comprobar(/\$75\b/.test(texto), 'suma $75: los tres cupones buenos, sin contar el anulado');
    comprobar(!/\$100\b/.test(texto), 'y NO suma $100, que sería contar el anulado');
    comprobar(/Has ganado 3 veces/.test(texto), 'dice 3 veces, no 4: el anulado y su reemplazo son un premio');

    // `innerText` devuelve lo que se VE, y estas etiquetas van en versalitas por
    // CSS: comparar con mayúsculas y minúsculas las daba todas por ausentes.
    const etiquetas = (await pagina.locator('li p').allInnerTexts()).map((e) => e.toLowerCase());
    const hay = (t) => etiquetas.some((e) => e.includes(t.toLowerCase()));
    comprobar(hay('Canjeado'), 'el canjeado se dice canjeado');
    comprobar(
      hay('Venció sin canjear'),
      'EL VENCIDO SE DICE VENCIDO aunque la columna siga en "issued"',
      etiquetas.join(' | '),
    );
    comprobar(hay('Anulado'), 'el anulado se dice anulado');
    comprobar(hay('Listo para canjear'), 'y el bueno, listo para canjear');

    const enlaces = await pagina.locator('li a[href^="/premio/"]').all();
    comprobar(enlaces.length === 1, `solo el cupón vivo lleva enlace (salieron ${enlaces.length})`);
    const href = await enlaces[0]?.getAttribute('href');
    comprobar(href === `/premio/${CODIGOS.bueno}`, 'y es el del cupón bueno, no el del anulado', String(href));

    const orden = await pagina.locator('li p').allInnerTexts();
    comprobar(
      orden[orden.length - 1].toLowerCase().includes('canjeado'),
      'los premios salen del más reciente al más antiguo (el canjeado es el más viejo)',
      orden.join(' | '),
    );
    comprobar(
      /Ganaste ayer/.test(texto),
      'el premio de ayer se dice "ayer" (una fecha suelta no se corre un día)',
    );

    console.log('\n▶ Cuando el premio es de HOY');
    // El cupón de hoy ya tiene su tarjeta propia arriba. Aquí se comprueba que
    // no salga además en la lista: serían dos botones "VER CUPÓN" idénticos.
    // Hay que quitar el premio de ayer antes: la base tiene una restricción que
    // no deja dos premios del mismo jugador dentro de 30 días.
    await sql`delete from app.vouchers where player_id = ${j.id} and code in ${sql([CODIGOS.anulado, CODIGOS.bueno])}`;
    await sql`delete from app.wins where player_id = ${j.id} and gaming_date = app.gaming_date(now()) - 1`;
    const [hoySpin] = await sql`
      insert into app.spins (player_id, gaming_date, is_winner, reels)
      values (${j.id}, app.gaming_date(now()), true, array[1,1,1]::smallint[])
      on conflict (player_id, gaming_date)
        do update set is_winner = true
      returning id, gaming_date::text as fecha
    `;
    const [wHoy] = await sql`
      insert into app.wins (player_id, spin_id, gaming_date, won_at, cooldown)
      values (${j.id}, ${hoySpin.id}, ${hoySpin.fecha}::date, now(),
              tstzrange(now(), now() + interval '30 days', '[)'))
      returning id
    `;
    await sql`
      insert into app.vouchers (win_id, player_id, code, status, issued_at, expires_at)
      values (${wHoy.id}, ${j.id}, ${CODIGOS.bueno}, 'issued', now(), now() + interval '7 days')
    `;

    await pagina.reload({ waitUntil: 'networkidle' });
    await pagina.waitForSelector('text=Tu cupón de hoy', { timeout: 15_000 });
    const enLista = await pagina.locator('li a[href^="/premio/"]').count();
    comprobar(enLista === 0, `el cupón de hoy NO se repite en la lista (salieron ${enLista})`);
    const arriba = await pagina.locator(`a[href="/premio/${CODIGOS.bueno}"]`).count();
    comprobar(arriba === 1, `y sí sale una vez, en su tarjeta de arriba (salieron ${arriba})`);
    const textoHoy = await pagina.locator('body').innerText();
    comprobar(/6 días/.test(textoHoy), 'el día de hoy cuenta como día jugado (van 6)');

    console.log('\n▶ En un celular de 390 px');
    await pagina.setViewportSize({ width: 390, height: 844 });
    await pagina.waitForTimeout(400);
    const desborde = await pagina.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    // La fila de un premio lleva monto, fecha, etiqueta y botón. Es justo la
    // forma que se sale de la pantalla en un teléfono si nadie la mide.
    comprobar(desborde <= 0, `sin desborde horizontal a 390 px (sobran ${desborde} px)`);
    await pagina.screenshot({ path: '/var/lib/postgresql/16/historial-390.png', fullPage: true });
    await pagina.setViewportSize({ width: 1280, height: 900 });

    console.log('\n▶ El enlace del cupón abre');
    await pagina.goto(`${BASE}${href}`, { waitUntil: 'networkidle' });
    comprobar(
      (await pagina.locator('body').innerText()).replace(/[^0-9A-Z]/g, '').includes(CODIGOS.bueno),
      'la página del cupón enseña su código',
    );

    console.log('\n▶ Al salir, el historial se va con la sesión');
    await pagina.goto(`${BASE}/cuenta`, { waitUntil: 'networkidle' });
    await pagina.getByRole('button', { name: /Salir/i }).click();
    await pagina.waitForSelector('text=Crea tu cuenta', { timeout: 10_000 });
    const despues = await pagina.evaluate(async () => {
      const r = await fetch('/api/cuenta/historial');
      return r.json();
    });
    comprobar(
      despues.registrado === false && despues.premios === undefined,
      'una sesión cerrada NO recibe el historial, ni siquiera con la cookie vieja',
      JSON.stringify(despues).slice(0, 200),
    );

    comprobar(erroresConsola.length === 0, `sin errores de consola (${erroresConsola.length})`);
    erroresConsola.slice(0, 4).forEach((e) => console.log(`      ${e}`));
  } finally {
    await navegador.close();
    await limpiar();
    await sql.end();
  }

  console.log(fallos === 0 ? '\n✓ todo bien\n' : `\n✗ ${fallos} fallo(s)\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('\n✗ la prueba reventó:', e.message);
  await limpiar().catch(() => {});
  await sql.end().catch(() => {});
  process.exit(1);
});
