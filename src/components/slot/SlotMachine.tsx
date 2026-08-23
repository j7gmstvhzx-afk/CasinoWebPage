'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SYMBOLS } from '@/lib/reels';
import { SymbolIcon } from './symbols';

/**
 * La tragamonedas.
 *
 * EL CONTRATO, EN UNA FRASE: el servidor devuelve tres índices y el único
 * trabajo de esta animación es aterrizar en ellos. No hay un solo Math.random()
 * decidiendo resultados en este archivo.
 *
 * Los rolos arrancan a girar ANTES de que conteste el servidor. Eso es lo que
 * hace que se sienta una máquina y no un formulario: la respuesta llega en
 * menos de 200 ms, pero girar 200 ms y parar se vería roto. Por eso hay dos
 * fases — giro libre en bucle, y aterrizaje hacia el resultado ya decidido.
 */

const ITEM_H = 92; // alto de un símbolo, en px
const CYCLE = ITEM_H * SYMBOLS.length; // una vuelta completa del rolo
const REPEAT = 10; // cuántas vueltas hay en la tira (ver EXTRA_LOOPS)
const SPIN_CYCLE_MS = 300; // velocidad del giro libre
const MIN_SPIN_MS = 2500; // el giro nunca dura menos que esto
const STAGGER_MS = 450; // separación entre rolo y rolo al parar
const LAND_MS = 1150; // duración del frenado

// Vueltas extra al aterrizar. El tercer rolo da más vueltas: ahí está el
// suspenso, porque es el que decide si son tres iguales.
const EXTRA_LOOPS = [3, 5, 7];

export type SpinOutcome = {
  reels: number[];
  result: 'win' | 'lose';
  alreadySpunToday: boolean;
  voucherCode: string | null;
  /**
   * Cuándo vuelve a tener tirada, en ISO y calculado por el SERVIDOR.
   *
   * Viaja con el resultado porque el corte es a medianoche de Puerto Rico, y
   * eso no se puede deducir en el navegador: el reloj del teléfono puede estar
   * en otro huso —  un turista, o alguien que viaja —  y la cuenta regresiva
   * saldría corrida por horas.
   */
  proximaTirada: string;
};

type Fase = 'listo' | 'girando' | 'revelado';

/** "matrix(a,b,c,d,tx,ty)" -> ty */
function translateYActual(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 0;
  const m = t.match(/matrix.*\((.+)\)/);
  if (!m) return 0;
  const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
  // matrix() tiene 6 valores (ty en la posición 5); matrix3d() tiene 16 (ty en la 13).
  return parts.length === 6 ? parts[5] : parts.length === 16 ? parts[13] : 0;
}

