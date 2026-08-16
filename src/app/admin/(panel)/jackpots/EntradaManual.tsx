'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { money } from '@/lib/format';

/**
 * Entrada manual de los montos del día.
 *
 * Es la vía principal para actualizar los progresivos: el personal los lee del
 * salón y los escribe aquí. No suben solos.
 *
 * Pensado para teclear rápido: se escribe el monto, se aprieta Enter (o Tab) y
 * el foco salta al siguiente. Las máquinas van en el mismo orden que el tablero
 * público — de mayor a menor — para que cuadre con lo que el cliente ve.
 */

export type MaquinaFila = {
  id: string;
  nombre: string;
  banco: number;
  centavosHoy: number | null;
  centavosPrevio: number | null;
};

export function EntradaManual({ maquinas }: { maquinas: MaquinaFila[] }) {
  const router = useRouter();

  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      maquinas.map((m) => [m.id, m.centavosHoy === null ? '' : (m.centavosHoy / 100).toFixed(2)]),
    ),
  );
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'mal'; texto: string } | null>(null);

  const [nueva, setNueva] = useState({ nombre: '', banco: '', monto: '' });
  const [mostrarNueva, setMostrarNueva] = useState(false);

  const llenos = useMemo(
    () => Object.values(valores).filter((v) => v.trim() !== '' && Number(v) > 0).length,
    [valores],
  );

  function aCentavos(v: string): number | null {
    const limpio = v.replace(/[^0-9.]/g, '');
    if (!limpio) return null;
    const n = Number.parseFloat(limpio);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);

    const cuerpo: Record<string, unknown> = {
      montos: maquinas.map((m) => ({ id: m.id, centavos: aCentavos(valores[m.id] ?? '') })),
    };

    if (mostrarNueva && nueva.nombre.trim() && nueva.banco.trim()) {
      cuerpo.nueva = {
        nombre: nueva.nombre.trim(),
        banco: Number.parseInt(nueva.banco, 10),
        centavos: aCentavos(nueva.monto),
      };
    }

    const r = await fetch('/api/admin/jackpots/manual', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: 'No hay conexión.' }));

    setGuardando(false);

    if (!r.ok) return setAviso({ tipo: 'mal', texto: r.error });

    setAviso({
      tipo: 'ok',
      texto: `${r.guardados} premio${r.guardados === 1 ? '' : 's'} publicado${
        r.guardados === 1 ? '' : 's'
      } en la página.`,
    });
    setNueva({ nombre: '', banco: '', monto: '' });
    setMostrarNueva(false);
    router.refresh();
  }

  /** Enter salta al siguiente campo en vez de enviar el formulario. */
  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const siguiente = document.querySelector<HTMLInputElement>(`[data-monto="${i + 1}"]`);
    if (siguiente) siguiente.focus();
    else void guardar();
  }

  return (
    <div className="tarjeta p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold">Montos de hoy</h2>
          <p className="mt-1.5 text-sm text-tenue">
            Escribe el premio de cada máquina. Lo que dejes en blanco no se
            publica. El tablero los ordena solo, de mayor a menor.
          </p>
        </div>
        <p className="text-sm text-tenue">
          <span className="font-semibold text-cian tabular">{llenos}</span> de{' '}
          <span className="tabular">{maquinas.length}</span> con monto
        </p>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-linea text-left text-xs uppercase tracking-wider text-tenue">
              <th className="pb-3 pr-4 font-semibold">Máquina</th>
              <th className="pb-3 pr-4 font-semibold">Banco</th>
              <th className="pb-3 pr-4 font-semibold">Ayer</th>
              <th className="pb-3 font-semibold">Premio de hoy</th>
            </tr>
          </thead>
          <tbody>
            {maquinas.map((m, i) => (
              <tr key={m.id} className="border-b border-linea/50">
                <td className="py-2 pr-4 font-medium">{m.nombre}</td>
                <td className="py-2 pr-4 tabular text-tenue">{m.banco}</td>
                <td className="py-2 pr-4 tabular text-tenue">
                  {m.centavosPrevio === null ? '—' : money(m.centavosPrevio)}
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-tenue">$</span>
                    <input
                      data-monto={i}
                      inputMode="decimal"
                      value={valores[m.id] ?? ''}
                      onChange={(e) =>
                        setValores((v) => ({ ...v, [m.id]: e.target.value.replace(/[^0-9.]/g, '') }))
                      }
                      onKeyDown={(e) => alTeclear(e, i)}
                      onFocus={(e) => e.target.select()}
                      placeholder="0.00"
                      aria-label={`Premio de ${m.nombre}, banco ${m.banco}`}
                      className="w-36 rounded-lg border border-linea bg-white/5 px-3 py-2 text-right tabular focus:border-cian focus:outline-none"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Máquina nueva */}
      {mostrarNueva ? (
        <div className="mt-6 rounded-2xl border border-cian/40 bg-cian/5 p-5">
          <p className="font-display font-semibold">Añadir una máquina</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <input
              value={nueva.nombre}
              onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
              placeholder="Nombre de la máquina"
              aria-label="Nombre de la máquina nueva"
              className="rounded-lg border border-linea bg-white/5 px-3 py-2 focus:border-cian focus:outline-none"
            />
            <input
              value={nueva.banco}
              onChange={(e) => setNueva({ ...nueva, banco: e.target.value.replace(/[^0-9]/g, '') })}
              placeholder="# de banco"
              inputMode="numeric"
              aria-label="Número de banco"
              className="rounded-lg border border-linea bg-white/5 px-3 py-2 tabular focus:border-cian focus:outline-none"
            />
            <input
              value={nueva.monto}
              onChange={(e) => setNueva({ ...nueva, monto: e.target.value.replace(/[^0-9.]/g, '') })}
              placeholder="Premio (opcional)"
              inputMode="decimal"
              aria-label="Premio de la máquina nueva"
              className="rounded-lg border border-linea bg-white/5 px-3 py-2 tabular focus:border-cian focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setMostrarNueva(false)}
            className="mt-3 text-sm text-tenue underline underline-offset-4"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMostrarNueva(true)}
          className="mt-6 text-sm font-medium text-cian underline-offset-4 hover:underline"
        >
          + Añadir una máquina
        </button>
      )}

      {aviso && (
        <p
          role="status"
          className={`mt-6 rounded-2xl border p-4 text-sm ${
            aviso.tipo === 'ok'
              ? 'border-gana/40 bg-gana/10 text-gana'
              : 'border-pierde/40 bg-pierde/10 text-pierde'
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <button
        type="button"
        onClick={guardar}
        disabled={guardando}
        className="mt-6 w-full rounded-2xl bg-gradient-to-b from-dorado-2 to-dorado px-8 py-4 font-display text-lg font-bold text-noche disabled:opacity-50 sm:w-auto sm:px-12"
      >
        {guardando ? 'Publicando…' : 'Publicar en la página'}
      </button>
    </div>
  );
}
