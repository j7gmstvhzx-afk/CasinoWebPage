'use client';

import { useState } from 'react';
import { pedirJson } from '@/lib/fetch-json';
import { money } from '@/lib/format';
import { SubirImagen } from '@/components/admin/SubirImagen';
import { hoyEnPR } from '@/lib/hora-pr';

export type GanadorAdmin = {
  id: string;
  nombre: string;
  pueblo: string | null;
  maquina: string | null;
  monto_cents: string | null;
  gano_on: string;
  image_path: string | null;
  consentimiento_nota: string | null;
  publicado: boolean;
  orden: number;
};

type Borrador = {
  id?: string;
  nombre: string;
  pueblo: string;
  maquina: string;
  dolares: string;
  gano_on: string;
  image_path: string | null;
  consentimiento: boolean;
  consentimiento_nota: string;
  publicado: boolean;
};

const CAMPO =
  'min-h-11 w-full rounded-lg border border-linea bg-superficie px-3 focus:border-cian focus:outline-none';

const vacio = (): Borrador => ({
  nombre: '',
  pueblo: '',
  maquina: '',
  dolares: '',
  gano_on: hoyEnPR(),
  image_path: null,
  // NO viene marcado. La pregunta se hace, no se asume: aquí se publica la cara
  // y el nombre de una persona real en internet.
  consentimiento: false,
  consentimiento_nota: '',
  publicado: true,
});

