'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { SubirImagen } from '@/components/admin/SubirImagen';
import { LogoJuego } from '@/components/jackpots/LogoJuego';
import type { MaquinaFila } from './EntradaManual';

/**
 * El arte de cada juego, para que el tablero se reconozca de un vistazo.
 *
 * ES UNA PESTAÑA APARTE, Y NO UNA COLUMNA MÁS EN LA ENTRADA DE MONTOS.
 *
 * Las dos pantallas trabajan sobre las mismas máquinas, pero a ritmos que no
 * tienen nada que ver: los montos se teclean TODOS LOS DÍAS, deprisa, dieciocho
 * casillas seguidas; el logo se pone UNA VEZ en la vida de la máquina. Meter un
 * recuadro de subida en cada fila de la entrada diaria convertiría la tarea de
 * dos minutos en una pantalla que hay que leer.
 *
 * SE EDITA UNA A LA VEZ
 * ---------------------
 * La lista enseña las dieciocho con su logo actual, y solo la que se abre saca
 * el recuadro para subir. Dieciocho recuadros de arrastrar y soltar a la vez
 * son dieciocho sitios donde soltar la foto equivocada.
 *
 * LA FOTO SE AJUSTA SOLA, COMO EN TODO EL RESTO DEL PANEL
 * -------------------------------------------------------
 * Es el mismo `SubirImagen` de Promociones, Galería, Comida y Máquinas: encoge
 * la imagen en el navegador antes de mandarla —del tamaño y el peso que venga—
 * y avisa de lo que hizo. Aquí se le pide el encaje de LOGO, que mete la imagen
 * entera sobre fondo liso en vez de rellenar con una copia desenfocada: un logo
 * recortado sobre su propia mancha borrosa se ve sucio. Es exactamente lo que
 * hace el tablero público, así que la vista previa no miente.
 */
export function GestorLogos({ maquinas }: { maquinas: MaquinaFila[] }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return maquinas;
    // Igual que en el tablero público: nombre O número de banco, porque quien
    // trabaja aquí piensa en bancos, no en nombres.
    return maquinas.filter(
      (m) => m.nombre.toLowerCase().includes(q) || String(m.banco) === q,
    );
  }, [maquinas, busca]);

  const conLogo = maquinas.filter((m) => m.logo).length;

  async function guardar(m: MaquinaFila, ruta: string | null) {
    setError(null);
    setHecho(null);

    const r = (await fetch('/api/admin/jackpots/logo', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: m.id, image_path: ruta }),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: 'No hay conexión.' }))) as {
      ok: boolean;
      error?: string;
    };

    // SE MIRA SI FALLÓ. Un guardado que no se comprueba es un botón que a veces
    // no hace nada y nunca lo dice.
    if (!r.ok) return setError(r.error ?? 'No pudimos guardar el logo.');

    setHecho(
      ruta
        ? `Logo guardado en "${m.nombre}". Ya sale en el tablero.`
        : `Logo quitado de "${m.nombre}".`,
    );
    router.refresh();
  }

  return (
    <div>
      <p className="text-sm text-tenue">
        El arte del juego, para que el cliente encuentre su máquina sin leer
        dieciocho nombres. Sube la imagen del tamaño que sea: se ajusta sola.
      </p>

      {hecho && (
        <p
          role="status"
          className="mt-5 rounded-2xl border border-gana/40 bg-gana/10 p-4 text-sm text-gana"
        >
          {hecho}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-2xl border border-pierde/40 bg-pierde/10 p-4 text-sm text-pierde"
        >
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar máquina o número de banco…"
          aria-label="Buscar máquina o número de banco"
          className="min-h-11 flex-1 rounded-xl border border-linea bg-fondo px-4 text-sm"
        />
        <span className="text-xs text-tenue">
          {conLogo} de {maquinas.length} con logo
        </span>
      </div>

      <ul className="mt-5 space-y-2.5">
        {lista.map((m) => {
          const activa = abierta === m.id;
          return (
            <li key={m.id} className="rounded-2xl border border-linea">
              <div className="flex items-center gap-3 p-3">
                <LogoJuego src={m.logo} nombre={m.nombre} className="h-12 w-12" />

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.nombre}</p>
                  <p className="text-xs text-tenue">
                    Banco {m.banco}
                    {m.logo ? '' : ' · sin logo'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setAbierta(activa ? null : m.id);
                    setError(null);
                  }}
                  aria-expanded={activa}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-linea px-3 text-xs font-medium transition-colors hover:border-cian hover:text-cian"
                >
                  {activa ? 'Cerrar' : m.logo ? 'Cambiar' : 'Poner logo'}
                </button>
              </div>

              {activa && (
                <div className="border-t border-linea p-4">
                  <div className="mx-auto max-w-xs">
                    <SubirImagen
                      carpeta="logos"
                      encaje="logo"
                      proporcion="aspect-square"
                      valor={m.logo}
                      onCambio={(ruta) => void guardar(m, ruta)}
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {lista.length === 0 && (
        <p className="mt-6 text-sm text-tenue">
          Ninguna máquina se llama así ni está en ese banco.
        </p>
      )}
    </div>
  );
}
