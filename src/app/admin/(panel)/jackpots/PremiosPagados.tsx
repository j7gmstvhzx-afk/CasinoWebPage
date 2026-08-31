'use client';

import { useId, useState } from 'react';
import { money } from '@/lib/format';
import { pedirJson } from '@/lib/fetch-json';
import type { PagoMensual as Fila } from '@/lib/queries';
import { nombreMesDe } from '@/lib/hora-pr';

/** "2026-08-01" -> "agosto de 2026". */
const nombreMes = (iso: string) => {
  const { mes, anio } = nombreMesDe(iso);
  return `${mes} de ${anio}`;
};

function mesActual(): string {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Premios pagados del mes, escritos a mano.
 *
 * Se escribe y no se deduce de las lecturas a propósito. Se puede deducir —
 * cuando un progresivo cae en picado, alguien lo pegó — pero una caída también
 * es un error de tecleo corregido al día siguiente, una máquina reiniciada por
 * mantenimiento o una que salió del salón. Y esta cifra sale en la página
 * pública como una declaración de cuánto dinero paga el casino: tiene que
 * cuadrar con la caja, no con una estimación.
 */
export function PremiosPagados({ historial }: { historial: Fila[] }) {
  const ids = useId();
  const [mes, setMes] = useState(mesActual());
  const [dolares, setDolares] = useState('');
  const [premios, setPremios] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const yaEsteMes = historial.find((h) => h.esMesActual);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);

    const d = Number(dolares.replace(/[^0-9.]/g, ''));
    const p = Number(premios);
    if (!Number.isFinite(d) || d < 0) return setAviso({ ok: false, texto: 'Escribe el monto pagado.' });
    if (!Number.isInteger(p) || p < 0) return setAviso({ ok: false, texto: 'Escribe cuántos premios fueron.' });

    setGuardando(true);
    try {
      await pedirJson('/api/admin/pagos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mes, dolares: d, premios: p }),
      });
      setAviso({ ok: true, texto: `Guardado: ${money(Math.round(d * 100))} en ${p} premios.` });
      // Recarga para que la lista de abajo y la página pública cuadren con lo
      // que se acaba de escribir.
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setAviso({ ok: false, texto: err instanceof Error ? err.message : 'No se pudo guardar.' });
    } finally {
      setGuardando(false);
    }
  }

  const campo =
    'min-h-11 w-full rounded-lg border border-linea bg-superficie px-3 tabular focus:border-cian focus:outline-none';

  return (
    <section className="tarjeta mt-8 p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold">Premios pagados del mes</h2>
      <p className="mt-1.5 text-sm text-tenue">
        Sale en la página de premios, en grande. Es la cifra que cuadra con tu
        caja: la escribes tú, no se saca de las lecturas.
      </p>

      {/* Aviso si el mes cambió y todavía no hay cifra. Sin esto, la página
          pública se queda enseñando el mes pasado sin que nadie se entere —
          bien etiquetado, pero perdiendo el mes en curso. */}
      {!yaEsteMes && (
        <p className="mt-4 flex items-start gap-2.5 rounded-2xl border border-dorado/40 bg-dorado/10 px-4 py-3 text-sm text-tinta">
          <span aria-hidden="true">📅</span>
          <span>
            Todavía no has puesto la cifra de <strong>{nombreMes(`${mes}-01`)}</strong>.
            Mientras tanto, la página enseña el último mes que tenga datos, con
            su nombre.
          </span>
        </p>
      )}

      <form onSubmit={guardar} className="mt-5 grid gap-4 sm:grid-cols-[10rem_1fr_1fr_auto] sm:items-end">
        <label className="block text-sm">
          <span className="font-medium">Mes</span>
          <input
            id={`${ids}-mes`}
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className={`${campo} mt-1.5`}
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">Total pagado</span>
          <input
            id={`${ids}-monto`}
            inputMode="decimal"
            value={dolares}
            onChange={(e) => setDolares(e.target.value)}
            placeholder="18430.00"
            className={`${campo} mt-1.5 text-right`}
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">Cuántos premios</span>
          <input
            id={`${ids}-premios`}
            inputMode="numeric"
            value={premios}
            onChange={(e) => setPremios(e.target.value.replace(/\D/g, ''))}
            placeholder="7"
            className={`${campo} mt-1.5 text-right`}
          />
        </label>

        <button
          type="submit"
          disabled={guardando}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-cian px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </form>

      {aviso && (
        <p
          role="status"
          className={`mt-4 text-sm ${aviso.ok ? 'text-gana' : 'text-pierde'}`}
        >
          {aviso.texto}
        </p>
      )}

      {historial.length > 0 && (
        <div className="mt-6 border-t border-linea pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tenue">
            Lo que ya está guardado
          </p>
          <ul className="mt-3 grid gap-2">
            {historial.map((h) => (
              <li
                key={h.mes}
                className="hueco flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm"
              >
                <span className="font-medium capitalize">{nombreMes(h.mes)}</span>
                <span className="tabular">
                  <strong className="font-semibold texto-dorado">{money(h.totalCentavos)}</strong>
                  <span className="text-tenue"> en {h.premios} premios</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
