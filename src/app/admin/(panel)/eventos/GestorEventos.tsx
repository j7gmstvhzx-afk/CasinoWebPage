'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SubirImagen } from '@/components/admin/SubirImagen';
import { Estado } from '@/components/admin/EstadoPublico';
import { FotoEncajada } from '@/components/site/FotoEncajada';
import { longDate } from '@/lib/format';
import { estadoEvento, estadoPopup } from '@/lib/visibilidad';

export type EventoAdmin = {
  id: string;
  title: string;
  body: string | null;
  image_path: string | null;
  starts_on: string | null;
  ends_on: string | null;
  published: boolean;
  show_in_popup: boolean;
  sort_order: number;
};

type Borrador = {
  title: string;
  body: string;
  image_path: string | null;
  starts_on: string;
  ends_on: string;
  show_in_popup: boolean;
  sort_order: number;
};

const vacio = (): Borrador => ({
  title: '',
  body: '',
  image_path: null,
  starts_on: '',
  ends_on: '',
  show_in_popup: false,
  sort_order: 0,
});

const aBorrador = (e: EventoAdmin): Borrador => ({
  title: e.title,
  body: e.body ?? '',
  image_path: e.image_path,
  starts_on: e.starts_on?.slice(0, 10) ?? '',
  ends_on: e.ends_on?.slice(0, 10) ?? '',
  show_in_popup: e.show_in_popup,
  sort_order: e.sort_order,
});

