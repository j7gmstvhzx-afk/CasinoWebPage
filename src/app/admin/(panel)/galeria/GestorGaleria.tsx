'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SubirImagen } from '@/components/admin/SubirImagen';
import { Estado } from '@/components/admin/EstadoPublico';
import { estadoFoto } from '@/lib/visibilidad';

export type FotoAdmin = {
  id: string;
  image_path: string;
  caption: string | null;
  sort_order: number;
};

/**
 * Las fotos del salón.
 *
 * ESTA PANTALLA NO EXISTÍA. La página `/galeria` lleva desde el principio en el
 * menú del sitio, la tabla está en la primera migración y la API ya aceptaba el
 * tipo 'galeria' entero —guardar, editar y borrar— pero no había ni una
 * pantalla desde la que usarla: la única forma de poner una foto era escribir
 * SQL contra la base de datos. Así que en producción hay cero fotos y una
 * pestaña que dice "Estamos preparando la galería".
 *
 * AQUÍ NO HAY BORRADOR, Y SE DICE
 * -------------------------------
 * `gallery_items` no tiene columna de publicación y la consulta pública no
 * filtra nada: subir una foto ES publicarla, al instante. En las otras pestañas
 * se puede preparar algo y enseñarlo después; aquí no. Vale más decirlo antes
 * de que alguien suba una foto "para verla luego".
 */
export function GestorGaleria({
  fotos,
  cargaFallida = false,
}: {
  fotos: FotoAdmin[];
  cargaFallida?: boolean;
}) {
  const router = useRouter();
  const [ruta, setRuta] = useState<string | null>(null);
  const [pie, setPie] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function llamar(metodo: string, cuerpo: unknown): Promise<string | null> {
    const r = await fetch('/api/admin/contenido', {
      method: metodo,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: 'No hay conexión.' }));
    return r.ok ? null : (r.error ?? 'No se pudo guardar.');
  }

  async function anadir() {
    if (!ruta) return setError('Escoge una foto primero.');
    setOcupado(true);
    setError(null);
    const fallo = await llamar('POST', {
      tipo: 'galeria',
      datos: {
        image_path: ruta,
        caption: pie.trim() || null,
        // La nueva va al final, detrás de las que ya están.
        sort_order: (fotos.at(-1)?.sort_order ?? 0) + 1,
      },
    });
    setOcupado(false);
    if (fallo) return setError(fallo);

    setRuta(null);
    setPie('');
    setAviso('Foto añadida. Ya se ve en la galería de la página.');
    router.refresh();
  }

  async function borrar(f: FotoAdmin) {
    if (!confirm('¿Borrar esta foto de la galería? Esto no se puede deshacer.')) return;
    setOcupado(true);
    const fallo = await llamar('DELETE', { tipo: 'galeria', id: f.id });
    setOcupado(false);
    if (fallo) return setError(fallo);
    setAviso('Foto borrada.');
    router.refresh();
  }

  return (
    <>
      <div className="tarjeta mt-8 grid gap-5 p-5 sm:grid-cols-[16rem_1fr] sm:p-6">
        <SubirImagen
          carpeta="galeria"
          valor={ruta}
          onCambio={setRuta}
          proporcion="aspect-[4/3]"
        />

        <div className="flex flex-col gap-4">
          <label className="block text-sm">
            <span className="font-medium">Pie de foto</span>
            <span className="ml-1.5 text-tenue">(se puede dejar vacío)</span>
            <input
              value={pie}
              onChange={(e) => setPie(e.target.value)}
              placeholder="El salón un viernes por la noche"
              className="mt-1.5 min-h-11 w-full rounded-lg border border-linea bg-superficie px-3 focus:border-cian focus:outline-none"
            />
          </label>

          <p className="text-sm text-tenue">
            En la galería no hay borrador: la foto se ve en la página en cuanto
            la añadas. Para quitarla, bórrala.
          </p>

          <div>
            <button
              type="button"
              onClick={anadir}
              disabled={ocupado || !ruta}
              className="inline-flex min-h-11 items-center rounded-xl bg-cian px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {ocupado ? 'Añadiendo…' : 'Añadir a la galería'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-pierde">
          {error}
        </p>
      )}
      {aviso && !error && (
        <p role="status" className="mt-4 text-sm text-gana">
          {aviso}
        </p>
      )}

      <h2 className="mt-12 font-display text-2xl font-bold">
        Fotos{cargaFallida ? '' : ` (${fotos.length})`}
      </h2>

      {cargaFallida ? (
        <p className="tarjeta mt-5 px-6 py-12 text-center text-tenue">
          No se pudo leer la galería. Recarga la página para verla.
        </p>
      ) : fotos.length === 0 ? (
        <p className="tarjeta mt-5 px-6 py-12 text-center text-tenue">
          Todavía no hay ninguna foto. Sube la primera aquí arriba.
        </p>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fotos.map((f) => (
            <li
              key={f.id}
              className="tarjeta overflow-hidden"
              data-cam-item={f.image_path}
              data-cam-visible="si"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.image_path}
                alt={f.caption ?? 'Foto del salón'}
                className="aspect-[4/3] w-full object-cover"
              />
              <div className="p-4">
                <p className="text-sm font-medium">{f.caption ?? 'Sin pie de foto'}</p>
                <div className="mt-2">
                  <Estado estado={estadoFoto()} />
                </div>
                <button
                  type="button"
                  onClick={() => borrar(f)}
                  disabled={ocupado}
                  className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-linea px-3 text-xs font-medium text-tenue transition-colors hover:border-pierde hover:text-pierde disabled:opacity-50"
                >
                  Borrar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
