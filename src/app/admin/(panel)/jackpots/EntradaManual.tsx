'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { money } from '@/lib/format';
import { Estado } from '@/components/admin/EstadoPublico';
import { estadoMaquinaJackpot, VENTANA_TABLERO_DIAS } from '@/lib/visibilidad';

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
  /** Día de la última lectura con monto de esta máquina. */
  ultimaLecturaEn: string | null;
  /** Día de la lectura más reciente del sistema, que es lo que ancla la ventana. */
  corte: string | null;
  /** El arte del juego, o null si nadie lo ha subido. Ver GestorLogos. */
  logo: string | null;
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

  // Las máquinas que el cliente NO está viendo, con la misma regla que el
  // tablero (`estadoMaquinaJackpot` espeja el filtro de `getJackpots`).
  const fuera = maquinas.filter(
    (m) => !estadoMaquinaJackpot({ ultima: m.ultimaLecturaEn, corte: m.corte }).visible,
  );

  const llenos = useMemo(
    () => Object.values(valores).filter((v) => v.trim() !== '' && Number(v) > 0).length,
    [valores],
  );

  // Corregir el nombre/banco de una máquina, y quitarla del tablero.
  //
  // Faltaban las dos: el nombre y el banco se tecleaban UNA vez al crear la
  // máquina y no había forma de arreglarlos, y una máquina que salía del salón
  // se quedaba publicada para siempre. Es lo que reportó el dueño como "no se
  // puede borrar o editar el premio que ya existe".
  const [editando, setEditando] = useState<string | null>(null);
  const [edicion, setEdicion] = useState({ nombre: '', banco: '' });

  function abrirEdicion(m: MaquinaFila) {
    setEditando(m.id);
    setEdicion({ nombre: m.nombre, banco: String(m.banco) });
    setAviso(null);
  }

  async function guardarEdicion(id: string) {
    if (edicion.nombre.trim().length < 2) {
      return setAviso({ tipo: 'mal', texto: 'Escribe el nombre de la máquina.' });
    }
    // El banco se exige explícitamente. Con `parseInt(...) || 0`, dejar la
    // casilla vacía escribía un banco 0 EN SILENCIO: el cliente iba a buscar la
    // máquina al banco 0, que no existe.
    const banco = Number.parseInt(edicion.banco, 10);
    if (!Number.isFinite(banco) || banco < 0) {
      return setAviso({ tipo: 'mal', texto: 'Escribe el número de banco.' });
    }
    setGuardando(true);
    const r = await fetch('/api/admin/jackpots/manual', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        nombre: edicion.nombre.trim(),
        banco,
      }),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: 'No hay conexión.' }));
    setGuardando(false);

    if (!r.ok) return setAviso({ tipo: 'mal', texto: r.error ?? 'No pudimos guardar.' });
    setEditando(null);
    setAviso({ tipo: 'ok', texto: 'Máquina corregida.' });
    router.refresh();
  }

  async function quitar(m: MaquinaFila) {
    // Se avisa de que el historial NO se borra: es dinero, y quien lo quita
    // tiene que saber que puede volver a añadirla sin perder nada.
    if (
      !confirm(
        `¿Quitar "${m.nombre}" del tablero?\n\n` +
          'Deja de publicarse en la página. El historial de montos se guarda, ' +
          'así que se puede volver a añadir más adelante.',
      )
    ) {
      return;
    }
    setGuardando(true);
    const r = await fetch(`/api/admin/jackpots/manual?id=${m.id}`, { method: 'DELETE' })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: 'No hay conexión.' }));
    setGuardando(false);

    if (!r.ok) return setAviso({ tipo: 'mal', texto: r.error ?? 'No pudimos quitarla.' });
    setAviso({ tipo: 'ok', texto: `"${m.nombre}" ya no se publica.` });
    router.refresh();
  }

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
            Van <strong>por número de banco</strong>, en el mismo orden en que
            los ves en el salón. En la página el tablero los ordena solo, de
            mayor a menor. Para quitar un premio del tablero,{' '}
            <strong>borra la casilla y guarda</strong>.
          </p>
        </div>
        <p className="text-sm text-tenue">
          <span className="font-semibold text-cian tabular">{llenos}</span> de{' '}
          <span className="tabular">{maquinas.length}</span> con monto
        </p>
      </div>

      {/* LAS QUE SE CAYERON DEL TABLERO.
          Esta pantalla enseñaba las máquinas activas sin distinguir cuáles
          estaban publicadas, así que una máquina fuera del tablero se veía
          igual que las demás: el empleado la leía aquí con su monto y en la
          página no estaba. Y la regla que la saca no se puede adivinar —una
          máquina se cae porque se actualizó OTRA—, así que se dice entera. */}
      {fuera.length > 0 && (
        <div className="mt-5 rounded-2xl border border-dorado/40 bg-dorado/10 p-5 text-sm">
          <p className="font-semibold text-tinta">
            {fuera.length === 1
              ? 'Una máquina no está en el tablero de la página'
              : `${fuera.length} máquinas no están en el tablero de la página`}
          </p>
          <p className="mt-1.5 text-tenue">
            El tablero solo publica los montos de los últimos {VENTANA_TABLERO_DIAS}{' '}
            días, contados desde la última vez que se subió algo. Escríbeles un
            monto de hoy y vuelven a salir:
          </p>
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-tenue">
            {fuera.map((m) => (
              <li key={m.id}>
                <span className="font-medium text-tinta">{m.nombre}</span> · banco{' '}
                <span className="tabular">{m.banco}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-linea text-left text-xs uppercase tracking-wider text-tenue">
              {/* El banco primero: la lista va ordenada por él, así que es lo
                  que el ojo busca al bajar por la columna. */}
              <th className="pb-3 pr-4 font-semibold">Banco</th>
              <th className="pb-3 pr-4 font-semibold">Máquina</th>
              <th className="pb-3 pr-4 font-semibold">Ayer</th>
              <th className="pb-3 pr-4 font-semibold">Premio de hoy</th>
              <th className="pb-3 font-semibold"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {maquinas.map((m, i) => (
              <tr
                key={m.id}
                className="border-b border-linea/50"
                data-cam-item={m.nombre}
                data-cam-visible={
                  estadoMaquinaJackpot({ ultima: m.ultimaLecturaEn, corte: m.corte }).visible ? 'si' : 'no'
                }
              >
                <td className="py-2 pr-4 font-display text-lg font-semibold tabular">
                  {editando === m.id ? (
                    <input
                      value={edicion.banco}
                      onChange={(e) =>
                        setEdicion({ ...edicion, banco: e.target.value.replace(/[^0-9]/g, '') })
                      }
                      inputMode="numeric"
                      aria-label={`Banco de ${m.nombre}`}
                      className="min-h-11 w-20 rounded-lg border border-cian bg-superficie px-3 tabular focus:outline-none"
                    />
                  ) : (
                    m.banco
                  )}
                </td>
                <td className="py-2 pr-4 font-medium">
                  {editando === m.id ? (
                    <input
                      value={edicion.nombre}
                      onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })}
                      aria-label={`Nombre de ${m.nombre}`}
                      className="min-h-11 w-44 rounded-lg border border-cian bg-superficie px-3 focus:outline-none"
                    />
                  ) : (
                    <>
                      {m.nombre}
                      <div className="mt-1">
                        <Estado estado={estadoMaquinaJackpot({ ultima: m.ultimaLecturaEn, corte: m.corte })} />
                      </div>
                    </>
                  )}
                </td>
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
                      className="min-h-11 w-36 rounded-lg border border-linea bg-superficie px-3 text-right tabular focus:border-cian focus:outline-none"
                    />
                  </div>
                </td>
                <td className="py-2">
                  <div className="flex items-center justify-end gap-1">
                    {editando === m.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void guardarEdicion(m.id)}
                          disabled={guardando}
                          className="min-h-11 rounded-lg bg-cian px-3 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditando(null)}
                          className="min-h-11 rounded-lg px-3 text-xs font-semibold text-tenue hover:text-tinta"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => abrirEdicion(m)}
                          className="min-h-11 rounded-lg px-3 text-xs font-semibold text-tenue hover:text-tinta"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void quitar(m)}
                          disabled={guardando}
                          className="min-h-11 rounded-lg px-3 text-xs font-semibold text-pierde hover:underline disabled:opacity-50"
                        >
                          Quitar
                        </button>
                      </>
                    )}
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
              className="min-h-11 rounded-lg border border-linea bg-superficie px-3 focus:border-cian focus:outline-none"
            />
            <input
              value={nueva.banco}
              onChange={(e) => setNueva({ ...nueva, banco: e.target.value.replace(/[^0-9]/g, '') })}
              placeholder="# de banco"
              inputMode="numeric"
              aria-label="Número de banco"
              className="rounded-lg border border-linea bg-superficie px-3 py-2 tabular focus:border-cian focus:outline-none"
            />
            <input
              value={nueva.monto}
              onChange={(e) => setNueva({ ...nueva, monto: e.target.value.replace(/[^0-9.]/g, '') })}
              placeholder="Premio (opcional)"
              inputMode="decimal"
              aria-label="Premio de la máquina nueva"
              className="rounded-lg border border-linea bg-superficie px-3 py-2 tabular focus:border-cian focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setMostrarNueva(false)}
            className="mt-3 inline-flex min-h-11 items-center text-sm text-tenue underline underline-offset-4"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMostrarNueva(true)}
          className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-cian underline-offset-4 hover:underline"
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
        className="mt-6 w-full rounded-2xl bg-gradient-to-b from-dorado-3 to-dorado-2 px-8 py-4 font-display text-lg font-bold text-tinta disabled:opacity-50 sm:w-auto sm:px-12"
      >
        {guardando ? 'Publicando…' : 'Publicar en la página'}
      </button>
    </div>
  );
}
