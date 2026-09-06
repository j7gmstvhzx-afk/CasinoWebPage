import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getClientIp } from '@/lib/session';
import { verificarContrasena, crearSesionAdmin, cookieAdmin, cookieAdminBorrar } from '@/lib/admin-auth';
import { conPlazo } from '@/lib/plazo-ruta';
import { revocarSesionesAdmin } from '@/lib/revocar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

/*
 * El plazo de estas rutas. Escriben en la base, así que NO se reintentan:
 * cuando un guardado no contesta no se sabe si llegó, y repetirlo a ciegas
 * es apostar. Ver src/lib/plazo-ruta.ts.
 */
export const POST = conPlazo('entrar al panel', manejarPost);
export const DELETE = conPlazo('salir del panel', manejarDelete);

async function manejarPost(req: NextRequest) {
  const ip = await getClientIp();
  const { contrasena } = (await req.json().catch(() => ({}))) as { contrasena?: string };

  // Límite estricto: 8 intentos por hora por IP. Sin esto, una contraseña
  // compartida de mostrador se adivina por fuerza bruta en una tarde.
  const [permitido] = await sql<{ rate_hit: boolean }[]>`
    select app.rate_hit('admin_login', ${ip}, interval '1 hour', 8) as rate_hit
  `;
  if (!permitido.rate_hit) {
    return NextResponse.json(
      { ok: false, mensaje: 'Demasiados intentos. Espera una hora.' },
      { status: 429 },
    );
  }

  if (!verificarContrasena(contrasena ?? '')) {
    await sql`
      insert into app.risk_events (ip_inet, kind, score, detail)
      values (${ip}, 'admin_login_fallido', 40, '{}'::jsonb)
    `;
    return NextResponse.json({ ok: false, mensaje: 'Contraseña incorrecta.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.headers.append('Set-Cookie', cookieAdmin(await crearSesionAdmin()));
  return res;
}

async function manejarDelete() {
  // SALIR CIERRA LA SESIÓN EN EL SERVIDOR, NO SOLO EN ESTE NAVEGADOR.
  //
  // Borrar la cookie limpia el aparato que tienes delante. Mover el sello
  // invalida TODOS los tokens del panel emitidos hasta ahora, estén donde
  // estén: otra tablet, un token copiado, una pestaña olvidada. Con una
  // contraseña compartida es la semántica correcta —si se pierde un aparato,
  // salir en cualquier otro lo deja fuera— y es lo que se pidió.
  //
  // Si la base fallara, el borrado de la cookie se hace igual y se avisa: se
  // sale de este navegador aunque no se haya podido revocar en el servidor.
  // Vale más eso que devolver un error y dejar la sesión abierta también aquí.
  let revocado = true;
  try {
    await revocarSesionesAdmin();
  } catch (e) {
    revocado = false;
    console.error('[sesión] no se pudo mover el sello del panel al salir', e);
  }

  const res = NextResponse.json({ ok: true, revocado });
  res.headers.append('Set-Cookie', cookieAdminBorrar());
  return res;
}
