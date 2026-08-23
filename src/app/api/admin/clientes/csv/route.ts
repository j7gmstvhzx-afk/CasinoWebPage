import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { esAdmin } from '@/lib/admin-auth';
import { formatPhone } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

/**
 * Exportación de la lista de clientes para mercadeo.
 *
 * Se sirve con BOM UTF-8 porque Excel en Windows, sin él, abre el CSV en la
 * codificación local y convierte "Manatí" en "ManatÃ­" — que es exactamente el
 * archivo que el personal va a abrir.
 */
export async function GET() {
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
    select p.full_name, p.phone_e164, m.name as municipality, p.created_at,
           (select count(*) from app.spins s where s.player_id = p.id) as tiradas,
           (select count(*) from app.wins  w where w.player_id = p.id) as premios
      from app.players p
      join app.municipalities m on m.id = p.municipality_id
     where p.blocked_at is null
     order by p.created_at desc
  `;

  const escapar = (v: string) => `"${String(v).replace(/"/g, '""')}"`;

  const lineas = [
    ['Nombre', 'Celular', 'Pueblo', 'Registrado', 'Tiradas', 'Premios'].join(','),
    ...filas.map((f) =>
      [
        escapar(f.full_name),
        escapar(formatPhone(f.phone_e164)),
        escapar(f.municipality),
        escapar(new Date(f.created_at).toISOString().slice(0, 10)),
        f.tiradas,
        f.premios,
      ].join(','),
    ),
  ];

  const fecha = new Date().toISOString().slice(0, 10);

  return new NextResponse('﻿' + lineas.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="clientes-casino-atlantico-${fecha}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