const prefiereMenosMovimiento = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function SlotMachine({
  onSpin,
  onRevealed,
  etiquetaBoton = 'GIRAR AHORA',
  deshabilitado = false,
  mensajeDeshabilitado,
}: {
  /** Llama al servidor. Debe rechazar si algo falla. */
  onSpin: () => Promise<SpinOutcome>;
  onRevealed: (r: SpinOutcome) => void;
  etiquetaBoton?: string;
  deshabilitado?: boolean;
  mensajeDeshabilitado?: string;
}) {
  // Un solo ref que guarda los tres elementos. Con un arreglo de useRef creado
  // en el cuerpo del componente, cada render fabricaba un arreglo nuevo y el
  // compilador de React —  con razón —  lo marcaba como estado mutado tras el
  // render.
  const tiras = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const animaciones = useRef<(Animation | null)[]>([null, null, null]);
  const temporizadores = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [fase, setFase] = useState<Fase>('listo');
  const [error, setError] = useState<string | null>(null);
  const [visibles, setVisibles] = useState<number[]>([0, 1, 2]);

  const limpiar = useCallback(() => {
    temporizadores.current.forEach(clearTimeout);
    temporizadores.current = [];
    animaciones.current.forEach((a) => a?.cancel());
    animaciones.current = [null, null, null];
  }, []);

  useEffect(() => limpiar, [limpiar]);

  /** Fase 1: giro libre en bucle. Empieza al instante, sin esperar al servidor. */
  const girarLibre = useCallback(() => {
    tiras.current.forEach((_, i) => {
      const el = tiras.current[i];
      if (!el) return;
      el.style.transition = 'none';
      el.style.transform = 'translate3d(0,0,0)';
      animaciones.current[i] = el.animate(
        [{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(0,${-CYCLE}px,0)` }],
        { duration: SPIN_CYCLE_MS, iterations: Infinity, easing: 'linear' },
      );
    });
     
  }, []);

  /** Fase 2: frenar el rolo `i` hasta que el símbolo `simbolo` quede a la vista. */
  const aterrizar = useCallback((i: number, simbolo: number) => {
    const el = tiras.current[i];
    if (!el) return;

    // Se lee la posición ANTES de cancelar: al cancelar, el elemento vuelve a su
    // estilo base y el rolo daría un salto visible.
    const actual = translateYActual(el);
    animaciones.current[i]?.cancel();
    animaciones.current[i] = null;

    el.style.transition = 'none';
    el.style.transform = `translate3d(0,${actual}px,0)`;
    void el.offsetHeight; // fuerza reflujo para que la transición sí arranque

    const desde = -actual; // posición positiva
    // Como la tira se repite cada CYCLE, avanzar cualquier múltiplo de CYCLE es
    // visualmente idéntico. Se busca el próximo punto donde el símbolo pedido
    // queda centrado, y se le suman vueltas para que el frenado se vea.
    const alineacion = (((simbolo * ITEM_H - desde) % CYCLE) + CYCLE) % CYCLE;
    const destino = desde + EXTRA_LOOPS[i] * CYCLE + alineacion;

    el.style.transition = `transform ${LAND_MS}ms cubic-bezier(.14,.72,.24,1.04)`;
    el.style.transform = `translate3d(0,${-destino}px,0)`;

    const normalizar = () => {
      el.style.transition = 'none';
      el.style.transform = `translate3d(0,${-(destino % CYCLE)}px,0)`;
      el.removeEventListener('transitionend', normalizar);
    };
    el.addEventListener('transitionend', normalizar);
     
  }, []);

  const posicionInstantanea = useCallback((i: number, simbolo: number) => {
    const el = tiras.current[i];
    if (!el) return;
    animaciones.current[i]?.cancel();
    animaciones.current[i] = null;
    el.style.transition = 'none';
    el.style.transform = `translate3d(0,${-(simbolo * ITEM_H)}px,0)`;
     
  }, []);

  const tirar = useCallback(async () => {
    if (fase === 'girando' || deshabilitado) return;

    limpiar();
    setError(null);
    setFase('girando');

    const sinMovimiento = prefiereMenosMovimiento();
    const inicio = performance.now();
    if (!sinMovimiento) girarLibre();

    let resultado: SpinOutcome;
    try {
      resultado = await onSpin();
    } catch (e) {
      limpiar();
      // Se dejan los rolos donde estaban en vez de forzar una combinación:
      // inventar símbolos después de un fallo confundiría al cliente.
      tiras.current.forEach((_, i) => posicionInstantanea(i, visibles[i]));
      setFase('listo');
      setError(e instanceof Error ? e.message : 'No pudimos completar tu tirada.');
      return;
    }

    setVisibles(resultado.reels);

    if (sinMovimiento) {
      resultado.reels.forEach((s, i) => posicionInstantanea(i, s));
      setFase('revelado');
      onRevealed(resultado);
      return;
    }

    // El servidor contesta en ~200 ms. Se espera igual para que el giro dure lo
    // que tiene que durar: sin esto, los rolos "saltarían" al resultado.
    const espera = Math.max(0, MIN_SPIN_MS - (performance.now() - inicio));

    temporizadores.current.push(
      setTimeout(() => {
        resultado.reels.forEach((simbolo, i) => {
          temporizadores.current.push(
            setTimeout(() => aterrizar(i, simbolo), i * STAGGER_MS),
          );
        });

        temporizadores.current.push(
          setTimeout(
            () => {
              setFase('revelado');
              onRevealed(resultado);
            },
            (resultado.reels.length - 1) * STAGGER_MS + LAND_MS + 250,
          ),
        );
      }, espera),
    );
  }, [
    fase,
    deshabilitado,
    limpiar,
    girarLibre,
    onSpin,
    onRevealed,
    aterrizar,
    posicionInstantanea,
    visibles,
  ]);

  const girando = fase === 'girando';

  return (
    <div className="flex flex-col items-center">
      {/* Carcasa */}
      <div className="relative rounded-3xl border border-dorado/30 bg-gradient-to-b from-maquina-2 to-maquina p-3 shadow-premio sm:p-4">
        <div className="flex gap-2 sm:gap-3" aria-live="polite" aria-atomic="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="relative overflow-hidden rounded-2xl border border-linea bg-maquina"
              style={{ height: ITEM_H, width: ITEM_H }}
            >
              <div
                ref={(el) => {
                  tiras.current[i] = el;
                }}
                className="will-change-transform"
              >
                {/* Tira: los símbolos repetidos REPEAT veces. Se puede avanzar
                    cualquier múltiplo de una vuelta sin que se note el corte. */}
                {Array.from({ length: REPEAT * SYMBOLS.length }, (_, n) => (
                  <div
                    key={n}
                    className="flex items-center justify-center p-2.5"
                    style={{ height: ITEM_H, width: ITEM_H }}
                  >
                    <SymbolIcon index={n % SYMBOLS.length} />
                  </div>
                ))}
              </div>

              {/* Sombreado interior: da sensación de tambor físico. */}
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl"
                style={{
                  background:
                    'linear-gradient(to bottom, rgb(10 37 71 / .85), transparent 28%, transparent 72%, rgb(10 37 71 / .85))',
                }}
              />
            </div>
          ))}
        </div>

        {/* Línea de pago */}
        <div className="pointer-events-none absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-dorado/40 sm:inset-x-4" />
      </div>

      <p className="sr-only">
        {girando
          ? 'Girando…'
          : `Rolos: ${visibles.map((v) => SYMBOLS[v]).join(', ')}`}
      </p>

      <button
        type="button"
        onClick={tirar}
        disabled={girando || deshabilitado}
        className="mt-6 w-full max-w-sm rounded-2xl bg-gradient-to-b from-dorado-3 to-dorado-2 px-8 py-4 font-display text-lg font-bold tracking-wide text-tinta shadow-premio transition-transform enabled:hover:scale-[1.02] enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {girando ? 'GIRANDO…' : etiquetaBoton}
      </button>

      {deshabilitado && mensajeDeshabilitado && (
        <p className="mt-3 text-center text-sm text-tenue">{mensajeDeshabilitado}</p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-pierde">
          {error}
        </p>
      )}
    </div>
  );
}
