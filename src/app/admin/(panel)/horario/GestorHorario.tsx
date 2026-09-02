'use client';

import { useState } from 'react';
import { Estado } from '@/components/admin/EstadoPublico';
import { estadoPrograma } from '@/lib/visibilidad';
import { useRouter } from 'next/navigation';
import { pedirJson } from '@/lib/fetch-json';
import { DIAS } from '@/lib/hora-pr';

/**
 * La pantalla del horario.
 *
 * Está pensada para que se parezca al cartel que hay pegado en la puerta del
 * salón: siete renglones, uno por día, y una casilla de "cerrado". Quien la
 * mantiene no es programador — si esto pareciera un editor de calendarios,
 * dejaría de usarse y el horario volvería a estar escrito a mano en el código,
 * que es de donde venimos.
 */

type FilaDia = { dia: number; abre: string | null; cierra: string | null };
type Excepcion = {
  fecha: string;
  abre: string | null;
  cierra: string | null;
  cerrado: boolean;
  motivo: string | null;
};
type Entrada = {
  id: string;
  titulo: string;
  detalle: string | null;
  dias: number[];
  desde: string;
  hasta: string;
  cortesia: boolean;
  icono: string | null;
  activo: boolean;
  orden: number;
};

const CAMPO =
  'min-h-11 rounded-lg border border-linea bg-superficie px-3 tabular focus:border-cian focus:outline-none';

/** Lunes primero: por dentro el domingo es 0, pero un cartel empieza el lunes. */
const ORDEN_CARTEL = [1, 2, 3, 4, 5, 6, 0];

/** Postgres devuelve 'HH:MM:SS'; un input type=time quiere 'HH:MM'. */
const corta = (t: string | null) => (t ? t.slice(0, 5) : '');

export function GestorHorario({
  semana,
  excepciones,
  programa,
}: {
  semana: FilaDia[];
  excepciones: Excepcion[];
  programa: Entrada[];
}) {
  return (
    <div className="mt-8 grid gap-8">
      <Semana filas={semana} />
      <Programa entradas={programa} />
      <Excepciones filas={excepciones} />
    </div>
  );
}

function Aviso({ a }: { a: { ok: boolean; texto: string } | null }) {
  if (!a) return null;
  return (
    <p role="status" className={`mt-4 text-sm ${a.ok ? 'text-gana' : 'text-pierde'}`}>
      {a.texto}
    </p>
  );
}

