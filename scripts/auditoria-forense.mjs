#!/usr/bin/env node
/**
 * AUDITORÍA FORENSE — SE ATACA LA APP DE VERDAD Y SE MIRA QUÉ AGUANTA.
 *
 * No es una lista de buenas intenciones: dispara payloads reales contra el
 * servidor y comprueba el resultado. Cada escenario termina en BLOQUEADO (la
 * defensa hizo su trabajo) o ENTRÓ (hay un agujero, y se nombra).
 *
 * CONTRA LA COPIA LOCAL, NUNCA CONTRA PRODUCCIÓN. Escribe basura en la base y
 * simula un atacante: eso no se hace contra los datos de los clientes. El guion
 * se niega a correr si la dirección no es local.
 *
 *     npm run build && npx next start -p 3100 &
 *     node scripts/auditoria-forense.mjs
 *
 * Un escenario que ENTRA saca código de salida 1: sirve de portero en cualquier
 * tubería. Los que aquí abajo terminan en ENTRÓ y están marcados "(esperado)"
 * son límites conocidos y escritos, no sorpresas.
 */

import { readFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3100';

if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error('NEGADO: esto ataca la app. Solo contra la copia local, jamás producción.');
  process.exit(2);
}

function clave() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  try {
    const m = /^ADMIN_PASSWORD=(.*)$/m.exec(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
    if (m) return m[1].trim().replace(/^"|"$/g, '');
  } catch { /* nada */ }
  return null;
}

let fallos = 0;

// La sesión de admin se saca UNA VEZ, al principio, antes de que el escenario de
// fuerza bruta agote el limitador de /api/admin/login. Si se pidiera después,
// llegaría 429 sin cookie y las pruebas de subida darían 401 (portero) en vez de
// 400 (validación), que es lo que de verdad se quiere medir del "virus".
let cookieAdmin = '';

