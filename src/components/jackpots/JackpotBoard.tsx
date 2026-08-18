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

type Filtro = 'todos' | 'calientes' | 'suben';

export function JackpotBoard({
  jackpots,
  intervaloRefresco = 60_000,
}: {
  jackpots: JackpotVista[];
  intervaloRefresco?: number;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const router = useRouter();

  const calientes = useMemo(() => jackpots.filter((j) => j.caliente).length, [jackpots]);
  const suben = useMemo(() => jackpots.filter((j) => j.tendencia === 'sube').length, [jackpots]);

  const filtrados = useMemo(() => {
    let lista = jackpots;
    if (filtro === 'calientes') lista = lista.filter((j) => j.caliente);
    if (filtro === 'suben') lista = lista.filter((j) => j.tendencia === 'sube');

    const q = busqueda.trim().toLowerCase();
    if (!q) return lista;
    // Acepta nombre de máquina O número de banco: escribir "31" encuentra las
    // máquinas del banco 31, que es como la gente busca cuando ya estuvo aquí.
    return lista.filter(
      (j) => j.nombre.toLowerCase().includes(q) || String(j.banco) === q,
    );
  }, [jackpots, busqueda, filtro]);

  // El premio más grande se destaca solo, en una franja propia; el 2° y 3°
  // van debajo en un podio de dos; el resto sigue en la parrilla de siempre.
  // Solo tiene sentido con la lista completa: buscando o filtrando, la
  // persona ya sabe qué está mirando y un podio parcial solo confunde.
  const mostrarPodio = !busqueda && filtro === 'todos';
  const primero = mostrarPodio ? filtrados[0] : undefined;
  const podio2y3 = mostrarPodio ? filtrados.slice(1, 3) : [];
  const resto = mostrarPodio ? filtrados.slice(3) : filtrados;
  const maxCentavos = useMemo(
    () => jackpots.reduce((m, j) => Math.max(m, j.centavos), 1),
    [jackpots],
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
      <div className="mb-4 flex items-center gap-3">
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

      <div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar premios">
        <Chip activo={filtro === 'todos'} onClick={() => setFiltro('todos')}>
          Todos · {jackpots.length}
        </Chip>
        <Chip activo={filtro === 'calientes'} onClick={() => setFiltro('calientes')} disabled={calientes === 0}>
          🔥 Calientes · {calientes}
        </Chip>
        <Chip activo={filtro === 'suben'} onClick={() => setFiltro('suben')} disabled={suben === 0}>
          ↑ Subiendo · {suben}
        </Chip>
      </div>

      {filtrados.length === 0 ? (
        <p className="tarjeta px-6 py-12 text-center text-tenue">
          {jackpots.length === 0
            ? 'Los premios se están actualizando. Vuelve en un rato.'
            : busqueda
              ? `No encontramos nada para "${busqueda}".`
              : 'Ninguno cumple con ese filtro ahora mismo.'}
        </p>
      ) : (
        <>
          {primero && <TarjetaHero j={primero} max={maxCentavos} />}

          {podio2y3.length > 0 && (
            <ul className="mb-4 grid gap-3 sm:grid-cols-2">
              {podio2y3.map((j, i) => (
                <TarjetaPodio key={j.id} j={j} puesto={i + 2} max={maxCentavos} />
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

function Chip({
  activo,
  disabled,
  onClick,
  children,
}: {
  activo: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={activo}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        activo
          ? 'border-dorado/60 bg-dorado/10 text-dorado'
          : 'border-linea text-tenue hover:border-tenue hover:text-tinta'
      }`}
    >
      {children}
    </button>
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

/** El premio del día, en su propia franja. Es la primera cifra que alguien ve
 * al entrar a la página, y tiene que leerse como un titular, no como una fila
 * más de una lista. */
function TarjetaHero({ j, max }: { j: JackpotVista; max: number }) {
  return (
    <div className="tarjeta relative mb-4 overflow-hidden border-dorado/50 px-6 py-8 shadow-premio sm:px-10 sm:py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-dorado-3/20 via-transparent to-transparent"
      />
      <div
        aria-hidden="true"
        className="anim-brillo pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br from-dorado-3 via-dorado-2 to-dorado opacity-25 blur-3xl"
      />

      <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-dorado-3 via-dorado-2 to-dorado px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-tinta">
            🏆 Premio más alto hoy
          </span>
          <p className="mt-3 truncate font-display text-2xl font-bold sm:text-3xl">{j.nombre}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs font-medium uppercase tracking-[0.18em] text-tenue">
            <span>Banco {j.banco}</span>
            {j.desactualizado && (
              <span className="normal-case tracking-normal text-tenue/70">· sin actualizar hoy</span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {j.caliente && (
            <span
              title="Por encima de su promedio de los últimos 30 días"
              className="anim-brillo shrink-0 rounded-full border border-dorado/40 bg-dorado/10 px-2.5 py-1 text-xs font-semibold text-dorado"
            >
              🔥 CALIENTE
            </span>
          )}
          <MontoAnimado
            centavos={j.centavos}
            className="font-display text-4xl font-bold tabular texto-dorado sm:text-6xl"
          />
          {j.tendencia === 'sube' && (
            <span aria-label="Subió desde la última lectura" className="text-2xl text-gana">
              ↑
            </span>
          )}
        </div>
      </div>

      <BarraRelativa centavos={j.centavos} max={max} className="relative mt-6 h-2" />
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
    <li className={`tarjeta relative overflow-hidden px-5 py-5 transition-transform hover:-translate-y-0.5 ${m.halo}`}>
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
          <p className="mt-2 truncate font-display text-lg font-semibold">{j.nombre}</p>
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
        <MontoAnimado centavos={j.centavos} className="font-display text-2xl font-bold tabular texto-dorado" />
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
