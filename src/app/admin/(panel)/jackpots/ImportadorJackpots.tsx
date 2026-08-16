'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { money } from '@/lib/format';

type Resumen = {
  total: number;
  conMonto: number;
  sinMonto: number;
  nuevas: string[];
  desaparecidas: string[];
  descartadas: { fila: number; motivo: string }[];
  muestra: { fila: number; nombre: string; banco: number; centavos: number | null }[];
};

type Estado =
  | { t: 'vacio' }
  | { t: 'leyendo' }
  | { t: 'vista'; resumen: Resumen }
  | { t: 'aplicando'; resumen: Resumen }
  | { t: 'listo'; resumen: Resumen }
  | { t: 'error'; mensaje: string };

export function ImportadorJackpots() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ t: 'vacio' });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  async function enviar(f: File, confirmar: boolean) {
    setEstado(confirmar ? { t: 'aplicando', resumen: (estado as { resumen: Resumen }).resumen } : { t: 'leyendo' });

    const datos = new FormData();
    datos.append('archivo', f);
    datos.append('confirmar', confirmar ? 'si' : 'no');

    const r = await fetch('/api/admin/jackpots/importar', { method: 'POST', body: datos })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: 'No hay conexión.' }));

    if (!r.ok) return setEstado({ t: 'error', mensaje: r.error });

    if (confirmar) {
      setEstado({ t: 'listo', resumen: r.resumen });
      router.refresh();
    } else {
      setEstado({ t: 'vista', resumen: r.resumen });
    }
  }

  function elegir(f: File | null | undefined) {
    if (!f) return;
    setArchivo(f);
    enviar(f, false);
  }

  function reiniciar() {
    setArchivo(null);
    setEstado({ t: 'vacio' });
    if (entrada.current) entrada.current.value = '';
  }

  return (
    <div>
      {(estado.t === 'vacio' || estado.t === 'error' || estado.t === 'leyendo') && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            elegir(e.dataTransfer.files?.[0]);
          }}
          className={`rounded-3xl border-2 border-dashed p-12 text-center transition-colors ${
            arrastrando ? 'border-cian bg-cian/5' : 'border-linea'
          }`}
        >
          <p className="font-display text-xl font-semibold">
            {estado.t === 'leyendo' ? 'Leyendo el archivo…' : 'Arrastra aquí tu archivo de premios'}
          </p>
          <p className="mt-2 text-sm text-tenue">
            Sube <strong className="text-crema">Tabla Premios App</strong> tal como
            está. No hay que cambiarle nada.
          </p>

          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={estado.t === 'leyendo'}
            className="mt-6 rounded-2xl bg-cian px-6 py-3 font-semibold text-noche disabled:opacity-50"
          >
            Escoger archivo
          </button>

          <input
            ref={entrada}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(e) => elegir(e.target.files?.[0])}
          />

          {estado.t === 'error' && (
            <p role="alert" className="mt-6 rounded-2xl border border-pierde/40 bg-pierde/10 p-4 text-sm text-pierde">
              {estado.mensaje}
            </p>
          )}
        </div>
      )}

      {(estado.t === 'vista' || estado.t === 'aplicando') && (
        <VistaPrevia
          resumen={estado.resumen}
          aplicando={estado.t === 'aplicando'}
          onConfirmar={() => archivo && enviar(archivo, true)}
          onCancelar={reiniciar}
        />
      )}

      {estado.t === 'listo' && (
        <div className="rounded-3xl border-2 border-gana bg-gana/10 p-10 text-center">
          <p className="font-display text-4xl font-bold text-gana">✓ Publicado</p>
          <p className="mt-3 text-lg">
            {estado.resumen.conMonto} premio{estado.resumen.conMonto === 1 ? '' : 's'} actualizado
            {estado.resumen.conMonto === 1 ? '' : 's'} en la página.
          </p>
          <button
            type="button"
            onClick={reiniciar}
            className="mt-6 rounded-2xl border border-linea px-6 py-3 font-medium"
          >
            Subir otro archivo
          </button>
        </div>
      )}
    </div>
  );
}

