'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { JackpotVista } from '@/lib/queries';
import { money } from '@/lib/format';

/**
 * Tablero de jackpots.
 *
 * El número de banco va visible en cada tarjeta, y es el dato que convierte
 * esta página en tráfico real: el cliente ve el premio desde su casa y llega al
 * casino sabiendo exactamente a qué banco caminar. Sin él, la lista es
 * entretenimiento; con él, es una instrucción.
 */

export function JackpotBoard({
  jackpots,
  intervaloRefresco = 60_000,
}: {
  jackpots: JackpotVista[];
  intervaloRefresco?: number;
}) {
  const [busqueda, setBusqueda] = useState('');
  const router = useRouter();

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return jackpots;
    // Acepta nombre de máquina O número de banco: escribir "31" encuentra las
    // máquinas del banco 31, que es como la gente busca cuando ya estuvo aquí.
    return jackpots.filter(
      (j) => j.nombre.toLowerCase().includes(q) || String(j.banco) === q,
    );
  }, [jackpots, busqueda]);

  // Refresco silencioso: router.refresh() vuelve a pedir el componente de
  // servidor y React reconcilia solo lo que cambió. No se pierde el scroll ni
  // lo que la persona tenga escrito en el buscador, cosa que sí pasaría con un
  // location.reload().
  //
  // Solo mientras la pestaña está visible: refrescar en segundo plano gasta la
  // batería del celular y la cuota de la base de datos sin que nadie lo vea.
  useEffect(() => {
    if (!intervaloRefresco) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, intervaloRefresco);
    return () => clearInterval(t);
  }, [intervaloRefresco, router]);

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <div className="relative flex-1">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-tenue"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar máquina o número de banco…"
            aria-label="Buscar máquina o número de banco"
            className="w-full rounded-2xl border border-linea bg-white/5 py-3.5 pl-11 pr-4 text-base text-crema placeholder:text-tenue/60 focus:border-cian focus:outline-none"
          />
        </div>
      </div>

      {filtrados.length === 0 ? (
        <p className="tarjeta px-6 py-12 text-center text-tenue">
          {jackpots.length === 0
            ? 'Los premios se están actualizando. Vuelve en un rato.'
            : `No encontramos nada para "${busqueda}".`}
        </p>
      ) : (
        <ul className="grid gap-3">
          {filtrados.map((j, i) => (
            <FilaJackpot key={j.id} j={j} destacado={i === 0 && !busqueda} />
          ))}
        </ul>
      )}
    </>
  );
}

function FilaJackpot({ j, destacado }: { j: JackpotVista; destacado: boolean }) {
  return (
    <li
      className={`tarjeta flex items-center justify-between gap-4 px-5 py-4 transition-colors sm:px-6 sm:py-5 ${
        destacado ? 'border-dorado/40' : ''
      }`}
    >
      <div className="min-w-0">
        <p
          className={`truncate font-display font-semibold ${
            destacado ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'
          }`}
        >
          {j.nombre}
        </p>
        <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-tenue">
          Banco {j.banco}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {j.caliente && (
          <span
            title="Por encima de su promedio de los últimos 30 días"
            className="anim-brillo rounded-full border border-dorado/40 bg-dorado/10 px-2.5 py-1 text-xs font-semibold text-dorado"
          >
            🔥 CALIENTE
          </span>
        )}
        {j.tendencia === 'sube' && (
          <span aria-label="Subió desde la última lectura" className="text-gana">
            ↑
          </span>
        )}

        <MontoAnimado
          centavos={j.centavos}
          className={`font-display font-bold tabular ${
            destacado ? 'text-2xl texto-dorado sm:text-4xl' : 'text-xl text-dorado sm:text-2xl'
          }`}
        />
      </div>
    </li>
  );
}

/**
 * El monto sube contando hasta su valor.
 *
 * Es puro adorno, pero es el adorno que hace que un tablero de números se
 * sienta un salón vivo. Se salta entero si la persona pidió menos movimiento.
 */
function MontoAnimado({ centavos, className }: { centavos: number; className?: string }) {
  const [valor, setValor] = useState(centavos);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValor(centavos);
      return;
    }

    const desde = 0;
    const duracion = 900;
    const inicio = performance.now();

    const paso = (t: number) => {
      const p = Math.min(1, (t - inicio) / duracion);
      // easeOutCubic: rápido al principio, frena al final
      const e = 1 - Math.pow(1 - p, 3);
      setValor(Math.round(desde + (centavos - desde) * e));
      if (p < 1) raf.current = requestAnimationFrame(paso);
    };

    raf.current = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf.current);
  }, [centavos]);

  return <span className={className}>{money(valor)}</span>;
}
