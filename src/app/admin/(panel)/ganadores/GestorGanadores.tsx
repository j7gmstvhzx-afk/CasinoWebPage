'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { pedirJson } from '@/lib/fetch-json';
import { money } from '@/lib/format';
import { Estado } from '@/components/admin/EstadoPublico';
import { estadoGanador } from '@/lib/visibilidad';

export type GanadorAdmin = {
  id: string;
  pueblo: string;
  monto_cents: string;
  gano_on: string;
  publicado: boolean;
};

const CAMPO =
  'min-h-11 w-full rounded-lg border border-linea bg-superficie px-3 focus:border-cian focus:outline-none';

/**
 * Añadir un ganador: dos campos y ya.
 *
 * Esta pantalla pedía antes nombre, pueblo, máquina, monto, fecha, foto y un
 * permiso firmado. Ahora pide el pueblo y la cantidad. La fecha la pone el
 * servidor con el día de hoy en Puerto Rico, y el permiso ya no hace falta
 * porque no se publica ningún dato personal.
 *
 * El formulario está pensado para el mostrador: se paga un premio, se teclean
 * dos cosas y sale en la página. Cuantos más campos, menos veces se hace.
 */
export function GestorGanadores({
  ganadores,
  cargaFallida = false,
}: {
  ganadores: GanadorAdmin[];
  /** true cuando la consulta no llegó a correr: la lista NO es de fiar. */
  cargaFallida?: boolean;
}) {
  const router = useRouter();
  const [pueblo, setPueblo] = useState('');
  const [dolares, setDolares] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);

    const d = Number(dolares.replace(/[^0-9.]/g, ''));
    if (pueblo.trim().length < 2) return setAviso({ ok: false, texto: 'Escribe el pueblo.' });
    if (!Number.isFinite(d) || d <= 0) return setAviso({ ok: false, texto: 'Escribe la cantidad.' });

    setGuardando(true);
    try {
      await pedirJson('/api/admin/ganadores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pueblo: pueblo.trim(), dolares: d, publicado: true }),
      });
      // `router.refresh()` y no `window.location.reload()`.
      //
      // La recarga entera volvía a pedir la página al servidor —que aquí es
      // `force-dynamic`, o sea otra consulta a la base— con su parpadeo en
      // blanco, y de paso BORRABA ESTE MISMO AVISO: se guardaba un ganador y no
      // se veía ninguna confirmación, sólo la pantalla saltando. El refresco
      // trae la lista nueva del servidor sin tirar el estado de React, así que
      // el "Guardado" se queda en pantalla el tiempo suficiente para leerlo.
      setPueblo('');
      setDolares('');
      setAviso({
        ok: true,
        // `money()` y no `toFixed(2)`: el resto del sitio escribe las cifras
        // con separador de miles, y "$1200.99" al lado de "$1,200.99" se lee
        // como dos formatos distintos para el mismo dinero.
        texto: `Guardado. ${money(Math.round(d * 100))} de ${pueblo.trim()} ya sale en la página.`,
      });
      setGuardando(false);
      router.refresh();
    } catch (err) {
      setAviso({ ok: false, texto: err instanceof Error ? err.message : 'No se pudo guardar.' });
      setGuardando(false);
    }
  }

  /**
   * Esconder un premio del muro sin destruirlo, y volver a sacarlo.
   *
   * Antes esto no existía: la única forma de que un premio dejara de salir era
   * borrarlo, y lo que estaba oculto no se podía recuperar desde el panel.
   */
  async function alternar(g: GanadorAdmin) {
    try {
      await pedirJson('/api/admin/ganadores', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: g.id, publicado: !g.publicado }),
      });
      setAviso({
        ok: true,
        texto: g.publicado
          ? `El premio de ${g.pueblo} ya no sale en la página.`
          : `El premio de ${g.pueblo} ya sale en la página.`,
      });
      router.refresh();
    } catch (err) {
      setAviso({ ok: false, texto: err instanceof Error ? err.message : 'No se pudo cambiar.' });
    }
  }

  async function borrar(g: GanadorAdmin) {
    if (!confirm(`¿Quitar ${money(Number(g.monto_cents))} de ${g.pueblo}?`)) return;
    try {
      await pedirJson(`/api/admin/ganadores?id=${encodeURIComponent(g.id)}`, { method: 'DELETE' });
      setAviso({ ok: true, texto: `Quitado el premio de ${g.pueblo}.` });
      router.refresh();
    } catch (err) {
      setAviso({ ok: false, texto: err instanceof Error ? err.message : 'No se pudo borrar.' });
    }
  }

  return (
    <div className="mt-8">
      <form onSubmit={guardar} className="tarjeta grid gap-4 p-5 sm:grid-cols-[1fr_12rem_auto] sm:items-end sm:p-6">
        <label className="block text-sm">
          <span className="font-medium">Pueblo</span>
          <input
            value={pueblo}
            onChange={(e) => setPueblo(e.target.value)}
            placeholder="Manatí"
            className={`${CAMPO} mt-1.5`}
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">Cantidad</span>
          <input
            inputMode="decimal"
            value={dolares}
            onChange={(e) => setDolares(e.target.value)}
            placeholder="1200.00"
            className={`${CAMPO} mt-1.5 tabular text-right`}
          />
        </label>

        <button
          type="submit"
          disabled={guardando}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-cian px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Añadir'}
        </button>
      </form>

      {aviso && (
        <p role="status" className={`mt-4 text-sm ${aviso.ok ? 'text-gana' : 'text-pierde'}`}>
          {aviso.texto}
        </p>
      )}

      {cargaFallida ? (
        <p className="tarjeta mt-8 px-6 py-12 text-center text-tenue">
          No se pudo leer la lista. Recarga la página para verla.
        </p>
      ) : ganadores.length === 0 ? (
        /* Este estado vacío no existía: con cero premios la pantalla no decía
           nada, y un hueco en blanco se lee como una pantalla rota. */
        <p className="tarjeta mt-8 px-6 py-12 text-center text-tenue">
          Todavía no has añadido ningún premio. El primero sale en el muro en
          cuanto lo guardes aquí arriba.
        </p>
      ) : (
        <ul className="mt-8 grid gap-2.5">
          {ganadores.map((g) => (
            <li
              key={g.id}
              className="hueco flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm"
              data-cam-item={money(Number(g.monto_cents))}
              data-cam-visible={estadoGanador(g).visible ? 'si' : 'no'}
            >
              <span className="font-semibold tabular texto-dorado">{money(Number(g.monto_cents))}</span>
              <span className="font-medium">{g.pueblo}</span>
              <span className="tabular text-tenue">{g.gano_on}</span>
              <Estado estado={estadoGanador(g)} />
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => alternar(g)}
                  className="inline-flex min-h-11 items-center rounded-lg border border-linea px-3 font-medium text-tenue hover:border-cian hover:text-cian"
                >
                  {g.publicado ? 'Ocultar' : 'Publicar'}
                </button>
                <button
                  type="button"
                  onClick={() => borrar(g)}
                  className="inline-flex min-h-11 items-center rounded-lg border border-linea px-3 text-pierde hover:border-pierde"
                >
                  Quitar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
