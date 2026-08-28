'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SubirImagen } from '@/components/admin/SubirImagen';
import { longDate } from '@/lib/format';

export type MaquinaAdmin = {
  id: string;
  name: string;
  description: string | null;
  image_path: string | null;
  arrived_on: string;
  bank_number: number | null;
  published: boolean;
};

type Borrador = {
  name: string;
  description: string;
  image_path: string | null;
  arrived_on: string;
  bank_number: string;
};

const hoy = () => new Date().toISOString().slice(0, 10);

const vacio = (): Borrador => ({
  name: '',
  description: '',
  image_path: null,
  arrived_on: hoy(),
  bank_number: '',
});

export function GestorMaquinas({ maquinas }: { maquinas: MaquinaAdmin[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | 'nuevo' | null>(null);
  const [b, setB] = useState<Borrador>(vacio());
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function llamar(metodo: 'POST' | 'PATCH' | 'DELETE', cuerpo: unknown) {
    return (await fetch('/api/admin/contenido', {
      method: metodo,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: 'No hay conexión.' }))) as {
      ok: boolean;
      error?: string;
    };
  }

  async function guardar() {
    if (b.name.trim().length < 2) return setError('Escribe el nombre de la máquina.');

    setOcupado(true);
    setError(null);

    const datos = {
      name: b.name.trim(),
      description: b.description.trim() || null,
      image_path: b.image_path,
      arrived_on: b.arrived_on || hoy(),
      bank_number: b.bank_number ? Number.parseInt(b.bank_number, 10) : null,
    };

    const r =
      editando === 'nuevo'
        ? await llamar('POST', { tipo: 'maquinas', datos })
        : await llamar('PATCH', { tipo: 'maquinas', id: editando, datos });

    setOcupado(false);
    if (!r.ok) return setError(r.error ?? 'No pudimos guardar.');

    setEditando(null);
    router.refresh();
  }

  async function alternar(m: MaquinaAdmin) {
    setOcupado(true);
    await llamar('PATCH', { tipo: 'maquinas', id: m.id, datos: { published: !m.published } });
    setOcupado(false);
    router.refresh();
  }

  async function borrar(m: MaquinaAdmin) {
    if (!confirm(`¿Borrar "${m.name}"? Esto no se puede deshacer.`)) return;
    setOcupado(true);
    await llamar('DELETE', { tipo: 'maquinas', id: m.id });
    setOcupado(false);
    router.refresh();
  }

  return (
    <>
      {editando === null && (
        <button
          type="button"
          onClick={() => {
            setB(vacio());
            setEditando('nuevo');
            setError(null);
          }}
          className="mt-6 rounded-2xl bg-cian px-6 py-3 font-semibold text-white"
        >
          + Añadir máquina nueva
        </button>
      )}

      {editando !== null && (
        <div className="tarjeta mt-6 p-6 sm:p-8">
          <h2 className="font-display text-2xl font-bold">
            {editando === 'nuevo' ? 'Máquina nueva' : 'Editar máquina'}
          </h2>

          <div className="mt-6 grid gap-6 md:grid-cols-[1fr_18rem]">
            <div className="space-y-4">
              <Campo etiqueta="Nombre" id="nombre">
                <input
                  id="nombre"
                  value={b.name}
                  onChange={(e) => setB({ ...b, name: e.target.value })}
                  placeholder="Ej. Ultimate Fire Link"
                  className={campo}
                />
              </Campo>

              <Campo etiqueta="Descripción (opcional)" id="desc">
                <textarea
                  id="desc"
                  rows={4}
                  value={b.description}
                  onChange={(e) => setB({ ...b, description: e.target.value })}
                  placeholder="Qué la hace especial, tipo de bono, jackpot enlazado…"
                  className={campo}
                />
              </Campo>

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Fecha de llegada" id="llegada">
                  <input
                    id="llegada"
                    type="date"
                    value={b.arrived_on}
                    onChange={(e) => setB({ ...b, arrived_on: e.target.value })}
                    className={campo}
                  />
                </Campo>
                <Campo etiqueta="# de banco (opcional)" id="banco">
                  <input
                    id="banco"
                    inputMode="numeric"
                    value={b.bank_number}
                    onChange={(e) =>
                      setB({ ...b, bank_number: e.target.value.replace(/[^0-9]/g, '') })
                    }
                    placeholder="Ej. 45"
                    className={`${campo} tabular`}
                  />
                </Campo>
              </div>

              <p className="text-xs text-tenue">
                El badge NUEVA se pone y se quita solo: dura 30 días desde la
                fecha de llegada.
              </p>
            </div>

            <div>
              <p className="mb-1.5 block text-sm font-medium text-tinta">Foto de la máquina</p>
              <SubirImagen
                carpeta="maquinas"
                valor={b.image_path}
                onCambio={(ruta) => setB({ ...b, image_path: ruta })}
                proporcion="aspect-[16/10]"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-5 text-sm text-pierde">
              {error}
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
        Máquinas ({maquinas.length})
      </h2>

      {maquinas.length === 0 ? (
        <p className="tarjeta mt-5 px-6 py-12 text-center text-tenue">
          Todavía no has añadido ninguna máquina nueva.
        </p>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {maquinas.map((m) => (
            <li key={m.id} className="tarjeta overflow-hidden">
              {m.image_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image_path} alt={m.name} className="aspect-[16/10] w-full object-cover" />
              ) : (
                <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-superficie to-superficie-2">
                  <span className="px-4 text-center text-sm text-tenue">Sin foto todavía</span>
                </div>
              )}

              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display font-semibold">{m.name}</h3>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      m.published ? 'border-gana/40 text-gana' : 'border-linea text-tenue'
                    }`}
                  >
                    {m.published ? 'Publicada' : 'Oculta'}
                  </span>
                </div>

                <p className="mt-1.5 text-xs text-tenue">
                  Llegó el {longDate(m.arrived_on)}
                  {m.bank_number !== null ? ` · Banco ${m.bank_number}` : ''}
                </p>

                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setB({
                        name: m.name,
                        description: m.description ?? '',
                        image_path: m.image_path,
                        arrived_on: m.arrived_on.slice(0, 10),
                        bank_number: m.bank_number === null ? '' : String(m.bank_number),
                      });
                      setEditando(m.id);
                      setError(null);
                    }}
                    className="inline-flex min-h-11 items-center rounded-lg border border-linea px-3 font-medium transition-colors hover:border-cian hover:text-cian"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => alternar(m)}
                    disabled={ocupado}
                    className="inline-flex min-h-11 items-center rounded-lg border border-linea px-3 font-medium text-tenue disabled:opacity-50"
                  >
                    {m.published ? 'Ocultar' : 'Publicar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => borrar(m)}
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
