'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { money } from '@/lib/format';
import { pedirJson, ERROR_GENERICO } from '@/lib/fetch-json';
import { SubirImagen } from '@/components/admin/SubirImagen';

export type PlatoAdmin = {
  id: string;
  section_id: number;
  name: string;
  description: string | null;
  price_cents: number | null;
  image_path: string | null;
  available: boolean;
  sort_order: number;
};

export type SeccionMenu = { id: number; name: string; cortesia: boolean; nota: string | null };

type Borrador = {
  section_id: number;
  name: string;
  description: string;
  /** Se escribe en dólares, como lo piensa una persona. A centavos al guardar. */
  precio: string;
  image_path: string | null;
  sort_order: number;
};

const vacio = (seccionId: number): Borrador => ({
  section_id: seccionId,
  name: '',
  description: '',
  precio: '',
  image_path: null,
  sort_order: 0,
});

const aBorrador = (p: PlatoAdmin): Borrador => ({
  section_id: p.section_id,
  name: p.name,
  description: p.description ?? '',
  precio: p.price_cents === null ? '' : (p.price_cents / 100).toFixed(2),
  image_path: p.image_path,
  sort_order: p.sort_order,
});

/**
 * "12.50" -> 1250. Devuelve null si está vacío ("precio del día").
 *
 * Se redondea en vez de truncar: 12.005 * 100 en punto flotante da 1200.4999…,
 * y truncar convertiría $12.01 en $12.00 en la carta.
 */
function aCentavos(texto: string): number | null | 'error' {
  const limpio = texto.trim().replace(/[$,\s]/g, '');
  if (!limpio) return null;
  if (!/^\d{1,5}([.,]\d{1,2})?$/.test(limpio)) return 'error';
  return Math.round(parseFloat(limpio.replace(',', '.')) * 100);
}

