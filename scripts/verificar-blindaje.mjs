#!/usr/bin/env node
/**
 * ¿SIGUE LA BASE CERRADA POR DONDE SE CERRÓ?
 *
 * POR QUÉ EXISTE
 * --------------
 * Las defensas de esta base no están en el código de la aplicación: están en la
 * propia base, puestas por migraciones, y NINGUNA se rompe con un error. Se
 * rompen en silencio y todo sigue funcionando igual:
 *
 *   - Una tabla nueva que se olvide de `enable row level security` queda
 *     legible desde internet con la clave pública, y la página no lo nota.
 *   - `create or replace function` BORRA el `search_path` que se le había
 *     fijado con `alter function ... set`. Pasó de verdad: la migración 0007 se
 *     lo puso a `app.rate_hit` —el limitador de intentos de contraseña— y las
 *     migraciones 0009 y 0017, al reescribirla, se lo llevaron por delante. Se
 *     descubrió meses después, mirando los avisos de Supabase.
 *   - Un `grant` suelto a `anon` abre una tabla entera sin tocar RLS.
 *
 * Esto lo comprueba en un segundo, contra la base que se le diga.
 *
 * CÓMO SE USA
 *
 *     node --experimental-strip-types --import ./scripts/lib/registrar-ts.mjs \
 *          scripts/verificar-blindaje.mjs
 *
 * Usa DATABASE_POOL_URL de .env.local, o sea la copia LOCAL de pruebas. Para
 * mirar producción hay que dársela a propósito por el entorno; solo lee.
 *
 * NO va en el build: el build no tiene base. Se corre a mano cuando se toca una
 * migración, que es exactamente cuando se rompe.
 */

import { readFileSync } from 'node:fs';

// .env.local a mano: este guion no pasa por Next, que es quien normalmente lo carga.
try {
  for (const linea of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(linea.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
} catch {
  /* sin .env.local: se usa lo que haya en el entorno */
}

const { sql } = await import('../src/lib/db.ts');

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? '  ok  ' : 'FALLA '} ${que}${detalle ? `\n         ${detalle}` : ''}`);
};

// --- Toda tabla de `app` con RLS -------------------------------------------
//
// Con RLS encendida y CERO políticas, nadie entra salvo `service_role`, que la
// salta por diseño. Es el estado que se busca aquí: el navegador nunca habla
// con estas tablas, solo el servidor con su llave de servicio.
const sinRls = await sql`
  select tablename from pg_tables
   where schemaname = 'app' and not rowsecurity
   order by tablename
`;
comprobar(
  sinRls.length === 0,
  'todas las tablas de app tienen RLS encendida',
  sinRls.map((t) => t.tablename).join(', '),
);

// --- Ninguna función suelta ------------------------------------------------
const sinRuta = await sql`
  select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proconfig is null
   order by p.proname
`;
comprobar(
  sinRuta.length === 0,
  'todas las funciones de app tienen search_path fijo',
  sinRuta.map((f) => `${f.proname}(${f.args})`).join(', ') +
    (sinRuta.length ? '  ← `create or replace` se lo borra: hay que volver a ponerlo' : ''),
);

// --- Ningún permiso suelto para los roles públicos -------------------------
const sueltos = await sql`
  select grantee, table_name, privilege_type
    from information_schema.role_table_grants
   where table_schema = 'app' and grantee in ('anon', 'authenticated', 'PUBLIC')
   order by table_name
`;
comprobar(
  sueltos.length === 0,
  'ni anon ni authenticated tienen permisos sobre las tablas de app',
  sueltos.map((g) => `${g.grantee}:${g.table_name}:${g.privilege_type}`).join(', '),
);

// --- La contraseña del jugador no puede guardarse en claro ------------------
//
// No basta con que la aplicación la cifre: la base tiene que RECHAZAR cualquier
// cosa que no tenga forma de hash de scrypt. Así un guion suelto, una carga
// masiva o un error de programación no pueden colar una contraseña legible.
const [{ tiene }] = await sql`
  select count(*)::int > 0 as tiene
    from pg_constraint
   where conrelid = 'app.players'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%scrypt%'
`;
comprobar(tiene, 'la base rechaza una contraseña que no sea un hash de scrypt');

await sql.end({ timeout: 5 });
console.log(`\n4 comprobaciones, ${fallos} ${fallos === 1 ? 'fallo' : 'fallos'}.`);
process.exit(fallos === 0 ? 0 : 1);
