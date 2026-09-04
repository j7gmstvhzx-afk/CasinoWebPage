'use client';

import { useState } from 'react';
import { EntradaManual, type MaquinaFila } from './EntradaManual';
import { ImportadorJackpots } from './ImportadorJackpots';
import { GestorLogos } from './GestorLogos';

/**
 * Tres tareas sobre las mismas máquinas, ordenadas por con qué frecuencia se
 * hacen.
 *
 * Escribir a mano es lo primero porque es lo que se hace todos los días. Subir
 * el Excel queda de segunda, para cuando conviene actualizar las 19 de un
 * tirón desde la hoja que ya se lleva. Y los logos van al final porque se ponen
 * UNA VEZ por máquina: es la tarea que menos se toca, y la que menos tiene que
 * estorbar a la de todos los días.
 */
export function PanelJackpots({ maquinas }: { maquinas: MaquinaFila[] }) {
  const [modo, setModo] = useState<'manual' | 'excel' | 'logos'>('manual');

  return (
    <>
      <div
        role="tablist"
        aria-label="Qué hacer con los premios"
        className="mt-6 flex flex-wrap gap-1 rounded-2xl border border-linea bg-superficie p-1 sm:inline-flex sm:flex-nowrap"
      >
        {(
          [
            ['manual', 'Escribir montos'],
            ['excel', 'Subir Excel'],
            ['logos', 'Logos de los juegos'],
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
        {modo === 'manual' && <EntradaManual maquinas={maquinas} />}
        {modo === 'excel' && <ImportadorJackpots />}
        {modo === 'logos' && <GestorLogos maquinas={maquinas} />}
      </div>
    </>
  );
}
