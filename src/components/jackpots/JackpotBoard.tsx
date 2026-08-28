'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { JackpotVista } from '@/lib/queries';
import { money } from '@/lib/format';
import { FichaPuesto, FICHA } from '@/components/site/FichaPuesto';

/**
 * Tablero de jackpots.
 *
 * El número de banco va visible en cada tarjeta, y es el dato que convierte
 * esta página en tráfico real: el cliente ve el premio desde su casa y llega al
 * casino sabiendo exactamente a qué banco caminar. Sin él, la lista es
 * entretenimiento; con él, es una instrucción.
 *
 * -- Sobre el diseño --
 *
 * El tablero se lee como una JERARQUÍA DE FICHAS, no como una lista con estilo.
 * Cada premio lleva una ficha de póker con su puesto, y la ficha cambia de
 * material según lo alto que esté el premio: oro el 1º, plata el 2º, bronce el
 * 3º, y ficha azul de casa del 4º en adelante. Es la misma pieza repetida a
 * tres tamaños, así que la página se ve armada por alguien y no ensamblada.
 *
 * La textura de picas (patron-picas) sale del mandala del logo y va SIEMPRE por
 * debajo del 8% de opacidad. Aquí el contenido son cantidades de dinero: un
 * fondo que compita con esos números arruina justamente lo que la gente vino a
 * leer.
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
    if (q) {
      // Acepta nombre de máquina O número de banco: escribir "31" encuentra las
      // máquinas del banco 31, que es como la gente busca cuando ya estuvo aquí.
      lista = lista.filter(
        (j) => j.nombre.toLowerCase().includes(q) || String(j.banco) === q,
      );
    }

    // El orden por monto se decide AQUÍ, no se hereda.
    //
    // La consulta ya devuelve las filas de mayor a menor, y el tablero llevaba
    // tiempo dando por bueno ese orden. Pero de eso depende quién sale en el
    // podio y quién en la parrilla — es decir, qué cifra ve primero el
    // visitante — y no puede quedar colgando de un `order by` en un archivo
    // distinto que alguien cambie un día por otro motivo. Ordenar aquí cuesta
    // nada con veinte máquinas y hace la regla explícita: el más alto arriba,
    // siempre, lo devuelva como lo devuelva la base.
    return [...lista].sort((a, b) => b.centavos - a.centavos);
  }, [jackpots, busqueda, filtro]);

  // LOS CINCO PREMIOS MÁS ALTOS, EN TRES ESCALONES
  //
  //   1.º        solo, en su franja azul, con la cifra más grande de la página
  //   2.º y 3.º  debajo, en dos tarjetas de igual tamaño
  //   4.º y 5.º  otra fila de dos, un punto más pequeñas
  //   resto      la parrilla de siempre
  //
  // El tamaño baja en cada escalón a propósito: así el orden de importancia se
  // lee de un vistazo, sin comparar los números uno por uno. Es la misma
  // jerarquía de las fichas (oro, plata, bronce, casa) llevada al tamaño.
  //
  // Los escalones se muestran cuando lo que hay en pantalla ES el ranking
  // completo, no cuando el filtro dice "todos".
  //
  // La regla anterior miraba el filtro elegido, no el resultado. Con las quince
  // máquinas calientes a la vez —que pasa cuando todas vienen subiendo— pulsar
  // "🔥 Calientes" devolvía las MISMAS quince en el MISMO orden y aun así
  // derrumbaba la jerarquía entera: adiós tarjeta azul, adiós fichas, y el
  // premio mayor pasaba de 60px a 20px. Un filtro que no quita nada no puede
  // cambiar cómo se ve nada.
  //
  // Comparando longitudes, el podio aparece exactamente cuando no falta ningún
  // premio — filtre lo que filtre, y también si una búsqueda casa con todos.
  const mostrarPodio = filtrados.length === jackpots.length;
  const primero = mostrarPodio ? filtrados[0] : undefined;
  const podio2y3 = mostrarPodio ? filtrados.slice(1, 3) : [];
  const cuarto5 = mostrarPodio ? filtrados.slice(3, 5) : [];
  const resto = mostrarPodio ? filtrados.slice(5) : filtrados;
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
      {/* La barra de control va dentro de una pieza con textura, no suelta
          sobre el blanco. Con el buscador y los filtros flotando sin marco, la
          página empezaba con un formulario; enmarcados, empieza con un
          tablero. */}
      <div className="tarjeta-plana relative mb-5 overflow-hidden p-4 sm:p-5">
        <div
          aria-hidden="true"
          className="patron-picas pointer-events-none absolute inset-0 opacity-[0.05]"
        />

        <div className="relative">
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
            className="w-full rounded-2xl border border-linea bg-fondo py-3.5 pl-11 pr-4 text-base text-tinta placeholder:text-tenue/60 focus:border-cian focus:outline-none"
          />
        </div>

        <div
          className="relative mt-3 flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filtrar premios"
        >
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

          {cuarto5.length > 0 && (
            <ul className="mb-4 grid gap-3 sm:grid-cols-2">
              {cuarto5.map((j, i) => (
                <TarjetaCuarta key={j.id} j={j} puesto={i + 4} max={maxCentavos} />
              ))}
            </ul>
          )}

          {resto.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {resto.map((j, i) => (
                <FilaJackpot
                  key={j.id}
                  j={j}
                  max={maxCentavos}
                  // El puesto solo se numera con la lista COMPLETA. Filtrando o
                  // buscando, un "#6" saldría del subconjunto y mentiría sobre
                  // en qué lugar del salón está ese premio de verdad.
                  puesto={mostrarPodio ? i + 6 : undefined}
                />
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
      // El chip activo va en AZUL DE MARCA, no en dorado. Dos razones: el
      // dorado sobre el panel claro daba 3.41:1 en texto de 14px, por debajo
      // del 4.5:1 que hace falta para leerlo; y en este sitio el dorado
      // significa dinero — un filtro no es un premio. El azul relleno da 7.9:1
      // y además distingue el estado por relleno, no solo por color.
      // `min-h-11` = 44px de alto real.
      //
      // Con `py-1.5` medían 34px. Cumplen el mínimo AA de WCAG 2.2 (24x24), así
      // que no era un incumplimiento — pero estos tres chips son la interacción
      // PRINCIPAL de la página de premios, y se usan de pie, con una mano y el
      // teléfono en la otra. 44px es el tamaño que recomiendan Apple y el nivel
      // AAA, y aquí sí vale la pena.
      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        activo
          ? 'border-marca bg-marca text-white'
          : 'border-linea bg-fondo text-tenue hover:border-tenue hover:text-tinta'
      }`}
    >
      {children}
    </button>
  );
}

/** Franja fina proporcional al monto: da una lectura "de tablero" de un
 * vistazo, sin tener que leer los números uno por uno para comparar.
 *
 * `oscuro` cambia solo el CARRIL: sobre el azul del premio principal, un carril
 * gris claro se ve como una raya sucia, y a la vez la barra dorada pierde el
 * borde. En oscuro el carril es blanco translúcido. */
function BarraRelativa({
  centavos,
  max,
  className,
  oscuro,
}: {
  centavos: number;
  max: number;
  className?: string;
  oscuro?: boolean;
}) {
  const pct = max > 0 ? Math.max(4, Math.round((centavos / max) * 100)) : 0;
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full ${
        oscuro ? 'bg-white/15' : 'bg-linea/60'
      } ${className ?? ''}`}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-dorado-2 to-dorado-3"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const MEDALLA = [
  { anillo: 'from-dorado-3 via-dorado-2 to-dorado', halo: 'shadow-premio' },
  { anillo: 'from-slate-200 via-slate-300 to-slate-400', halo: 'shadow-suave' },
  { anillo: 'from-orange-200 via-orange-300 to-orange-400', halo: 'shadow-suave' },
] as const;

/** El premio del día, en su propia franja. Es la primera cifra que alguien ve
 * al entrar a la página, y tiene que leerse como un titular, no como una fila
 * más de una lista. */
function TarjetaHero({ j, max }: { j: JackpotVista; max: number }) {
  return (
    // El premio más alto deja de ser una tarjeta blanca más: pasa a ser una
    // pieza AZUL OSCURA, como la carcasa de la tragamonedas. Sobre una página
    // clara, un bloque oscuro es lo primero que mira el ojo, y el dorado del
    // dinero solo alcanza su brillo real sobre fondo oscuro.
    <div className="bloque-marca relative mb-4 overflow-hidden rounded-card shadow-alza">
      {/* Canto de ficha: las muescas del logo, convertidas en cinta superior. */}
      <div aria-hidden="true" className="cinta-ficha h-1.5 w-full" />

      {/* Tejido de picas del logo. Al 8% es textura, no dibujo. */}
      <div
        aria-hidden="true"
        className="patron-picas-oro pointer-events-none absolute inset-0 opacity-[0.08]"
      />
      {/* Anillos finos de billete, anclados a la esquina donde cae el monto. */}
      <div aria-hidden="true" className="guilloche pointer-events-none absolute inset-0" />

      <div className="relative px-5 py-7 sm:px-9 sm:py-9">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 max-w-full items-start gap-4">
            <FichaPuesto
              puesto={1}
              clase={`h-12 w-12 text-lg sm:h-14 sm:w-14 sm:text-xl ${FICHA[1]}`}
            />

            <div className="min-w-0">
              {/* Sin la palabra "hoy". El tablero puede estar enseñando los
                  montos de la última subida y no los de esta mañana, y la
                  fecha ya se dice arriba con todas las letras. Un titular que
                  promete "hoy" sobre una cifra de hace una semana es la clase
                  de detalle por el que alguien maneja hasta Manatí para nada. */}
              {/* Sin relleno, solo el borde.
                  El `bg-dorado-2/15` que llevaba antes aclaraba el fondo de
                  #455666 a #5f6460 y hundía el contraste del rótulo de 5.38:1 a
                  4.30:1 — por debajo del 4.5:1 que pide un texto de 10.4px,
                  aunque vaya en negrita. Es un fallo que no se ve calculando el
                  contraste contra el degradado a secas: hay que contar también
                  el propio relleno de la píldora. Quitándolo, el dorado se
                  queda y el texto cumple. */}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-dorado-2/50 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-dorado-3">
                Premio más alto
              </span>
              {/* Sin `truncate`: el nombre puede envolver en dos líneas. Este
                  es el titular de la página; cortar "Money In The Bank" en
                  "Money In The…" para ganar una línea no es un intercambio
                  razonable. */}
              <p className="mt-2.5 font-display text-2xl font-bold leading-tight text-white sm:text-3xl">
                {j.nombre}
              </p>
              {/* Sobre el azul oscuro el gris `tenue` cae a 2:1 y se vuelve
                  ilegible. Este azul claro da 4.96:1 en el PEOR punto de la
                  tarjeta — la esquina más clara del degradado, con las dos
                  texturas doradas encima aclarándola todavía más. Medido ahí y
                  no en el azul más oscuro: el mínimo para 12px es 4.5:1 y el
                  tono anterior (#a8c0e0) se quedaba en 4.06:1 justo en esa
                  esquina. */}
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs font-medium uppercase tracking-[0.18em] text-[#c0d3ec]">
                <span>Banco {j.banco}</span>
                {j.desactualizado && (
                  <span className="normal-case tracking-normal">· sin actualizar hoy</span>
                )}
              </p>
            </div>
          </div>

          {/* flex-wrap, y NADA de shrink-0 en celular: la tarjeta recorta lo que
              se salga (overflow-hidden), así que un grupo que no encoge no
              desborda la página — se le come el pixel. En un iPhone la flecha ↑
              del premio principal desaparecía entera, y por debajo de ~365px se
              cortaba el propio monto. Envolviendo, baja de línea en vez de
              perderse. */}
          <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 sm:w-auto sm:shrink-0 sm:flex-nowrap sm:justify-end">
            {j.caliente && (
              <span
                title="Por encima de su promedio de los últimos 30 días"
                className="anim-calor shrink-0 rounded-full border border-dorado-2/60 px-2.5 py-1 text-xs font-semibold text-dorado-3"
              >
                🔥 CALIENTE
              </span>
            )}
            {/* El monto y su flecha van en un grupo propio para que nunca se
                separen al envolver. Sueltos en el mismo flex, en un iPhone la
                flecha bajaba sola a la línea siguiente y quedaba como un signo
                huérfano flotando bajo la cifra. */}
            <span className="flex items-baseline gap-2">
              {/* dorado-3 y no dorado: el dorado de texto está oscurecido para
                  leerse sobre blanco y aquí el fondo es azul noche. El claro da
                  10:1 contra el azul y es el que de verdad brilla. */}
              <MontoAnimado
                centavos={j.centavos}
                className="font-display text-4xl font-bold tabular text-dorado-3 sm:text-6xl"
              />
              {j.tendencia === 'sube' && (
                <span aria-label="Subió desde la última lectura" className="text-2xl text-emerald-300">
                  ↑
                </span>
              )}
            </span>
          </div>
        </div>

        <BarraRelativa centavos={j.centavos} max={max} oscuro className="mt-6 h-2" />
      </div>
    </div>
  );
}

function TarjetaPodio({ j, puesto, max }: { j: JackpotVista; puesto: number; max: number }) {
  const m = MEDALLA[puesto - 1];
  return (
    <li
      className={`tarjeta relative min-w-0 overflow-hidden px-5 py-5 transition-transform hover:-translate-y-0.5 ${m.halo}`}
    >
      {/* La misma textura del héroe, en azul y aún más tenue: son piezas de la
          misma familia, no dos diseños pegados uno debajo del otro. */}
      <div
        aria-hidden="true"
        className="patron-picas pointer-events-none absolute inset-0 opacity-[0.055]"
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br opacity-20 blur-2xl ${m.anillo}`}
      />

      <div className="relative flex items-start gap-3.5">
        <FichaPuesto puesto={puesto} clase={`h-10 w-10 text-base ${puesto === 2 ? FICHA[2] : FICHA[3]}`} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-display text-lg font-semibold">{j.nombre}</p>
            {j.caliente && (
              <span
                title="Por encima de su promedio de los últimos 30 días"
                className="anim-calor shrink-0 rounded-full border border-dorado/40 bg-dorado/10 px-2 py-1 text-xs font-semibold text-tinta"
              >
                🔥
              </span>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs font-medium uppercase tracking-[0.18em] text-tenue">
            {/* La ficha de al lado es `aria-hidden` (es una imagen del puesto,
                no texto). Este renglón invisible es el que le da el puesto a
                quien navega con lector de pantalla. */}
            <span className="sr-only">Puesto {puesto}.</span>
            <span>Banco {j.banco}</span>
            {j.desactualizado && (
              <span className="normal-case tracking-normal text-tenue/70">· sin actualizar hoy</span>
            )}
          </p>
        </div>
      </div>

      <div className="relative mt-3 flex items-center gap-2">
        <MontoAnimado centavos={j.centavos} className="font-display text-3xl font-bold tabular texto-dorado" />
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

/**
 * El 4.º y el 5.º premio.
 *
 * Escalón intermedio: tiene la forma de tarjeta del podio —ficha, nombre, monto
 * debajo y barra— pero un punto más pequeño y sin el halo de color. Así se lee
 * que siguen siendo premios destacados sin competir con el podio, y a la vez se
 * distinguen de las filas de la parrilla, que son horizontales.
 *
 * La escala completa de los montos, de arriba abajo: 36/60 px el primero,
 * 30 px el 2.º y 3.º, 24 px el 4.º y 5.º, 20 px el resto. Ninguno baja de
 * 18.66 px en negrita, que es el umbral a partir del cual el dorado del dinero
 * cumple el contraste mínimo sobre blanco (3:1 en vez de 4.5:1).
 */
function TarjetaCuarta({ j, puesto, max }: { j: JackpotVista; puesto: number; max: number }) {
  return (
    <li className="tarjeta relative min-w-0 overflow-hidden px-5 py-4 transition-transform hover:-translate-y-0.5">
      <div
        aria-hidden="true"
        className="patron-picas pointer-events-none absolute inset-0 opacity-[0.05]"
      />

      <div className="relative flex items-start gap-3">
        <FichaPuesto puesto={puesto} clase={`h-9 w-9 text-sm ${FICHA.casa}`} />
        <span className="sr-only">Puesto {puesto}.</span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-display text-base font-semibold sm:text-lg">
              {j.nombre}
            </p>
            {j.caliente && (
              <span
                title="Por encima de su promedio de los últimos 30 días"
                className="anim-calor shrink-0 rounded-full border border-dorado/40 bg-dorado/10 px-2 py-1 text-xs font-semibold text-tinta"
              >
                🔥
              </span>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs font-medium uppercase tracking-[0.18em] text-tenue">
            <span>Banco {j.banco}</span>
            {j.desactualizado && (
              <span className="normal-case tracking-normal text-tenue/70">· sin actualizar hoy</span>
            )}
          </p>
        </div>
      </div>

      <div className="relative mt-2.5 flex items-center gap-2">
        <MontoAnimado centavos={j.centavos} className="font-display text-2xl font-bold tabular texto-dorado" />
        {j.tendencia === 'sube' && (
          <span aria-label="Subió desde la última lectura" className="text-gana">
            ↑
          </span>
        )}
      </div>

      <BarraRelativa centavos={j.centavos} max={max} className="relative mt-2.5" />
    </li>
  );
}

function FilaJackpot({ j, max, puesto }: { j: JackpotVista; max: number; puesto?: number }) {
  return (
    // min-w-0 NO es decoración: un ítem de grid tiene `min-width: auto` por
    // defecto, así que no se puede encoger por debajo del ancho mínimo de su
    // contenido. Sin esto, en pantallas angostas la fila se sale del track (la
    // insignia CALIENTE y el monto no encogen) y toda la página queda con
    // scroll horizontal.
    <li className="tarjeta relative flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 overflow-hidden px-5 py-4 transition-colors hover:border-marca/25 sm:px-6 sm:py-5">
      <div
        aria-hidden="true"
        className="patron-picas pointer-events-none absolute inset-0 opacity-[0.04]"
      />

      {/* basis-40 le da un ancho "deseado" al nombre: cuando el monto y la
          insignia ya no caben al lado, el grupo de la derecha baja de línea en
          vez de estrujar el nombre. Antes, "Money In The Bank" se quedaba con
          46px y salía como "Mon…". */}
      <div className="relative flex min-w-0 flex-1 basis-40 items-center gap-3">
        {puesto !== undefined && (
          // Ficha "de la casa": azul, más chica y sin metal. El puesto 4 en
          // adelante existe, pero no compite con el podio.
          <>
            <FichaPuesto
              puesto={puesto}
              clase={`h-9 w-9 text-sm ${FICHA.casa}`}
            />
            <span className="sr-only">Puesto {puesto}.</span>
          </>
        )}

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
      </div>

      <div className="relative flex shrink-0 items-center gap-3">
        {j.caliente && (
          <span
            title="Por encima de su promedio de los últimos 30 días"
            // El rótulo va en tinta y no en dorado: a 12px hace falta 4.5:1 y
            // el dorado de marca se queda en 3.63:1 sobre blanco. El envase
            // dorado (borde y fondo) es el que carga la señal de "premio
            // caliente"; el texto solo tiene que leerse.
            className="anim-calor rounded-full border border-dorado/40 bg-dorado/10 px-2.5 py-1 text-xs font-semibold text-tinta"
          >
            🔥 CALIENTE
          </span>
        )}
        {j.tendencia === 'sube' && (
          <span aria-label="Subió desde la última lectura" className="text-gana">
            ↑
          </span>
        )}

        {/* text-xl fijo, sin subir a 2xl en pantalla grande: en escritorio
            igualaba al 4.º y 5.º y rompía la escala. 20px en negrita sigue
            contando como texto grande, que es lo que el dorado necesita para
            cumplir el contraste. */}
        <MontoAnimado
          centavos={j.centavos}
          className="font-display text-xl font-bold tabular text-dorado"
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
