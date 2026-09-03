'use client';

import { useRef, useState } from 'react';
import { FotoEncajada } from '@/components/site/FotoEncajada';

/**
 * Selector de imagen con vista previa.
 *
 * La imagen se sube en cuanto se escoge, no al guardar el formulario: así el
 * empleado ve enseguida si el arte se cargó bien y si se ve como espera, en vez
 * de enterarse al final de que algo falló.
 */
export function SubirImagen({
  carpeta,
  valor,
  onCambio,
  proporcion = 'aspect-[4/5]',
  encaje = 'recortar',
}: {
  carpeta: 'eventos' | 'maquinas' | 'galeria' | 'menu' | 'ganadores';
  valor: string | null;
  onCambio: (ruta: string | null) => void;
  proporcion?: string;
  /**
   * Tiene que ser EL MISMO que use la tarjeta de la página.
   *
   * La vista previa está para ver cómo va a quedar, así que si aquí se enseña
   * la foto entera y allá sale recortada, la vista previa miente y no sirve
   * para nada — que es peor que no tenerla.
   */
  encaje?: 'recortar' | 'contener';
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  async function subir(archivo: File | null | undefined) {
    if (!archivo) return;
    setSubiendo(true);
    setError(null);

    const datos = new FormData();
    datos.append('archivo', archivo);
    datos.append('carpeta', carpeta);

    const r = await fetch('/api/admin/subir', { method: 'POST', body: datos })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: 'No hay conexión.' }));

    setSubiendo(false);
    if (!r.ok) return setError(r.error);
    onCambio(r.url);
  }

  return (
    <div>
      {valor ? (
        <div className="relative overflow-hidden rounded-2xl border border-linea">
          {encaje === 'contener' ? (
            <FotoEncajada src={valor} alt="Vista previa" proporcion={proporcion} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={valor} alt="Vista previa" className={`${proporcion} w-full object-cover`} />
          )}
          <button
            type="button"
            onClick={() => onCambio(null)}
            className="absolute right-3 top-3 rounded-full bg-fondo/90 px-3 py-1.5 text-xs font-semibold text-tinta"
          >
            Quitar
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            void subir(e.dataTransfer.files?.[0]);
          }}
          className={`flex ${proporcion} w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
            arrastrando ? 'border-cian bg-cian/5' : 'border-linea'
          }`}
        >
          <p className="text-sm text-tenue">
            {subiendo ? 'Subiendo…' : 'Arrastra el arte aquí'}
          </p>
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={subiendo}
            className="mt-3 rounded-xl border border-linea px-4 py-2 text-sm font-medium transition-colors hover:border-cian hover:text-cian disabled:opacity-50"
          >
            Escoger imagen
          </button>
          <p className="mt-2 text-xs text-tenue/70">JPG, PNG o WEBP · hasta 8 MB</p>
        </div>
      )}

      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        className="sr-only"
        onChange={(e) => void subir(e.target.files?.[0])}
      />

      {error && (
        <p role="alert" className="mt-2 text-sm text-pierde">
          {error}
        </p>
      )}
    </div>
  );
}
