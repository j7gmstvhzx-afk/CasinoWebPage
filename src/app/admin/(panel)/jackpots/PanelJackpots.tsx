'use client';

import { useState } from 'react';
import { EntradaManual, type MaquinaFila } from './EntradaManual';
import { ImportadorJackpots } from './ImportadorJackpots';

/**
 * Dos formas de actualizar los premios.
 *
 * Escribir a mano es lo primero porque es lo que se hace todos los días. Subir
 * el Excel queda de segunda, para cuando conviene actualizar las 19 de un
 * tirón desde la hoja que ya se lleva.
 */
export function PanelJackpots({ maquinas }: { maquinas: MaquinaFila[] }) {
  const [modo, setModo] = useState<'manual' | 'excel'>('manual');

  return (
    <>
      <div
        role="tablist"
        aria-label="Cómo actualizar los premios"
        className="mt-6 inline-flex rounded-2xl border border-linea bg-superficie p-1"
      >
        {(
          [
            ['manual', 'Escribir montos'],
            ['excel', 'Subir Excel'],
          ] as const
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={modo === valor}
            onClick={() => setModo(valor)}
            className={`inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-medium transition-colors ${
              modo === valor ? 'bg-cian text-white' : 'text-tenue hover:text-tinta'
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {modo === 'manual' ? <EntradaManual maquinas={maquinas} /> : <ImportadorJackpots />}
      </div>
    </>
  );
}