const linea = (ok, esc, det = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'BLOQUEADO' : '⚠ ENTRÓ  '}  ${esc}${det ? `\n              ${det}` : ''}`);
};
const nota = (t) => console.log(`\n── ${t} ──`);

const req = async (ruta, opts = {}) => {
  const r = await fetch(`${BASE}${ruta}`, opts);
  const texto = await r.text();
  return { status: r.status, texto, headers: r.headers };
};
const json = (ruta, cuerpo, extra = {}) =>
  req(ruta, { method: 'POST', headers: { 'content-type': 'application/json', ...extra.headers }, body: JSON.stringify(cuerpo), ...extra });

// Sesión de admin para los escenarios que la necesitan (subida). Se saca aquí,
// antes de tocar nada, para que la fuerza bruta de más abajo no la deje sin
// poder entrar.
{
  const c = clave();
  if (c) {
    const r = await json('/api/admin/login', { contrasena: c });
    cookieAdmin = r.headers.get('set-cookie')?.split(';')[0] ?? '';
  }
}

// ===========================================================================
nota('1 · INYECCIÓN SQL — colar comandos por los formularios');
// ===========================================================================
{
  const cargas = [
    "' OR '1'='1",
    "'; drop table app.players; --",
    "admin'--",
    "\\'; select pg_sleep(5); --",
    "') or 1=1--",
  ];

  // Login: si la inyección funcionara, entraría sin credenciales o reventaría.
  for (const p of cargas) {
    const r = await json('/api/entrar', { celular: p, contrasena: p, nombre: p });
    const entro = r.status === 200 || /syntax|postgres|sql|pg_|column|relation/i.test(r.texto);
    linea(!entro, `login con  ${JSON.stringify(p).slice(0, 32)}`, entro ? `status ${r.status}` : `rechazado (${r.status})`);
  }

  // El cupón, que va a una consulta directa.
  for (const p of ["' or 1=1--", "1' union select code from app.vouchers--"]) {
    const r = await req(`/api/admin/canjear`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo: p }) });
    const filtro = /syntax|postgres|relation|column .* does not/i.test(r.texto);
    linea(!filtro, `canjear con ${JSON.stringify(p).slice(0, 30)}`, `status ${r.status}`);
  }

  // La prueba definitiva: la tabla sigue en pie.
  const salud = await req('/api/spin');
  linea(salud.status === 200, 'la base sobrevive: /api/spin sigue contestando 200', `status ${salud.status}`);
}

// ===========================================================================
nota('2 · CONTROL DE ACCESO — entrar al panel sin ser del personal');
// ===========================================================================
{
  const rutasAdmin = [
    ['GET', '/api/admin/clientes/csv'],
    ['POST', '/api/admin/contenido'],
    ['PATCH', '/api/admin/jackpots/logo'],
    ['POST', '/api/admin/ganadores'],
    ['POST', '/api/admin/horario'],
    ['POST', '/api/admin/jackpots/manual'],
  ];
  for (const [metodo, ruta] of rutasAdmin) {
    // GET no lleva cuerpo (undici lo prohíbe); los demás mandan {} para pasar el parseo.
    const opts = metodo === 'GET'
      ? { method: 'GET' }
      : { method: metodo, headers: { 'content-type': 'application/json' }, body: '{}' };
    const r = await req(ruta, opts);
    linea(r.status === 401, `${metodo} ${ruta} sin sesión`, `status ${r.status} (se espera 401)`);
  }

  // Cookie de admin inventada a mano.
  const r = await req('/api/admin/clientes/csv', { headers: { cookie: '__Host-cam_admin=rol.staff.firmado-por-mi' } });
  linea(r.status === 401, 'CSV con cookie de admin falsificada', `status ${r.status}`);

  // Una cookie de admin firmada pero con un secreto CUALQUIERA (jose, alg none).
  const falso = 'eyJhbGciOiJub25lIn0.eyJyb2wiOiJzdGFmZiIsImlzcyI6ImNhbS1naXZlYXdheSJ9.';
  const r2 = await req('/api/admin/clientes/csv', { headers: { cookie: `__Host-cam_admin=${falso}` } });
  linea(r2.status === 401, 'CSV con token alg=none', `status ${r2.status}`);
}

// ===========================================================================
nota('3 · FUERZA BRUTA — probar contraseñas del panel a lo bestia');
// ===========================================================================
{
  // Se limpia el limitador en la base local para partir de cero.
  let corte = 0;
  for (let i = 1; i <= 30; i++) {
    const r = await json('/api/admin/login', { contrasena: `intento-malo-${i}` });
    if (r.status === 429) { corte = i; break; }
  }
  linea(corte > 0 && corte <= 12, 'el panel corta los intentos seguidos', corte ? `cortó al intento ${corte}` : 'NO cortó en 30 intentos');
}

// ===========================================================================
nota('4 · ENUMERACIÓN — averiguar qué números son clientes');
// ===========================================================================
{
  // Tres celulares BIEN FORMADOS (prefijo válido de la numeración de EE.UU.):
  // uno que puede existir y dos que no. La defensa de verdad es que los tres den
  // la MISMA respuesta, para que el atacante no distinga un cliente de un
  // desconocido. OJO: un número MAL formado sí da 400 ("no es válido"), y eso no
  // es una fuga —dice que 111 no es un prefijo real, cosa que es pública—, así
  // que aquí se usan solo números con forma correcta.
  const claves = { contrasena: 'claveIncorrecta9' };
  const a = await json('/api/entrar', { celular: '7872223333', ...claves });
  const b = await json('/api/entrar', { celular: '7874445555', ...claves });
  const c = await json('/api/entrar', { celular: '9392224444', ...claves });
  const igual =
    a.status === b.status && b.status === c.status &&
    a.texto === b.texto && b.texto === c.texto;
  linea(
    igual,
    'tres celulares distintos y bien formados dan la MISMA respuesta',
    igual ? `los tres: ${a.status}` : `${a.status}/${b.status}/${c.status}`,
  );
}

// ===========================================================================
nota('5 · SUBIDA MALICIOSA — meter un archivo que no es una foto ("virus")');
// ===========================================================================
{
  // Con sesión de admin de verdad: así la subida llega a la validación de
  // tipo y tamaño (400 al rechazar), no se queda en el portero (401).
  const H = cookieAdmin ? { cookie: cookieAdmin } : {};
  if (!cookieAdmin) {
    console.log('  (sin sesión de admin: esta sección no pudo probar la validación)');
  }

  const subir = async (nombre, tipo, bytes) => {
    const fd = new FormData();
    fd.append('carpeta', 'galeria');
    fd.append('archivo', new File([bytes], nombre, { type: tipo }));
    return req('/api/admin/subir', { method: 'POST', headers: H, body: fd });
  };

  // Un ejecutable con nombre de foto. La firma "MZ" es la de un .exe de Windows.
  const exe = await subir('gatito.jpg', 'application/x-msdownload', new Uint8Array([0x4d, 0x5a, 0x90, 0x00]));
  linea(exe.status >= 400, 'un .exe disfrazado de .jpg', `status ${exe.status}`);

  // Un SVG con script: es "imagen" pero el navegador ejecuta su JavaScript.
  const svg = await subir('logo.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  linea(svg.status >= 400, 'un SVG con <script> dentro', `status ${svg.status}`);

  // Un HTML que se haría pasar por página del sitio.
  const html = await subir('pagina.html', 'text/html', '<html><script>fetch("http://malo")</script>');
  linea(html.status >= 400, 'un archivo HTML', `status ${html.status}`);

  // Nueve megas: por encima del tope de ocho.
  const grande = await subir('enorme.jpg', 'image/jpeg', new Uint8Array(9 * 1024 * 1024));
  linea(grande.status >= 400, 'una imagen de 9 MB (tope 8)', `status ${grande.status}`);

  // Travesía de rutas en el nombre de la carpeta.
  const fd = new FormData();
  fd.append('carpeta', '../../../etc');
  fd.append('archivo', new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
  const trav = await req('/api/admin/subir', { method: 'POST', headers: H, body: fd });
  linea(trav.status >= 400, 'carpeta "../../../etc" (travesía de rutas)', `status ${trav.status}`);
}

// ===========================================================================
nota('6 · SSRF / iframe — colar un enlace que no es de YouTube');
// ===========================================================================
{
  const { idDeYouTube } = await import('../src/lib/youtube.ts');
  const malos = [
    'javascript:alert(1)',
    'https://evil.example/embed/x',
    'https://youtube.com.evil.example/watch?v=aaaaaaaaaaa',
    '"><iframe src=http://malo>',
    'https://youtube.com/watch?v=<script>',
  ];
  for (const u of malos) {
    linea(idDeYouTube(u) === null, `idDeYouTube rechaza ${JSON.stringify(u).slice(0, 34)}`);
  }
}

// ===========================================================================
nota('7 · MENSAJES QUE FILTRAN — que un error no cuente cómo está hecho por dentro');
// ===========================================================================
{
  const r = await json('/api/entrar', { basura: true });
  const filtra = /at \/|\.ts:|\.js:|node_modules|postgres|stack|Error:/i.test(r.texto);
  linea(!filtra, 'un cuerpo inválido no devuelve una pila de errores', filtra ? 'FILTRA detalles internos' : 'mensaje limpio');
}

// ===========================================================================
nota('8 · XSS ALMACENADO — guardar <script> y que le explote a otro en la cara');
// ===========================================================================
{
  const H = cookieAdmin
    ? { headers: { 'content-type': 'application/json', cookie: cookieAdmin } }
    : null;

  if (!H) {
    console.log('  (sin sesión de admin: no se pudo probar)');
  } else {
    // Se crea una promoción cuyo TÍTULO y TEXTO son código de ataque, y se mira
    // el HTML que le llega al visitante en /eventos. Si sale el <script> vivo,
    // el navegador de cualquiera que entre lo ejecuta.
    const marca = `xss-${Date.now()}`;
    const payload = `<script>window.__ROBADO=1</script><img src=x onerror="fetch('http://malo')">`;
    const crear = await req('/api/admin/contenido', {
      method: 'POST',
      ...H,
      body: JSON.stringify({ tipo: 'eventos', datos: { title: `${payload} ${marca}`, body: payload } }),
    });
    const id = (() => { try { return JSON.parse(crear.texto).id; } catch { return null; } })();

    // La página es de caché (revalidate); publicar invalida, pero se pide con
    // un parámetro para esquivar cualquier copia intermedia.
    const pag = await req(`/eventos?anti-cache=${marca}`);
    const vivo = pag.texto.includes('<script>window.__ROBADO') || pag.texto.includes('onerror="fetch');
    const escapado = pag.texto.includes('&lt;script&gt;') || pag.texto.includes('&lt;img');
    linea(
      !vivo,
      'un <script> guardado sale ESCAPADO en la página, no ejecutable',
      vivo ? 'SALE VIVO — XSS almacenado' : escapado ? 'sale como texto (&lt;script&gt;)' : 'no aparece',
    );

    // Limpieza: se borra la promoción de prueba.
    if (id) {
      await req('/api/admin/contenido', {
        method: 'DELETE',
        ...H,
        body: JSON.stringify({ tipo: 'eventos', id }),
      });
    }
  }
}


console.log(`\n${fallos === 0 ? 'Todo aguantó.' : `${fallos} escenario(s) ENTRARON — revisar arriba.`}`);
process.exit(fallos === 0 ? 0 : 1);