function VistaPrevia({
  resumen,
  aplicando,
  onConfirmar,
  onCancelar,
}: {
  resumen: Resumen;
  aplicando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className="tarjeta p-8">
      <h2 className="font-display text-2xl font-bold">Revisa antes de publicar</h2>
      <p className="mt-1.5 text-sm text-tenue">
        Todavía no se ha cambiado nada en la página.
      </p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        <Dato n={resumen.total} t="Máquinas en el archivo" />
        <Dato n={resumen.conMonto} t="Con premio, se publican" acento />
        <Dato n={resumen.sinMonto} t="Sin monto, no se publican" />
      </ul>

      {resumen.nuevas.length > 0 && (
        <Lista titulo={`${resumen.nuevas.length} máquina(s) nueva(s)`} items={resumen.nuevas} tono="cian" />
      )}

      {resumen.desaparecidas.length > 0 && (
        <Lista
          titulo={`${resumen.desaparecidas.length} ya no aparece(n) — se ocultarán`}
          items={resumen.desaparecidas}
          tono="tenue"
        />
      )}

      {resumen.descartadas.length > 0 && (
        <Lista
          titulo={`${resumen.descartadas.length} fila(s) descartada(s)`}
          items={resumen.descartadas.map((d) => `Fila ${d.fila}: ${d.motivo}`)}
          tono="malo"
        />
      )}

      <div className="mt-7 overflow-x-auto">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-tenue">
          Primeras filas
        </p>
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="border-b border-linea text-left text-xs uppercase text-tenue">
              <th className="pb-2 pr-4 font-semibold">Máquina</th>
              <th className="pb-2 pr-4 font-semibold">Banco</th>
              <th className="pb-2 font-semibold">Premio</th>
            </tr>
          </thead>
          <tbody>
            {resumen.muestra.map((f) => (
              <tr key={`${f.nombre}-${f.banco}`} className="border-b border-linea/50">
                <td className="py-2 pr-4">{f.nombre}</td>
                <td className="py-2 pr-4 tabular">{f.banco}</td>
                <td className="py-2 tabular">
                  {f.centavos === null ? (
                    <span className="text-tenue">sin monto</span>
                  ) : (
                    <span className="text-dorado">{money(f.centavos)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onConfirmar}
          disabled={aplicando}
          className="flex-1 rounded-2xl bg-gradient-to-b from-dorado-2 to-dorado px-8 py-4 font-display text-lg font-bold text-noche disabled:opacity-50"
        >
          {aplicando ? 'Publicando…' : 'Publicar en la página'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={aplicando}
          className="rounded-2xl border border-linea px-8 py-4 font-medium text-tenue"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Dato({ n, t, acento }: { n: number; t: string; acento?: boolean }) {
  return (
    <li className="rounded-2xl border border-linea bg-white/5 p-4">
      <p className={`font-display text-3xl font-bold tabular ${acento ? 'text-dorado' : 'text-crema'}`}>
        {n}
      </p>
      <p className="mt-1 text-xs text-tenue">{t}</p>
    </li>
  );
}

function Lista({
  titulo,
  items,
  tono,
}: {
  titulo: string;
  items: string[];
  tono: 'cian' | 'tenue' | 'malo';
}) {
  const clase = {
    cian: 'border-cian/40 text-cian',
    tenue: 'border-linea text-tenue',
    malo: 'border-pierde/40 text-pierde',
  }[tono];

  return (
    <details className={`mt-4 rounded-2xl border p-4 ${clase}`}>
      <summary className="cursor-pointer text-sm font-semibold">{titulo}</summary>
      <ul className="mt-3 space-y-1 text-sm text-tenue">
        {items.slice(0, 40).map((i) => (
          <li key={i}>· {i}</li>
        ))}
        {items.length > 40 && <li>· … y {items.length - 40} más</li>}
      </ul>
    </details>
  );
}
