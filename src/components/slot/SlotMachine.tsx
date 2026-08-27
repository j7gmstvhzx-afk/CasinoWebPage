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

const ITEM_H = 104; // alto de un símbolo, en px
const CYCLE = ITEM_H * SYMBOLS.length; // una vuelta completa del rolo
const REPEAT = 10; // cuántas vueltas hay en la tira (ver EXTRA_LOOPS)
const SPIN_CYCLE_MS = 300; // velocidad del giro libre
const MIN_SPIN_MS = 2500; // el giro nunca dura menos que esto
const STAGGER_MS = 450; // separación entre rolo y rolo al parar
const LAND_MS = 1150; // duración del frenado

// Vueltas extra al aterrizar. El tercer rolo da más vueltas: ahí está el
// suspenso, porque es el que decide si son tres iguales.
const EXTRA_LOOPS = [3, 5, 7];

// Símbolos de reposo, uno distinto por rolo. Se eligen separados en la tira
// para que la máquina en reposo no insinúe ninguna combinación.
const REPOSO = [0, 2, 4];

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
  const [visibles, setVisibles] = useState<number[]>(REPOSO);
  // Qué rolos acaban de aterrizar. Dispara el destello del cristal y el aro de
  // ese rolo concreto — la sensación de que la máquina responde pieza a pieza
  // en vez de encenderse entera al final.
  const [parados, setParados] = useState<boolean[]>([false, false, false]);
  const [gano, setGano] = useState(false);

  const limpiar = useCallback(() => {
    temporizadores.current.forEach(clearTimeout);
    temporizadores.current = [];
    animaciones.current.forEach((a) => a?.cancel());
    animaciones.current = [null, null, null];
  }, []);

  const marcarParado = useCallback((i: number) => {
    setParados((p) => {
      const n = [...p];
      n[i] = true;
      return n;
    });
  }, []);

  useEffect(() => limpiar, [limpiar]);

  // Posición de reposo: cada rolo en un símbolo DISTINTO.
  //
  // Las tres tiras arrancan en translateY(0), o sea las tres en el símbolo 0:
  // la máquina se veía con tres coronas iguales antes de tirar, que es
  // exactamente la combinación premiada. Enseñarle al cliente un premio que no
  // ha ganado, cada vez que abre, es lo peor que puede hacer esta pantalla.
  //
  // El estado ya arranca en REPOSO (ver useState más arriba); aquí solo se
  // coloca la tira, que es DOM y no estado de React.
  useEffect(() => {
    tiras.current.forEach((el, i) => {
      if (!el) return;
      el.style.transform = `translate3d(0,${-(REPOSO[i] * ITEM_H)}px,0)`;
    });
     
  }, []);

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
  const aterrizar = useCallback((i: number, simbolo: number, alParar?: () => void) => {
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
      alParar?.();
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
    setParados([false, false, false]);
    setGano(false);
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
      setParados([true, true, true]);
      setGano(resultado.result === 'win');
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
            setTimeout(() => aterrizar(i, simbolo, () => marcarParado(i)), i * STAGGER_MS),
          );
        });

        temporizadores.current.push(
          setTimeout(
            () => {
              setGano(resultado.result === 'win');
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
    marcarParado,
    posicionInstantanea,
    visibles,
  ]);

  const girando = fase === 'girando';

  return (
    <div className="flex flex-col items-center">
      {/* ================= LA MÁQUINA =================

          Tres capas físicas, porque un solo rectángulo con degradado se ve
          plano por muy bonito que sea el degradado:

            1. el MUEBLE  — el borde dorado exterior y su sombra
            2. el FRENTE  — la cara oscura con el letrero y el cristal
            3. el CRISTAL — reflejo y viñeta ENCIMA de los rolos

          El reflejo va arriba del todo y con `pointer-events-none`: es lo que
          convierte "tres listas que se desplazan" en "algo que se mira a
          través de un vidrio". */}
      <div
        className={`relative w-full max-w-[26rem] rounded-[1.75rem] p-[3px] ${gano ? 'anim-celebrar' : ''}`}
        style={{
          background:
            'linear-gradient(160deg, var(--color-dorado-3), var(--color-dorado-2) 28%, #7c5510 62%, var(--color-dorado-2))',
          boxShadow: gano
            ? '0 0 0 1px rgb(242 179 61 / .7), 0 0 60px -6px rgb(242 179 61 / .75), 0 28px 60px -24px rgb(7 28 55 / .6)'
            : '0 2px 4px rgb(7 28 55 / .12), 0 28px 60px -24px rgb(7 28 55 / .55)',
          transition: 'box-shadow .5s var(--ease-vivo)',
        }}
      >
        <div className="relative overflow-hidden rounded-[1.6rem] bg-gradient-to-b from-maquina-2 via-maquina to-maquina px-3 pb-4 pt-3 sm:px-4">
          {/* Letrero superior. Le da a la máquina una cabeza — sin esto es una
              caja con ventanas, y una tragamonedas de verdad siempre anuncia
              su premio arriba. */}
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-dorado-2/25 bg-maquina/60 px-3 py-2">
            <span className="font-display text-[0.62rem] font-bold uppercase tracking-[0.24em] text-cian-3">
              Atlántico
            </span>
            <span className="font-display text-sm font-bold tracking-wide text-dorado-3">
              $25 EN EFECTIVO
            </span>
            {/* Tres luces. Se encienden a medida que paran los rolos: el
                progreso de la tirada, leíble de un vistazo. */}
            <span className="flex items-center gap-1" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full transition-all duration-300"
                  style={{
                    background: parados[i] ? 'var(--color-dorado-2)' : 'rgb(255 255 255 / .16)',
                    boxShadow: parados[i] ? '0 0 8px 1px rgb(242 179 61 / .8)' : 'none',
                  }}
                />
              ))}
            </span>
          </div>

          {/* --- Los tres tambores --- */}
          <div className="flex justify-center gap-2 sm:gap-2.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="relative flex-1 overflow-hidden rounded-xl transition-[box-shadow] duration-500"
                style={{
                  height: ITEM_H,
                  maxWidth: ITEM_H,
                  background: 'linear-gradient(180deg, #061529, #0b2340)',
                  boxShadow: parados[i]
                    ? 'inset 0 0 0 1px rgb(242 179 61 / .55), inset 0 8px 18px -8px rgb(0 0 0 / .9)'
                    : 'inset 0 0 0 1px rgb(255 255 255 / .07), inset 0 8px 18px -8px rgb(0 0 0 / .9)',
                }}
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
                      className="flex items-center justify-center p-3"
                      style={{ height: ITEM_H }}
                    >
                      <SymbolIcon index={n % SYMBOLS.length} />
                    </div>
                  ))}
                </div>

                {/* Curvatura del tambor: oscuro arriba y abajo, claro al centro.
                    Es lo que hace leer el rolo como un cilindro girando y no
                    como una lista que sube. */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(180deg, rgb(3 10 20 / .92), rgb(3 10 20 / .35) 22%, transparent 42%, transparent 58%, rgb(3 10 20 / .35) 78%, rgb(3 10 20 / .92))',
                  }}
                />

                {/* Destello al aterrizar: una banda de luz que cruza el cristal
                    de ese rolo. Se monta solo cuando para, así la animación
                    corre una vez y no queda nada girando después. */}
                {parados[i] && (
                  <span
                    key={`d${i}`}
                    aria-hidden="true"
                    className="anim-destello pointer-events-none absolute inset-y-0 -left-1/3 w-1/3"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent, rgb(255 255 255 / .5), transparent)',
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Línea de pago. Se enciende en dorado al ganar y arrastra los dos
              triángulos de los lados, que es como una máquina de verdad señala
              la línea premiada. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-4 top-1/2 flex -translate-y-1/2 items-center transition-opacity duration-500"
            style={{ opacity: gano ? 1 : 0.34, marginTop: '1.1rem' }}
          >
            <span
              className="h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent transition-colors duration-500"
              style={{ borderLeftColor: gano ? 'var(--color-dorado-2)' : 'rgb(242 179 61 / .5)' }}
            />
            <span
              className="h-px flex-1 transition-colors duration-500"
              style={{ background: gano ? 'var(--color-dorado-2)' : 'rgb(242 179 61 / .45)' }}
            />
            <span
              className="h-0 w-0 border-y-[5px] border-r-[7px] border-y-transparent transition-colors duration-500"
              style={{ borderRightColor: gano ? 'var(--color-dorado-2)' : 'rgb(242 179 61 / .5)' }}
            />
          </div>

          {/* Reflejo del cristal: una diagonal de luz muy tenue sobre TODO el
              frente. Va la última para quedar encima de los rolos. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(118deg, rgb(255 255 255 / .1) 0 22%, transparent 42%)',
            }}
          />
        </div>
      </div>

      {/* El `aria-live` va AQUÍ, no en la carcasa de los rolos.
          Estaba puesto en el div de las tres tiras, que solo contiene SVG sin
          texto: su `textContent` es "" en reposo y "" girando, o sea que nunca
          cambia y no hay nada que anunciar. El texto que sí cambia —"Girando…"
          / "Rolos: corona, pava, coquí"— vivía en este párrafo, FUERA de la
          región. Resultado medido: quien usa lector de pantalla no se enteraba
          ni de que la máquina giró ni de qué salió. Una región viva anuncia lo
          que hay dentro de ella; ponerla alrededor de dibujos no anuncia
          nada. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {girando
          ? 'Girando…'
          : `Rolos: ${visibles.map((v) => SYMBOLS[v]).join(', ')}`}
      </p>

      {/* El botón.
          Tiene GROSOR: un borde inferior oscuro que hace de canto. Al pulsarlo
          baja 2px y el canto se reduce a 1 — la tecla se hunde de verdad.
          Sin eso, un rectángulo que solo cambia de escala se siente a software;
          con eso, se siente a botón. */}
      <button
        type="button"
        onClick={tirar}
        disabled={girando || deshabilitado}
        className="group mt-6 w-full max-w-sm rounded-2xl border-b-[4px] border-b-[#8a5f0c] bg-gradient-to-b from-dorado-3 to-dorado-2 px-8 py-4 font-display text-lg font-bold tracking-wide text-tinta shadow-premio transition-[transform,border-width,box-shadow,filter] duration-150 enabled:hover:brightness-105 enabled:active:translate-y-[2px] enabled:active:border-b-[1px] disabled:cursor-not-allowed disabled:border-b-[2px] disabled:opacity-45"
      >
        <span className="flex items-center justify-center gap-2.5">
          {girando ? (
            <>
              GIRANDO
              {/* Tres puntos que laten por turnos. Una etiqueta fija que dice
                  "GIRANDO…" no informa de nada; esto dice "sigue vivo". */}
              <span className="flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((n) => (
                  <span
                    key={n}
                    className="anim-brillo h-1.5 w-1.5 rounded-full bg-tinta"
                    style={{ animationDelay: `${n * 180}ms`, animationDuration: '1.1s' }}
                  />
                ))}
              </span>
            </>
          ) : (
            etiquetaBoton
          )}
        </span>
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