export function GestorMenu({
  platos,
  secciones,
}: {
  platos: PlatoAdmin[];
  secciones: SeccionMenu[];
}) {
  const router = useRouter();
  const primeraSeccion = secciones[0]?.id ?? 1;

  const [editando, setEditando] = useState<string | 'nuevo' | null>(null);
  const [borrador, setBorrador] = useState<Borrador>(vacio(primeraSeccion));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function llamar(metodo: 'POST' | 'PATCH' | 'DELETE', cuerpo: unknown) {
    try {
      await pedirJson('/api/admin/contenido', {
        method: metodo,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : ERROR_GENERICO;
    }
  }

  async function guardar() {
    if (borrador.name.trim().length < 2) return setError('Escribe el nombre del plato.');

    const centavos = aCentavos(borrador.precio);
    if (centavos === 'error') {
      return setError('El precio tiene que ser un número, por ejemplo 12.50. Déjalo vacío para "precio del día".');
    }

    setOcupado(true);
    setError(null);

    const datos = {
      section_id: borrador.section_id,
      name: borrador.name.trim(),
      description: borrador.description.trim() || null,
      price_cents: centavos,
      image_path: borrador.image_path,
      sort_order: borrador.sort_order,
    };

    const fallo =
      editando === 'nuevo'
        ? await llamar('POST', { tipo: 'menu', datos })
        : await llamar('PATCH', { tipo: 'menu', id: editando, datos });

    setOcupado(false);
    if (fallo) return setError(fallo);

    setEditando(null);
    router.refresh();
  }

  async function alternarDisponible(p: PlatoAdmin) {
    setOcupado(true);
    await llamar('PATCH', { tipo: 'menu', id: p.id, datos: { available: !p.available } });
    setOcupado(false);
    router.refresh();
  }

  async function borrar(p: PlatoAdmin) {
    if (!confirm(`¿Borrar "${p.name}" del menú? Esto no se puede deshacer.`)) return;
    setOcupado(true);
    const fallo = await llamar('DELETE', { tipo: 'menu', id: p.id });
    setOcupado(false);
    if (fallo) return setError(fallo);
    router.refresh();
  }

  const esCortesia = secciones.find((s) => s.id === borrador.section_id)?.cortesia ?? false;

  const porSeccion = secciones.map((s) => ({
    ...s,
    platos: platos.filter((p) => p.section_id === s.id),
  }));

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => {
          setBorrador(vacio(primeraSeccion));
          setEditando('nuevo');
          setError(null);
        }}
        className="inline-flex min-h-11 items-center rounded-xl bg-gradient-to-b from-dorado-3 to-dorado-2 px-5 text-sm font-bold text-tinta"
      >
        + Añadir plato
      </button>

      {editando && (
        <div className="tarjeta mt-6 p-6">
          <h2 className="font-display text-xl font-bold">
            {editando === 'nuevo' ? 'Plato nuevo' : 'Editar plato'}
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Sección</span>
              <select
                value={borrador.section_id}
                onChange={(e) => setBorrador({ ...borrador, section_id: Number(e.target.value) })}
                className={estiloCampo}
              >
                {secciones.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">
                Precio{' '}
                <span className="font-normal text-tenue">
                  {/* En una sección de cortesía el precio no se enseña en la
                      página: lo que va por cuenta de la casa no lleva número,
                      y poner "$0.00" convertiría un regalo en una
                      transacción. Se dice aquí para que nadie se pregunte por
                      qué lo que escribió no sale. */}
                  {esCortesia ? '(esta sección es gratis: no sale precio)' : '(vacío = precio del día)'}
                </span>
              </span>
              <input
                inputMode="decimal"
                value={borrador.precio}
                onChange={(e) => setBorrador({ ...borrador, precio: e.target.value })}
                placeholder="12.50"
                className={`${estiloCampo} tabular`}
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium">Nombre del plato</span>
              <input
                value={borrador.name}
                onChange={(e) => setBorrador({ ...borrador, name: e.target.value })}
                placeholder="Ej. Mofongo con churrasco"
                className={estiloCampo}
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium">
                Descripción <span className="font-normal text-tenue">(opcional)</span>
              </span>
              <textarea
                rows={2}
                value={borrador.description}
                onChange={(e) => setBorrador({ ...borrador, description: e.target.value })}
                className={estiloCampo}
              />
            </label>

            <div className="sm:col-span-2">
              <p className="mb-1.5 block text-sm font-medium text-tinta">
                Foto <span className="font-normal text-tenue">(opcional)</span>
              </p>
              <SubirImagen
                carpeta="menu"
                valor={borrador.image_path}
                onCambio={(ruta) => setBorrador({ ...borrador, image_path: ruta })}
              />
              <p className="mt-2 text-xs text-tenue">
                Sobre todo para el menú del fin de semana: con foto se pinta en
                tarjetas y sin foto queda como una lista.
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-4 text-sm text-pierde">
              {error}
            </p>
          )}

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={guardar}
              disabled={ocupado}
              className="rounded-xl bg-cian px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {ocupado ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => setEditando(null)}
              className="rounded-xl border border-linea px-5 py-2.5 text-sm font-medium text-tenue"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 space-y-8">
        {porSeccion.map((s) => (
          <section key={s.id}>
            <h2 className="font-display text-xl font-bold text-cian">{s.name}</h2>

            {s.platos.length === 0 ? (
              <p className="mt-2 text-sm text-tenue">Sin platos en esta sección todavía.</p>
            ) : (
              <ul className="mt-3 divide-y divide-linea rounded-card border border-linea">
                {s.platos.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium ${p.available ? '' : 'text-tenue line-through'}`}>
                        {p.name}
                      </p>
                      {p.description && (
                        <p className="mt-0.5 line-clamp-1 text-sm text-tenue">{p.description}</p>
                      )}
                    </div>

                    <p className="tabular font-display font-semibold text-dorado">
                      {p.price_cents === null ? 'Precio del día' : money(p.price_cents)}
                    </p>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => alternarDisponible(p)}
                        disabled={ocupado}
                        className="inline-flex min-h-11 items-center rounded-lg border border-linea px-3 text-xs font-medium disabled:opacity-50"
                      >
                        {p.available ? 'Marcar agotado' : 'Volver a servir'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBorrador(aBorrador(p));
                          setEditando(p.id);
                          setError(null);
                        }}
                        className="rounded-lg border border-linea px-3 py-1.5 text-xs font-medium"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => borrar(p)}
                        disabled={ocupado}
                        className="rounded-lg border border-pierde/40 px-3 py-1.5 text-xs font-medium text-pierde disabled:opacity-50"
                      >
                        Borrar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

const estiloCampo =
  'w-full rounded-xl border border-linea bg-superficie px-4 py-3 text-base text-tinta ' +
  'placeholder:text-tenue/60 focus:border-cian focus:outline-none';