export function GestorGanadores({ ganadores }: { ganadores: GanadorAdmin[] }) {
  const [edicion, setEdicion] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!edicion) return;
    setError(null);
    if (edicion.nombre.trim().length < 2) return setError('Escribe el nombre como quiere salir publicado.');
    if (!edicion.consentimiento) {
      return setError(
        'Falta el permiso. No se puede publicar el nombre ni la foto de nadie sin que la persona lo autorice.',
      );
    }

    setGuardando(true);
    try {
      await pedirJson('/api/admin/ganadores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: edicion.id,
          nombre: edicion.nombre.trim(),
          pueblo: edicion.pueblo.trim() || null,
          maquina: edicion.maquina.trim() || null,
          dolares: edicion.dolares.trim() ? Number(edicion.dolares.replace(/[^0-9.]/g, '')) : null,
          gano_on: edicion.gano_on,
          image_path: edicion.image_path,
          consentimiento: true,
          consentimiento_nota: edicion.consentimiento_nota.trim() || null,
          publicado: edicion.publicado,
        }),
      });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setGuardando(false);
    }
  }

  async function borrar(g: GanadorAdmin) {
    if (!confirm(`¿Quitar a ${g.nombre} del muro? También se borra la foto.`)) return;
    try {
      await pedirJson(`/api/admin/ganadores?id=${encodeURIComponent(g.id)}`, { method: 'DELETE' });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar.');
    }
  }

  return (
    <div className="mt-8">
      {!edicion && (
        <button
          type="button"
          onClick={() => setEdicion(vacio())}
          className="inline-flex min-h-11 items-center rounded-xl bg-cian px-5 text-sm font-semibold text-white"
        >
          Añadir un ganador
        </button>
      )}

      {edicion && (
        <div className="tarjeta p-5 sm:p-6">
          <h2 className="font-display text-xl font-bold">
            {edicion.id ? 'Editar ganador' : 'Ganador nuevo'}
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Nombre, como quiere salir</span>
              <input
                value={edicion.nombre}
                onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })}
                placeholder="Ej. María R."
                className={`${CAMPO} mt-1.5`}
              />
              <span className="mt-1.5 block text-xs text-tenue">
                No tiene que ser el nombre completo. Pregúntale cómo lo prefiere.
              </span>
            </label>

            <label className="block text-sm">
              <span className="font-medium">Pueblo</span>
              <input
                value={edicion.pueblo}
                onChange={(e) => setEdicion({ ...edicion, pueblo: e.target.value })}
                placeholder="Manatí"
                className={`${CAMPO} mt-1.5`}
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium">Máquina</span>
              <input
                value={edicion.maquina}
                onChange={(e) => setEdicion({ ...edicion, maquina: e.target.value })}
                placeholder="Lion Link"
                className={`${CAMPO} mt-1.5`}
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium">
                Monto <span className="font-normal text-tenue">(opcional)</span>
              </span>
              <input
                inputMode="decimal"
                value={edicion.dolares}
                onChange={(e) => setEdicion({ ...edicion, dolares: e.target.value })}
                placeholder="1200.00"
                className={`${CAMPO} mt-1.5 tabular text-right`}
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium">Cuándo ganó</span>
              <input
                type="date"
                max={hoyEnPR()}
                value={edicion.gano_on}
                onChange={(e) => setEdicion({ ...edicion, gano_on: e.target.value })}
                className={`${CAMPO} mt-1.5 tabular`}
              />
            </label>

            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium">
                Foto <span className="font-normal text-tenue">(opcional)</span>
              </p>
              <SubirImagen
                carpeta="ganadores"
                valor={edicion.image_path}
                onCambio={(ruta) => setEdicion({ ...edicion, image_path: ruta })}
              />
              <p className="mt-2 text-xs text-tenue">
                Sin foto también sale: se pinta el monto sobre el azul de la
                marca. Esperar a tener foto de todos es como no tener la página.
              </p>
            </div>
          </div>

          {/* EL PERMISO.
              En recuadro aparte y con borde, no como una casilla más perdida
              entre los campos. Aquí se publica la cara y el nombre de una
              persona real en internet, y quien está en el mostrador un sábado
              por la noche tiene que ver la pregunta, no pasarla por encima. */}
          <div className="mt-6 rounded-2xl border border-dorado/45 bg-dorado/10 p-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={edicion.consentimiento}
                onChange={(e) => setEdicion({ ...edicion, consentimiento: e.target.checked })}
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              <span>
                <strong className="font-semibold">
                  La persona me dio permiso para publicar su nombre y su foto.
                </strong>
                <span className="mt-1 block text-tenue">
                  Sin esto no se guarda. Si te dice que no, o no estás seguro, no
                  la subas — se puede publicar el premio sin nombre desde
                  Promociones.
                </span>
              </span>
            </label>

            <label className="mt-4 block text-sm">
              <span className="font-medium">Cómo lo dio (opcional)</span>
              <input
                value={edicion.consentimiento_nota}
                onChange={(e) => setEdicion({ ...edicion, consentimiento_nota: e.target.value })}
                placeholder="Firmó el papel del mostrador el 28 de agosto"
                className={`${CAMPO} mt-1.5`}
              />
            </label>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={edicion.publicado}
              onChange={(e) => setEdicion({ ...edicion, publicado: e.target.checked })}
              className="h-5 w-5"
            />
            Sale en la página
          </label>

          {error && (
            <p role="alert" className="mt-4 text-sm text-pierde">
              {error}
            </p>
          )}

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
        </div>
      )}

      {ganadores.length > 0 && (
        <ul className="mt-8 grid gap-2.5">
          {ganadores.map((g) => (
            <li key={g.id} className="hueco flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
              <span className="font-medium">{g.nombre}</span>
              {g.pueblo && <span className="text-tenue">{g.pueblo}</span>}
              {g.monto_cents && (
                <span className="font-semibold tabular texto-dorado">{money(Number(g.monto_cents))}</span>
              )}
              <span className="tabular text-tenue">{g.gano_on}</span>
              {!g.publicado && <span className="text-xs text-tenue">(no sale)</span>}
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setEdicion({
                      id: g.id,
                      nombre: g.nombre,
                      pueblo: g.pueblo ?? '',
                      maquina: g.maquina ?? '',
                      dolares: g.monto_cents ? (Number(g.monto_cents) / 100).toFixed(2) : '',
                      gano_on: g.gano_on,
                      image_path: g.image_path,
                      // Ya estaba guardado, así que el permiso existe: la fila no
                      // se habría podido crear sin él.
                      consentimiento: true,
                      consentimiento_nota: g.consentimiento_nota ?? '',
                      publicado: g.publicado,
                    })
                  }
                  className="inline-flex min-h-11 items-center rounded-lg border border-linea px-3 hover:border-cian hover:text-cian"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => borrar(g)}
                  className="inline-flex min-h-11 items-center rounded-lg border border-linea px-3 text-pierde hover:border-pierde"
                >
                  Quitar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
