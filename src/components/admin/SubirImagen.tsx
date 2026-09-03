'use client';

import { useRef, useState } from 'react';
import { FotoEncajada } from '@/components/site/FotoEncajada';
import { encogerImagen, comoPeso } from '@/lib/encoger-imagen';

/**
 * Selector de imagen con vista previa.
 *
 * La imagen se sube en cuanto se escoge, no al guardar el formulario: así el
 * empleado ve enseguida si el arte se cargó bien y si se ve como espera, en vez
 * de enterarse al final de que algo falló.
 *
 * NO HAY QUE PREPARAR LA FOTO ANTES DE SUBIRLA. Se escoge la que salga del
 * teléfono, del tamaño que sea: aquí se encoge sola si hace falta (ver
 * `encogerImagen`) y en la página entra entera en su recuadro (ver
 * `FotoEncajada`). Las dos cosas pasan sin preguntar nada.
 */
export function SubirImagen({
  carpeta,
  valor,
  onCambio,
  proporcion = 'aspect-[4/5]',
}: {
  carpeta: 'eventos' | 'maquinas' | 'galeria' | 'menu' | 'ganadores';
  valor: string | null;
  onCambio: (ruta: string | null) => void;
  /**
   * La forma del recuadro. Tiene que ser LA MISMA que use la tarjeta de la
   * página: la vista previa está para ver cómo va a quedar, y si aquí se
   * enseña con una forma y allá con otra, miente.
   */
  proporcion?: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [encogida, setEncogida] = useState<string | null>(null);

  async function subir(original: File | null | undefined) {
    if (!original) return;
    setSubiendo(true);
    setError(null);
    setEncogida(null);

    // Se encoge ANTES de mandarla. Una foto de teléfono son cuatro o cinco
    // megas y la tarjeta más grande del sitio no llega a 700 píxeles: subirla
    // entera es rechazarla por pasarse de 8 MB, o hacer que cada visitante se
    // descargue cinco megas para ver una miniatura.
    const encaje = await encogerImagen(original);
    const archivo = encaje.archivo;
    if (encaje.cambiada) {
      setEncogida(
        `Se ajustó sola: de ${comoPeso(encaje.bytesAntes)} a ${comoPeso(encaje.bytesDespues)}.`,
      );
    }

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
          <FotoEncajada src={valor} alt="Vista previa" proporcion={proporcion} />
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
          <p className="mt-2 text-xs text-tenue/70">
            Del tamaño que sea: se ajusta sola
          </p>
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

      {/* Se dice, no se hace a escondidas: quien sube una foto de cinco megas y
          ve que el sitio la guardó en medio mega tiene derecho a saberlo. */}
      {encogida && !error && (
        <p role="status" className="mt-2 text-xs text-tenue">
          {encogida}
        </p>
      )}
    </div>
  );
}