export function GestorEventos({
  eventos,
  hoy,
  cargaFallida = false,
}: {
  eventos: EventoAdmin[];
  /**
   * El día de hoy en Puerto Rico, calculado en el servidor.
   *
   * Viene como prop y no se calcula aquí con `hoyEnPR()` para que el HTML del
   * servidor y el del navegador digan lo mismo: si se calculara en los dos
   * lados, en el minuto de la medianoche saldrían días distintos y React
   * avisaría de que la página no cuadra consigo misma.
   */
  hoy: string;
  /** true cuando la consulta no llegó a correr: la lista NO es de fiar. */
  cargaFallida?: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | 'nuevo' | null>(null);
  const [borrador, setBorrador] = useState<Borrador>(vacio());
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function abrirNuevo() {
    setBorrador(vacio());
    setEditando('nuevo');
    setError(null);
  }

  function abrirEdicion(e: EventoAdmin) {
    setBorrador(aBorrador(e));
    setEditando(e.id);
    setError(null);
  }

  async function llamar(metodo: 'POST' | 'PATCH' | 'DELETE', cuerpo: unknown) {
    const r = await fetch('/api/admin/contenido', {
      method: metodo,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: 'No hay conexión.' }));
    return r as { ok: boolean; error?: string };
  }

  async function guardar() {
    if (borrador.title.trim().length < 2) return setError('Escribe un título.');

    setOcupado(true);
    setError(null);

    const datos = {
      title: borrador.title.trim(),
      body: borrador.body.trim() || null,
      image_path: borrador.image_path,
      // Las fechas vacías van como null: una promoción sin fecha de fin se
      // queda publicada hasta que la quiten a mano, que es lo que hace falta
      // para las permanentes.
      starts_on: borrador.starts_on || null,
      ends_on: borrador.ends_on || null,
      show_in_popup: borrador.show_in_popup,
      sort_order: borrador.sort_order,
    };

    const r =
      editando === 'nuevo'
        ? await llamar('POST', { tipo: 'eventos', datos })
        : await llamar('PATCH', { tipo: 'eventos', id: editando, datos });

    setOcupado(false);
    if (!r.ok) return setError(r.error ?? 'No pudimos guardar.');

    setEditando(null);
    router.refresh();
  }

  async function alternarPublicado(e: EventoAdmin) {
    setOcupado(true);
    await llamar('PATCH', { tipo: 'eventos', id: e.id, datos: { published: !e.published } });
    setOcupado(false);
    router.refresh();
  }

  async function borrar(e: EventoAdmin) {
    if (!confirm(`¿Borrar "${e.title}"? Esto no se puede deshacer.`)) return;
    setOcupado(true);
    await llamar('DELETE', { tipo: 'eventos', id: e.id });
    setOcupado(false);
    router.refresh();
  }

  // Qué puesto ocupa cada promoción en la cola del pop-up.
  //
  // Solo caben cuatro; a partir de la quinta, la promoción lleva la estrella en
  // el panel y el visitante no la ve nunca. Para saber cuál se queda fuera hay
  // que contar en el MISMO orden que la consulta pública (`sort_order`, y luego
  // la más nueva primero), y esta lista ya viene ordenada así por el servidor:
  // basta con recorrerla quedándose con las que califican.
  const cola = eventos.filter(
    (e) =>
      e.show_in_popup &&
      e.published &&
      (!e.starts_on || e.starts_on <= hoy) &&
      (!e.ends_on || e.ends_on >= hoy),
  );
  const puestoEnPopup = new Map(cola.map((e, i) => [e.id, i]));

  return (
    <>
      {editando === null && (
        <button
          type="button"
          onClick={abrirNuevo}
          className="mt-6 rounded-2xl bg-cian px-6 py-3 font-semibold text-white"
        >
          + Nueva promoción
        </button>
      )}

      {editando !== null && (
        <div className="tarjeta mt-6 p-6 sm:p-8">
          <h2 className="font-display text-2xl font-bold">
            {editando === 'nuevo' ? 'Nueva promoción' : 'Editar promoción'}
          </h2>

          <div className="mt-6 grid gap-6 md:grid-cols-[1fr_18rem]">
            <div className="space-y-4">
              <Campo etiqueta="Título" id="titulo">
                <input
                  id="titulo"
                  value={borrador.title}
                  onChange={(e) => setBorrador({ ...borrador, title: e.target.value })}
                  placeholder="Ej. Sorteo de Cumpleaños del Mes"
                  className={campo}
                />
              </Campo>

              <Campo etiqueta="Descripción (opcional)" id="cuerpo">
                <textarea
                  id="cuerpo"
                  rows={5}
                  value={borrador.body}
                  onChange={(e) => setBorrador({ ...borrador, body: e.target.value })}
                  placeholder="Detalles de la promoción, requisitos, horario…"
                  className={campo}
                />
              </Campo>

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Empieza (opcional)" id="inicio">
                  <input
                    id="inicio"
                    type="date"
                    value={borrador.starts_on}
                    onChange={(e) => setBorrador({ ...borrador, starts_on: e.target.value })}
                    className={campo}
                  />
                </Campo>
                <Campo etiqueta="Termina (opcional)" id="fin">
                  <input
                    id="fin"
                    type="date"
                    value={borrador.ends_on}
                    onChange={(e) => setBorrador({ ...borrador, ends_on: e.target.value })}
                    className={campo}
                  />
                </Campo>
              </div>

              <p className="text-xs text-tenue">
                Al pasar la fecha de fin, la promoción desaparece sola de la
                página. Si la dejas en blanco, se queda hasta que la quites.
              </p>

              {/* Lo que decide si el arte se le enseña a TODO el que entra. */}
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-dorado/40 bg-dorado/5 p-4">
                <input
                  type="checkbox"
                  checked={borrador.show_in_popup}
                  onChange={(e) =>
                    setBorrador({ ...borrador, show_in_popup: e.target.checked })
                  }
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-linea bg-superficie accent-dorado"
                />
                <span className="text-sm">
                  <span className="font-semibold text-dorado">
                    Mostrar al entrar a la página
                  </span>
                  <span className="mt-1 block text-tenue">
                    El visitante ve este arte antes de poder usar la
                    tragamonedas. Marca solo una o dos: si son muchas, la gente
                    cierra en vez de leerlas.
                  </span>
                </span>
              </label>
            </div>

            <div>
              <p className="mb-1.5 block text-sm font-medium text-tinta">Arte de la promoción</p>
              <SubirImagen
                carpeta="eventos"
                valor={borrador.image_path}
                onCambio={(ruta) => setBorrador({ ...borrador, image_path: ruta })}
              />
              <p className="mt-2 text-xs text-tenue">
                Se ve mejor vertical, como los flyers que ya usan en redes.
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-5 text-sm text-pierde">
              {error}
            </p>
          )}

          {/* Lo que pasa al guardar, dicho antes de guardar.
              Una promoción nueva nace PUBLICADA (la columna trae `default
              true` y el formulario no manda nada), así que se ve en la página
              en cuanto se pulsa Guardar. El formulario no lo decía en ninguna
              parte: quien preparaba una para el sábado la estaba publicando. */}
          {editando === 'nuevo' && (
            <p className="mt-5 text-sm text-tenue">
              Al guardar, la promoción <strong className="text-tinta">sale en la
              página enseguida</strong>. Si quieres prepararla para más adelante,
              guárdala y púlsale &laquo;Ocultar&raquo; en la lista.
            </p>
          )}

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={guardar}
              disabled={ocupado}
              className="rounded-2xl bg-gradient-to-b from-dorado-3 to-dorado-2 px-8 py-3.5 font-display font-bold text-tinta disabled:opacity-50"
            >
              {ocupado ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => setEditando(null)}
              className="rounded-2xl border border-linea px-8 py-3.5 font-medium text-tenue"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <h2 className="mt-12 font-display text-2xl font-bold">
        Promociones{cargaFallida ? '' : ` (${eventos.length})`}
      </h2>

      {cargaFallida ? (
        <p className="tarjeta mt-5 px-6 py-12 text-center text-tenue">
          No se pudo leer la lista. Recarga la página para verla.
        </p>
      ) : eventos.length === 0 ? (
        <p className="tarjeta mt-5 px-6 py-12 text-center text-tenue">
          Todavía no hay promociones. Crea la primera con el botón de arriba.
        </p>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {eventos.map((e) => (
            <li
              key={e.id}
              className="tarjeta overflow-hidden"
              data-cam-item={e.title}
              data-cam-visible={estadoEvento(e, hoy).visible ? 'si' : 'no'}
            >
              {e.image_path ? (
                <FotoEncajada src={e.image_path} alt={e.title} proporcion="aspect-[4/5]" />
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center bg-gradient-to-br from-superficie to-superficie-2">
                  <span className="px-4 text-center text-sm text-tenue">Sin arte todavía</span>
                </div>
              )}

              <div className="p-5">
                <h3 className="font-display font-semibold">{e.title}</h3>

                {/* El estado de verdad, no el valor crudo de la columna.
                    Una promoción vencida sale aquí como "Ya terminó" aunque
                    `published` siga en true: es lo que ve el cliente, que es lo
                    único que importa desde esta pantalla. */}
                <div className="mt-2">
                  <Estado estado={estadoEvento(e, hoy)} />
                </div>

                {(() => {
                  const popup = estadoPopup(e, puestoEnPopup.get(e.id) ?? 99, hoy);
                  return popup ? (
                    <div className="mt-2">
                      <Estado estado={popup} />
                    </div>
                  ) : null;
                })()}

                {(e.starts_on || e.ends_on) && (
                  <p className="mt-1.5 text-xs text-cian">
                    {e.starts_on ? longDate(e.starts_on) : '—'}
                    {e.ends_on ? ` → ${longDate(e.ends_on)}` : ''}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => abrirEdicion(e)}
                    className="inline-flex min-h-11 items-center rounded-lg border border-linea px-3 font-medium transition-colors hover:border-cian hover:text-cian"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => alternarPublicado(e)}
                    disabled={ocupado}
                    className="inline-flex min-h-11 items-center rounded-lg border border-linea px-3 font-medium text-tenue disabled:opacity-50"
                  >
                    {e.published ? 'Ocultar' : 'Publicar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => borrar(e)}
                    disabled={ocupado}
                    className="inline-flex min-h-11 items-center rounded-lg border border-linea px-3 font-medium text-tenue transition-colors hover:border-pierde hover:text-pierde disabled:opacity-50"
                  >
                    Borrar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const campo =
  'w-full rounded-xl border border-linea bg-superficie px-4 py-3 text-base text-tinta ' +
  'placeholder:text-tenue/60 focus:border-cian focus:outline-none';

function Campo({
  etiqueta,
  id,
  children,
}: {
  etiqueta: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-tinta">
        {etiqueta}
      </label>
      {children}
    </div>
  );
}
