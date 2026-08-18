'use client';

import { useEffect, useRef, useState } from 'react';
import { formatVoucherCode } from '@/lib/voucher';
import { money, dateTime, longDate } from '@/lib/format';
import { formatPhone } from '@/lib/phone';

/**
 * Pantalla de canje para Servicio al Cliente.
 *
 * Está pensada para un mostrador con el cliente delante: letra grande, un solo
 * campo, y estados que se leen de un vistazo desde el otro lado de la barra.
 * Verde es "entrégale el dinero"; rojo es "no". No hay un tercer estado que
 * haya que interpretar.
 */

type Cupon = {
  code: string;
  full_name: string;
  phone_e164: string;
  municipality: string;
  amount_cents: number;
  status: string;
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
};

type Estado =
  | { t: 'vacio' }
  | { t: 'buscando' }
  | { t: 'encontrado'; cupon: Cupon; canjeable: boolean }
  | { t: 'canjeando'; cupon: Cupon }
  | { t: 'listo'; nombre: string; monto: number }
  | { t: 'error'; mensaje: string };

export type EstadoInicial =
  | { cupon: Cupon; canjeable: boolean; error?: undefined }
  | { error: string; cupon?: undefined; canjeable?: undefined }
  | null;

export function PantallaCanje({
  codigoInicial,
  inicial,
}: {
  codigoInicial?: string;
  inicial?: EstadoInicial;
}) {
  const [codigo, setCodigo] = useState(codigoInicial ?? '');
  // Cuando el empleado llega escaneando el QR, el servidor ya resolvió la
  // búsqueda y llega en `inicial`. Así no hace falta ningún efecto que dispare
  // un fetch al montar — la pantalla pinta con el cupón puesto de una vez.
  const [estado, setEstado] = useState<Estado>(() => {
    if (inicial?.cupon) {
      return { t: 'encontrado', cupon: inicial.cupon, canjeable: inicial.canjeable };
    }
    if (inicial?.error) return { t: 'error', mensaje: inicial.error };
    return { t: 'vacio' };
  });
  const entrada = useRef<HTMLInputElement>(null);

  async function buscar(valor: string) {
    if (!valor.trim()) return;
    setEstado({ t: 'buscando' });

    const r = await fetch('/api/admin/canjear', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accion: 'buscar', codigo: valor }),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false, mensaje: 'No hay conexión.' }));

    if (!r.ok) return setEstado({ t: 'error', mensaje: r.mensaje });
    setEstado({ t: 'encontrado', cupon: r.cupon, canjeable: r.canjeable });
  }

  async function canjear(cupon: Cupon) {
    setEstado({ t: 'canjeando', cupon });

    const r = await fetch('/api/admin/canjear', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accion: 'canjear', codigo: cupon.code }),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false, mensaje: 'No hay conexión.' }));

    if (!r.ok) return setEstado({ t: 'error', mensaje: r.mensaje });
    setEstado({ t: 'listo', nombre: r.nombre, monto: r.monto });
  }

  function reiniciar() {
    setCodigo('');
    setEstado({ t: 'vacio' });
    entrada.current?.focus();
  }

  // Sin código en la URL, el foco va al campo: el empleado empieza a teclear
  // sin tener que apuntar con el dedo en la tablet del mostrador.
  useEffect(() => {
    if (!codigoInicial) entrada.current?.focus();
  }, [codigoInicial]);

  return (
    <div className="mx-auto max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          buscar(codigo);
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <input
          ref={entrada}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="K7M2Q-9XB4T"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label="Código del cupón"
          className="w-full rounded-2xl border border-linea bg-superficie px-5 py-5 text-center font-display text-2xl font-bold tracking-[0.2em] tabular placeholder:text-tenue/40 focus:border-cian focus:outline-none sm:text-3xl"
        />
        <button
          type="submit"
          disabled={estado.t === 'buscando'}
          className="shrink-0 rounded-2xl bg-cian px-8 py-5 font-display text-lg font-bold text-white disabled:opacity-50"
        >
          Buscar
        </button>
      </form>

      <div className="mt-6">
        {estado.t === 'buscando' && <Aviso texto="Buscando…" tono="neutro" />}

        {estado.t === 'error' && (
          <>
            <Aviso texto={estado.mensaje} tono="malo" />
            <BotonOtro onClick={reiniciar} />
          </>
        )}

        {(estado.t === 'encontrado' || estado.t === 'canjeando') && (
          <FichaCupon
            cupon={estado.cupon}
            canjeable={estado.t === 'encontrado' && estado.canjeable}
            canjeando={estado.t === 'canjeando'}
            onCanjear={() => canjear(estado.cupon)}
            onOtro={reiniciar}
          />
        )}

        {estado.t === 'listo' && (
          <div className="rounded-3xl border-2 border-gana bg-gana/10 p-10 text-center">
            <p className="font-display text-5xl font-bold text-gana">✓ CANJEADO</p>
            <p className="mt-4 text-xl">
              Entrega <strong className="tabular">{money(estado.monto)}</strong> a
            </p>
            <p className="mt-1 font-display text-2xl font-bold">{estado.nombre}</p>
            <BotonOtro onClick={reiniciar} />
          </div>
        )}
      </div>
    </div>
  );
}