// -----------------------------------------------------------------------------
// El horario de la semana
// -----------------------------------------------------------------------------
function Semana({ filas }: { filas: FilaDia[] }) {
  // De LUNES a domingo, que es como se lee un horario pegado en una puerta.
  // Por dentro el índice 0 sigue siendo el domingo, como `extract(dow)` de
  // Postgres; lo que cambia es el orden en que se enseñan las filas.
  const [dias, setDias] = useState(() =>
    ORDEN_CARTEL.map((d) => {
      const f = filas.find((x) => x.dia === d);
      return { dia: d, abre: corta(f?.abre ?? null), cierra: corta(f?.cierra ?? null) };
    }),
  );
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  function cambiar(d: number, campo: 'abre' | 'cierra', valor: string) {
    setDias((v) => v.map((x) => (x.dia === d ? { ...x, [campo]: valor } : x)));
  }

  function alternarCerrado(d: number) {
    setDias((v) =>
      v.map((x) =>
        x.dia === d
          ? x.abre || x.cierra
            ? { ...x, abre: '', cierra: '' }
            : { ...x, abre: '08:00', cierra: '00:00' }
          : x,
      ),
    );
  }

  async function guardar() {
    setAviso(null);
    // O las dos horas o ninguna: media fila da un horario que no se puede
    // pintar ("abre a las 8:00 y cierra a las …").
    const media = dias.find((d) => Boolean(d.abre) !== Boolean(d.cierra));
    if (media) {
      return setAviso({
        ok: false,
        texto: `El ${DIAS[media.dia]} tiene solo una hora. Pon las dos, o marca el día como cerrado.`,
      });
    }

    setGuardando(true);
    try {
      await pedirJson('/api/admin/horario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          que: 'semana',
          dias: dias.map((d) => ({
            dia: d.dia,
            abre: d.abre || null,
            cierra: d.cierra || null,
          })),
        }),
      });
      setAviso({ ok: true, texto: 'Horario guardado. Ya está en la página.' });
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : 'No se pudo guardar.' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="tarjeta p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold">Horario de la semana</h2>
      <p className="mt-1.5 text-sm text-tenue">
        Si el casino cierra después de medianoche, escribe la hora de cierre tal
        cual: <strong className="text-tinta">8:00 a 12:00 a.m.</strong> se
        entiende como que cierra a medianoche del día siguiente.
      </p>

      <ul className="mt-5 grid gap-2.5">
        {dias.map((d) => {
          const cerrado = !d.abre && !d.cierra;
          return (
            <li key={d.dia} className="hueco flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="w-24 shrink-0 font-medium capitalize">{DIAS[d.dia]}</span>

              {cerrado ? (
                <span className="text-sm text-tenue">Cerrado</span>
              ) : (
                <span className="flex items-center gap-2 text-sm">
                  <input
                    type="time"
                    aria-label={`Hora de apertura del ${DIAS[d.dia]}`}
                    value={d.abre}
                    onChange={(e) => cambiar(d.dia, 'abre', e.target.value)}
                    className={CAMPO}
                  />
                  <span className="text-tenue">a</span>
                  <input
                    type="time"
                    aria-label={`Hora de cierre del ${DIAS[d.dia]}`}
                    value={d.cierra}
                    onChange={(e) => cambiar(d.dia, 'cierra', e.target.value)}
                    className={CAMPO}
                  />
                </span>
              )}

              <button
                type="button"
                onClick={() => alternarCerrado(d.dia)}
                className="ml-auto inline-flex min-h-11 items-center rounded-lg border border-linea px-3 text-sm hover:border-cian hover:text-cian"
              >
                {cerrado ? 'Abrir este día' : 'Marcar cerrado'}
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={guardar}
        disabled={guardando}
        className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-cian px-5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {guardando ? 'Guardando…' : 'Guardar horario'}
      </button>
      <Aviso a={aviso} />
    </section>
  );
}

// -----------------------------------------------------------------------------
// Lo que se repite cada semana
// -----------------------------------------------------------------------------
const VACIA: Omit<Entrada, 'id'> & { id?: string } = {
  titulo: '',
  detalle: '',
  dias: [0, 1, 2, 3, 4, 5, 6],
  desde: '08:00',
  hasta: '11:00',
  cortesia: true,
  icono: '☕',
  activo: true,
  orden: 0,
};

/**
 * Lo que se repite cada semana.
 *
 * Se refresca con `router.refresh()` y no con `window.location.reload()`: la
 * recarga entera volvía a pedir la página al servidor —que aquí es
 * `force-dynamic`, o sea otra consulta a la base— con su parpadeo en blanco, y
 * de paso BORRABA EL AVISO de que había salido bien. Se guardaba algo y no se
 * veía ninguna confirmación, sólo la pantalla saltando.
 */
function Programa({ entradas }: { entradas: Entrada[] }) {
  const router = useRouter();
  const [edicion, setEdicion] = useState<(Omit<Entrada, 'id'> & { id?: string }) | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  async function guardar() {
    if (!edicion) return;
    setAviso(null);
    if (edicion.titulo.trim().length < 2) return setAviso({ ok: false, texto: 'Ponle un nombre.' });
    if (edicion.dias.length === 0) return setAviso({ ok: false, texto: 'Marca al menos un día.' });

    setGuardando(true);
    try {
      await pedirJson('/api/admin/horario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ que: 'programa', ...edicion, detalle: edicion.detalle || null }),
      });
      setEdicion(null);
      setAviso({ ok: true, texto: 'Guardado. Ya sale en la portada.' });
      setGuardando(false);
      router.refresh();
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : 'No se pudo guardar.' });
      setGuardando(false);
    }
  }

  async function borrar(id: string, titulo: string) {
    if (!confirm(`¿Borrar "${titulo}"?`)) return;
    try {
      await pedirJson(`/api/admin/horario?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      setAviso({ ok: true, texto: `Borrado "${titulo}".` });
      router.refresh();
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : 'No se pudo borrar.' });
    }
  }

  return (
    <section className="tarjeta p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold">Lo que hay cada semana</h2>
      <p className="mt-1.5 max-w-2xl text-sm text-tenue">
        El café y el desayuno de cortesía, el menú del fin de semana, la música
        en vivo. Esto se repite <strong className="text-tinta">todas las semanas</strong>,
        así que se escribe una vez y ya. Para algo de una fecha suelta —un
        torneo, un sorteo— usa <strong className="text-tinta">Promociones</strong>.
      </p>

      {entradas.length > 0 && (
        <ul className="mt-5 grid gap-2.5">
          {entradas.map((e) => (
            <li key={e.id} className="hueco flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <span className="text-lg" aria-hidden="true">{e.icono ?? '•'}</span>
              <span className="font-medium">{e.titulo}</span>
              {e.cortesia && (
                <span className="rounded-full border border-dorado/45 bg-dorado/10 px-2 py-0.5 text-xs font-semibold texto-dorado">
                  gratis
                </span>
              )}
              {/* La misma etiqueta que en las demás pestañas. Decía "(apagado)",
                  que no dice dónde no sale. */}
              <Estado estado={estadoPrograma(e)} />
              <span className="text-sm tabular text-tenue">
                {corta(e.desde)}–{corta(e.hasta)} · {e.dias.length === 7 ? 'todos los días' : e.dias.map((d) => DIAS[d].slice(0, 3)).join(', ')}
              </span>
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => setEdicion({ ...e, desde: corta(e.desde), hasta: corta(e.hasta), detalle: e.detalle ?? '' })}
                  className="inline-flex min-h-11 items-center rounded-lg border border-linea px-3 text-sm hover:border-cian hover:text-cian"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => borrar(e.id, e.titulo)}
                  className="inline-flex min-h-11 items-center rounded-lg border border-linea px-3 text-sm text-pierde hover:border-pierde"
                >
                  Borrar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {edicion ? (
        <div className="mt-5 rounded-2xl border border-linea p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Qué es</span>
              <input
                value={edicion.titulo}
                onChange={(ev) => setEdicion({ ...edicion, titulo: ev.target.value })}
                placeholder="Café y desayuno de cortesía"
                className={`${CAMPO} mt-1.5 w-full`}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Icono</span>
              <input
                value={edicion.icono ?? ''}
                onChange={(ev) => setEdicion({ ...edicion, icono: ev.target.value })}
                placeholder="☕"
                className={`${CAMPO} mt-1.5 w-full`}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Desde</span>
              <input
                type="time"
                value={edicion.desde}
                onChange={(ev) => setEdicion({ ...edicion, desde: ev.target.value })}
                className={`${CAMPO} mt-1.5 w-full`}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Hasta</span>
              <input
                type="time"
                value={edicion.hasta}
                onChange={(ev) => setEdicion({ ...edicion, hasta: ev.target.value })}
                className={`${CAMPO} mt-1.5 w-full`}
              />
            </label>
          </div>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Qué días</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {ORDEN_CARTEL.map((d) => {
                const nombre = DIAS[d];
                const puesto = edicion.dias.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={puesto}
                    onClick={() =>
                      setEdicion({
                        ...edicion,
                        dias: puesto
                          ? edicion.dias.filter((x) => x !== d)
                          : [...edicion.dias, d].sort((a, b) => a - b),
                      })
                    }
                    className={`inline-flex min-h-11 items-center rounded-lg border px-3.5 text-sm capitalize ${
                      puesto ? 'border-cian bg-cian/10 font-semibold text-cian' : 'border-linea text-tenue'
                    }`}
                  >
                    {nombre.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-4 flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={edicion.cortesia}
                onChange={(ev) => setEdicion({ ...edicion, cortesia: ev.target.checked })}
                className="h-5 w-5"
              />
              Es gratis / de cortesía
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={edicion.activo}
                onChange={(ev) => setEdicion({ ...edicion, activo: ev.target.checked })}
                className="h-5 w-5"
              />
              Sale en la página
            </label>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="inline-flex min-h-11 items-center rounded-xl bg-cian px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => setEdicion(null)}
              className="inline-flex min-h-11 items-center rounded-xl border border-linea px-5 text-sm"
            >
              Cancelar
            </button>
          </div>
          <Aviso a={aviso} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEdicion({ ...VACIA })}
          className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-linea px-5 text-sm font-medium hover:border-cian hover:text-cian"
        >
          Añadir algo que se repite
        </button>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Días sueltos que no siguen el horario
// -----------------------------------------------------------------------------
/**
 * Los días sueltos que no siguen el horario semanal.
 *
 * `guardando` no estaba y sí lo tenían Semana y Programa: el botón se podía
 * pulsar dos veces seguidas, sin quedar desactivado ni dar señal de estar
 * trabajando. Igual que los otros dos bloques, ahora se cierra mientras va la
 * petición.
 */
function Excepciones({ filas }: { filas: Excepcion[] }) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [fecha, setFecha] = useState('');
  const [cerrado, setCerrado] = useState(true);
  const [abre, setAbre] = useState('08:00');
  const [cierra, setCierra] = useState('00:00');
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  async function guardar() {
    setAviso(null);
    if (!fecha) return setAviso({ ok: false, texto: 'Escoge la fecha.' });
    setGuardando(true);
    try {
      await pedirJson('/api/admin/horario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          que: 'excepcion',
          fecha,
          cerrado,
          abre: cerrado ? null : abre,
          cierra: cerrado ? null : cierra,
          motivo: motivo || null,
        }),
      });
      setAviso({ ok: true, texto: `Guardado el ${fecha}.` });
      setGuardando(false);
      router.refresh();
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : 'No se pudo guardar.' });
      setGuardando(false);
    }
  }

  async function borrar(f: string) {
    try {
      await pedirJson(`/api/admin/horario?fecha=${encodeURIComponent(f)}`, { method: 'DELETE' });
      setAviso({ ok: true, texto: `Quitado el ${f}.` });
      router.refresh();
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : 'No se pudo borrar.' });
    }
  }

  return (
    <section className="tarjeta p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold">Días sueltos</h2>
      <p className="mt-1.5 max-w-2xl text-sm text-tenue">
        Un día de fiesta, un cierre por mantenimiento, una noche que se cierra
        más tarde. Lo que pongas aquí manda sobre el horario de la semana, solo
        para esa fecha.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-[11rem_1fr_auto] sm:items-end">
        <label className="block text-sm">
          <span className="font-medium">Fecha</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={`${CAMPO} mt-1.5 w-full`}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Motivo (sale en la página)</span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Día de Reyes"
            className={`${CAMPO} mt-1.5 w-full`}
          />
        </label>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-cian px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-5">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cerrado}
            onChange={(e) => setCerrado(e.target.checked)}
            className="h-5 w-5"
          />
          Cerrado todo el día
        </label>
        {!cerrado && (
          <span className="flex items-center gap-2 text-sm">
            <input type="time" aria-label="Apertura" value={abre} onChange={(e) => setAbre(e.target.value)} className={CAMPO} />
            <span className="text-tenue">a</span>
            <input type="time" aria-label="Cierre" value={cierra} onChange={(e) => setCierra(e.target.value)} className={CAMPO} />
          </span>
        )}
      </div>

      <Aviso a={aviso} />

      {filas.length > 0 && (
        <ul className="mt-6 grid gap-2 border-t border-linea pt-5">
          {filas.map((f) => (
            <li key={f.fecha} className="hueco flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              <span className="font-medium tabular">{f.fecha}</span>
              <span className={f.cerrado ? 'text-pierde' : 'tabular'}>
                {f.cerrado ? 'Cerrado' : `${corta(f.abre)}–${corta(f.cierra)}`}
              </span>
              {f.motivo && <span className="text-tenue">{f.motivo}</span>}
              <button
                type="button"
                onClick={() => borrar(f.fecha)}
                className="ml-auto inline-flex min-h-11 items-center rounded-lg border border-linea px-3 text-pierde hover:border-pierde"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
