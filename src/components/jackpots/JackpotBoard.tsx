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

  // Los 3 premios más grandes se destacan en un "podio" arriba del tablero;
  // el resto sigue abajo en la lista de siempre. `jackpots` ya llega ordenado
  // de mayor a menor desde la consulta.
  const podio = useMemo(() => filtrados.slice(0, 3), [filtrados]);
  const resto = useMemo(() => filtrados.slice(3), [filtrados]);
  const maxCentavos = useMemo(
    () => filtrados.reduce((m, j) => Math.max(m, j.centavos), 1),
    [filtrados],
  );

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
            className="w-full rounded-2xl border border-linea bg-superficie py-3.5 pl-11 pr-4 text-base text-tinta placeholder:text-tenue/60 focus:border-cian focus:outline-none"
          />
        </div>
      </div>

      {filtrados.length === 0 ? (
        <p className="tarjeta px-6 py-12 text-center text-tenue">
          {jackpots.length === 0
            ? 'Los premios se están actualizando. Vuelve en un rato.'
            : `No encontramos nada para "${busqueda}".`}
        </p>
      ) : busqueda ? (
        // Buscando: lista plana. El podio de los 3 más grandes no tiene
        // sentido cuando la persona ya sabe qué máquina quiere.
        <ul className="grid gap-3">
          {filtrados.map((j) => (
            <FilaJackpot key={j.id} j={j} max={maxCentavos} />
          ))}
        </ul>
      ) : (
        <>
          {podio.length > 0 && (
            <ul className="mb-4 grid gap-3 sm:grid-cols-3">
              {podio.map((j, i) => (
                <TarjetaPodio key={j.id} j={j} puesto={i + 1} max={maxCentavos} />
              ))}
            </ul>
          )}
          {resto.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {resto.map((j) => (
                <FilaJackpot key={j.id} j={j} max={maxCentavos} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

/** Franja fina proporcional al monto: da una lectura "de tablero" de un
 * vistazo, sin tener que leer los números uno por uno para comparar. */
function BarraRelativa({ centavos, max, className }: { centavos: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((centavos / max) * 100)) : 0;
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-linea/60 ${className ?? ''}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-dorado-2 to-dorado-3"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const MEDALLA = [
  { emoji: '🥇', anillo: 'from-dorado-3 via-dorado-2 to-dorado', halo: 'shadow-premio' },
  { emoji: '🥈', anillo: 'from-slate-200 via-slate-300 to-slate-400', halo: 'shadow-suave' },
  { emoji: '🥉', anillo: 'from-orange-200 via-orange-300 to-orange-400', halo: 'shadow-suave' },
] as const;

function TarjetaPodio({ j, puesto, max }: { j: JackpotVista; puesto: number; max: number }) {
  const m = MEDALLA[puesto - 1];
  return (
    <li
      className={`tarjeta relative overflow-hidden px-5 py-5 transition-transform hover:-translate-y-0.5 ${m.halo} ${
        puesto === 1 ? 'border-dorado/50 sm:py-6' : 'border-linea'
      }`}
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br opacity-20 blur-2xl ${m.anillo}`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r px-2.5 py-1 text-xs font-bold text-tinta ${m.anillo}`}
          >
            {m.emoji} #{puesto}
          </span>
          <p
            className={`mt-2 truncate font-display font-semibold ${
              puesto === 1 ? 'text-xl sm:text-2xl' : 'text-lg'
            }`}
          >
            {j.nombre}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs font-medium uppercase tracking-[0.18em] text-tenue">
            <span>Banco {j.banco}</span>
            {j.desactualizado && (
              <span className="normal-case tracking-normal text-tenue/70">· sin actualizar hoy</span>
            )}
          </p>
        </div>
        {j.caliente && (
          <span
            title="Por encima de su promedio de los últimos 30 días"
            className="anim-brillo shrink-0 rounded-full border border-dorado/40 bg-dorado/10 px-2 py-1 text-xs font-semibold text-dorado"
          >
            🔥
          </span>
        )}
      </div>

      <div className="relative mt-3 flex items-center gap-2">
        <MontoAnimado
          centavos={j.centavos}
          className={`font-display font-bold tabular texto-dorado ${
            puesto === 1 ? 'text-3xl sm:text-4xl' : 'text-2xl'
          }`}
        />
        {j.tendencia === 'sube' && (
          <span aria-label="Subió desde la última lectura" className="text-gana">
            ↑
          </span>
        )}
      </div>

      <BarraRelativa centavos={j.centavos} max={max} className="relative mt-3" />
    </li>
  );
}

function FilaJackpot({ j, max }: { j: JackpotVista; max: number }) {
  return (
    <li className="tarjeta flex items-center justify-between gap-4 px-5 py-4 transition-colors sm:px-6 sm:py-5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-semibold sm:text-lg">{j.nombre}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs font-medium uppercase tracking-[0.18em] text-tenue">
          <span>Banco {j.banco}</span>
          {/* El monto es de una actualización anterior. Se dice, en vez de
              enseñarlo como si fuera de hoy: el cliente maneja hasta Manatí
              por este número. */}
          {j.desactualizado && (
            <span className="normal-case tracking-normal text-tenue/70">
              · sin actualizar hoy
            </span>
          )}
        </p>
        <BarraRelativa centavos={j.centavos} max={max} className="mt-2.5 max-w-40" />
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
          className="font-display text-xl font-bold tabular text-dorado sm:text-2xl"
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
 *
 * La animación escribe al DOM directamente por ref, sin estado de React. Con
 * `setState` por frame, cada una de las 19 filas provocaba ~60 renders por
 * segundo durante casi un segundo — más de mil renders para dibujar un número
 * que sube. Además el valor se pinta ya correcto en el servidor, así que quien
 * llegue con JavaScript deshabilitado ve el monto igual.
 */
function MontoAnimado({ centavos, className }: { centavos: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const duracion = 900;
    const inicio = performance.now();
    let raf = 0;

    const paso = (t: number) => {
      const p = Math.min(1, (t - inicio) / duracion);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic: rápido y frena al final
      el.textContent = money(Math.round(centavos * e));
      if (p < 1) raf = requestAnimationFrame(paso);
    };

    raf = requestAnimationFrame(paso);
    return () => {
      cancelAnimationFrame(raf);
      // Al desmontar o cambiar de monto, se deja el valor final: si el efecto
      // se corta a mitad de la cuenta, la fila se quedaría con un número falso.
      el.textContent = money(centavos);
    };
  }, [centavos]);

  return (
    <span ref={ref} className={className}>
      {money(centavos)}
    </span>
  );
}