function FichaCupon({
  cupon,
  canjeable,
  canjeando,
  onCanjear,
  onOtro,
}: {
  cupon: Cupon;
  canjeable: boolean;
  canjeando: boolean;
  onCanjear: () => void;
  onOtro: () => void;
}) {
  const etiqueta: Record<string, [string, string]> = {
    issued: ['Pendiente de canje', 'border-dorado bg-dorado/10 text-dorado'],
    redeemed: ['Ya fue canjeado', 'border-pierde bg-pierde/10 text-pierde'],
    expired: ['Vencido', 'border-pierde bg-pierde/10 text-pierde'],
    void: ['Anulado', 'border-pierde bg-pierde/10 text-pierde'],
  };
  const [texto, clase] = etiqueta[cupon.status] ?? ['Desconocido', 'border-linea text-tenue'];

  return (
    <div className={`rounded-3xl border-2 p-8 ${canjeable ? 'border-dorado' : 'border-pierde/60'}`}>
      <p className={`inline-block rounded-full border px-4 py-1.5 text-sm font-semibold ${clase}`}>
        {texto}
      </p>

      <p className="mt-5 font-display text-5xl font-bold texto-dorado tabular">
        {money(cupon.amount_cents)}
      </p>

      <dl className="mt-7 space-y-3 text-base">
        <Fila e="Nombre" v={cupon.full_name} destacado />
        <Fila e="Celular" v={formatPhone(cupon.phone_e164)} />
        <Fila e="Pueblo" v={cupon.municipality} />
        <Fila e="Código" v={formatVoucherCode(cupon.code)} />
        <Fila e="Ganado" v={dateTime(cupon.issued_at)} />
        <Fila
          e={cupon.redeemed_at ? 'Canjeado' : 'Vence'}
          v={cupon.redeemed_at ? dateTime(cupon.redeemed_at) : longDate(cupon.expires_at)}
        />
      </dl>

      {canjeable ? (
        <>
          <p className="mt-7 rounded-2xl border border-linea bg-superficie p-4 text-sm text-tenue">
            Verifica que la identificación con foto coincida con el nombre antes
            de canjear. Esta acción no se puede deshacer.
          </p>
          <button
            type="button"
            onClick={onCanjear}
            disabled={canjeando}
            className="mt-4 w-full rounded-2xl bg-gradient-to-b from-dorado-3 to-dorado-2 px-8 py-5 font-display text-xl font-bold text-tinta disabled:opacity-50"
          >
            {canjeando ? 'Canjeando…' : `CANJEAR ${money(cupon.amount_cents)}`}
          </button>
        </>
      ) : (
        <p className="mt-7 rounded-2xl border border-pierde/40 bg-pierde/10 p-4 text-center font-semibold text-pierde">
          No entregues dinero por este cupón.
        </p>
      )}

      <BotonOtro onClick={onOtro} />
    </div>
  );
}

function Fila({ e, v, destacado }: { e: string; v: string; destacado?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-linea/60 pb-2">
      <dt className="text-tenue">{e}</dt>
      <dd className={`text-right ${destacado ? 'font-display text-xl font-bold' : 'font-medium'}`}>
        {v}
      </dd>
    </div>
  );
}

function Aviso({ texto, tono }: { texto: string; tono: 'neutro' | 'malo' }) {
  return (
    <div
      className={`rounded-2xl border p-6 text-center text-lg font-medium ${
        tono === 'malo' ? 'border-pierde bg-pierde/10 text-pierde' : 'border-linea text-tenue'
      }`}
    >
      {texto}
    </div>
  );
}

function BotonOtro({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 w-full rounded-2xl border border-linea px-6 py-3.5 font-medium text-tenue transition-colors hover:text-tinta"
    >
      Buscar otro cupón
    </button>
  );
}
