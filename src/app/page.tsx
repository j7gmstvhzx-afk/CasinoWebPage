import Link from 'next/link';
import { PromoExperience } from '@/components/slot/PromoExperience';
import { Marco } from '@/components/site/Marco';
import { FichaPuesto, FICHA } from '@/components/site/FichaPuesto';
import {
  getJackpots,
  getMaquinasNuevas,
  getEventos,
  getHorario,
  getPremiosPagados,
  getPrograma,
  getUltimaActualizacion,
  seguro,
  pagosEnCero,
  paraLaPagina,
  algunoFallo,
} from '@/lib/queries';
import { money, relativeUpdate, longDate } from '@/lib/format';
import { SITE, PROMO, fullAddress } from '@/lib/site';
import { ParteDelDia } from '@/components/site/ParteDelDia';
import { HorarioTexto } from '@/components/site/HorarioTexto';
import { PagadoEsteMes } from '@/components/site/PagadoEsteMes';
import { estadoDelSalon, programaDelDia } from '@/lib/horario';

// Esta página se sirve de caché y se rehace cada minuto en segundo plano.
//
// Antes era force-dynamic: consultaba la base en CADA visita, así que una base
// lenta se llevaba por delante la pestaña entera (ver `seguro` en
// lib/queries.ts). Nada de lo que se muestra aquí cambia de un visitante a
// otro, y lo edita el personal cada varias horas: no hay razón para pagar una
// consulta por visita. Al publicar desde el panel se invalida al instante con
// revalidatePath, así que el minuto no retrasa a nadie.
export const revalidate = 60;

// Techo de la función. Por defecto Vercel deja llegar a 300 s, que fue el
// tiempo exacto que las pestañas se quedaron colgadas en producción.
export const maxDuration = 15;

export default async function Inicio() {
  const [rJackpots, rMaquinas, rEventos, ultima, horario, programa, rPagados] =
    await Promise.all([
      // Estas cuatro son el contenido de la portada, y si una falla NO se pinta
      // una portada a medias: se lanza, Next descarta la regeneración y el
      // visitante sigue viendo la última portada buena. Antes la sección
      // desaparecía en silencio y volvía sola al rato — el "a veces sale y a
      // veces no" que reportó el dueño. Ver `paraLaPagina` en lib/queries.ts.
      paraLaPagina(getJackpots, 'los premios', []),
      paraLaPagina(() => getMaquinasNuevas(6), 'las máquinas nuevas', []),
      paraLaPagina(() => getEventos(3), 'las promociones', []),
      seguro(getUltimaActualizacion, null),
      // Respaldo: una semana entera sin horario. La banda se esconde sola en vez
      // de anunciar que el casino está cerrado porque una consulta falló.
      seguro(getHorario, { semana: Array(7).fill(null), excepciones: {} }),
      seguro(getPrograma, []),
      paraLaPagina(getPremiosPagados, 'los premios pagados del mes', pagosEnCero()),
    ]);

  const jackpots = rJackpots.datos;
  const maquinas = rMaquinas.datos;
  const eventos = rEventos.datos;
  const pagados = rPagados.datos;

  // Solo puede ser cierto durante un build que no alcanzó la base (en ejecución
  // `paraLaPagina` habría lanzado). La página se hornea diciendo la verdad —que
  // se está actualizando— en vez de afirmar que el casino no tiene nada, y se
  // rellena sola en cuanto alguien la visite.
  const sinLeer = algunoFallo(rJackpots, rMaquinas, rEventos, rPagados);

  // CINCO, y salen ordenados de mayor a menor sin que nadie los ordene:
  // `getJackpots` ya devuelve la lista por monto descendente, así que al entrar
  // una lectura nueva desde el panel la máquina sube o baja de puesto sola.
  const destacados = jackpots.slice(0, 5);

  return (
    <>
      {sinLeer && (
        <p className="contenedor py-3 text-sm text-tenue">
          Estamos actualizando esta página. Vuelve en un momento.
        </p>
      )}
      {/* EL PARTE DEL DÍA, ANTES QUE NADA.

          Lo primero que quiere saber quien abre la página de un casino es si
          está abierto ahora. Hasta ahora eso no se podía contestar: el horario
          era una cadena de texto escrita a mano en site.ts.

          El estado se calcula aquí para que la página tenga sentido sin
          JavaScript, y se vuelve a calcular en el navegador porque esta página
          se sirve de caché y "Abierto ahora" es la frase que más caro sale
          equivocada. */}
      <ParteDelDia
        horario={horario}
        programa={programa}
        inicial={estadoDelSalon(horario)}
        programaInicial={programaDelDia(programa)}
      />

      {/* LO PAGADO EN EL MES, ARRIBA DEL TODO.

          Es la cifra que contesta la pregunta que trae a alguien a la página de
          un casino: ¿este sitio paga? Sale sola la entrada del mes en curso que
          haya hecho el administrador, así que en cuanto se guarda una cifra
          nueva, es la que se ve.

          SE PINTA SIEMPRE, AUNQUE SEA CERO. Antes se escondía cuando no había
          cifra —"mejor que un $0.00"— y el resultado fue que el dueño abrió la
          portada tres veces buscándola sin encontrar ni la cifra ni el motivo
          de su ausencia. El hueco se le enseñaba a él igual que a un cliente,
          así que escondía justo la señal de que faltaba teclearla. */}
      <PagadoEsteMes dato={pagados} />

      {/* ---------------------------------------------------------------- */}
      {/* Premios más altos — LO PRIMERO DE LA PÁGINA                        */}
      {/*                                                                    */}
      {/* Va por encima de la portada a propósito. El premio progresivo es lo */}
      {/* que trae gente al salón: el cliente mira la cifra desde su casa y   */}
      {/* llega sabiendo a qué banco caminar. Debajo del héroe había que      */}
      {/* hacer scroll para verlo, y en un celular eso son dos pantallas.     */}
      {/* La promoción de los $25 no pierde nada: se queda justo debajo con   */}
      {/* su máquina, más el pop-up de entrada y el botón flotante.           */}
      {/* ---------------------------------------------------------------- */}
      {destacados.length > 0 && (
        <section className="revela contenedor pb-10 pt-8 sm:pb-12 sm:pt-10">
          <EncabezadoSeccion
            compacto
            comoH1
            titulo="Los cinco premios más altos ahora"
            enlace={{ href: '/jackpots', texto: 'Ver todos' }}
            nota={ultima ? `Actualizado ${relativeUpdate(ultima)}` : undefined}
          />

          {/* Las mismas fichas del tablero de /jackpots, con el mismo material
              por puesto. Quien llega a la portada y luego entra al tablero ve
              la misma pieza: es un solo sitio, no dos pantallas parecidas. */}
          {/* Dos columnas desde 380px, una sola por debajo.
              Apiladas de una en una, las cuatro tarjetas medían 853px contra
              una ventana de 664: al entrar solo se veían DOS premios y el héroe
              quedaba a pantalla y media. En dos columnas caben los cuatro de un
              vistazo, que es justo para lo que se subieron aquí arriba.
              Pero a 320px dos columnas dejan unos 60px para el nombre —
              descontando la ficha y su hueco— y ahí no cabe "Lightning" ni
              partiéndolo: la tinta se salía 35px de su caja y se pintaba encima
              del 🔥 de al lado, dejando "Lightni🔥g Link". Por debajo de 380px
              se vuelve a una columna: en el teléfono más estrecho pesa más leer
              el nombre entero que ahorrar scroll. */}
          <ul className="mt-6 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:grid-cols-5">
            {destacados.map((j, i) => (
              <li key={j.id} className="tarjeta relative overflow-hidden p-5">
                <div
                  aria-hidden="true"
                  className="patron-picas pointer-events-none absolute inset-0 opacity-[0.09]"
                />
                <div className="relative flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <FichaPuesto
                      puesto={i + 1}
                      clase={`h-8 w-8 text-sm ${
                        i === 0 ? FICHA[1] : i === 1 ? FICHA[2] : i === 2 ? FICHA[3] : FICHA.casa
                      }`}
                    />
                    {/* break-words como red de seguridad: si algún día entra
                        una máquina con un nombre de una sola palabra muy larga,
                        que se parta en vez de pintarse sobre el vecino. */}
                    <p className="min-w-0 break-words font-display text-sm font-semibold leading-tight sm:text-base">
                      {j.nombre}
                    </p>
                  </div>
                  {j.caliente && (
                    <span className="anim-brillo shrink-0 text-sm" title="Premio caliente">
                      🔥
                    </span>
                  )}
                </div>
                {/* 20px en celular y 24 desde `sm`: en media columna de un
                    teléfono de 320px, "$12,204.01" a 24px no cabe. 20px en
                    negrita sigue contando como texto grande, que es lo que el
                    dorado necesita para cumplir el contraste. */}
                <p className="relative mt-3 font-display text-xl font-bold tabular text-dorado sm:text-2xl">
                  {money(j.centavos)}
                </p>
                <p className="relative mt-1 text-xs uppercase tracking-[0.18em] text-tenue">
                  Banco {j.banco}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Portada: el premio y la máquina, arriba del todo.                  */}
      {/* La foto de la fachada pasa a un segundo plano a propósito — es      */}
      {/* bonita, pero no es lo que hace que alguien deje su celular.        */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              // Muy tenues: sobre blanco, lo que en el tema oscuro era un halo
              // sutil se convierte en dos manchas de color.
              'radial-gradient(48rem 30rem at 18% -10%, rgb(43 169 224 / .10), transparent 60%),' +
              'radial-gradient(40rem 26rem at 90% 0%, rgb(242 179 61 / .09), transparent 58%)',
          }}
        />

        {/* El mismo tejido de picas que llevan las cabeceras de las demás
            páginas. La portada era la única banda del sitio sin textura, y se
            notaba: entrabas a una hoja en blanco y las secciones interiores sí
            estaban vestidas. */}
        <div
          aria-hidden="true"
          className="patron-picas pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            WebkitMaskImage: 'linear-gradient(180deg, #000 0%, transparent 88%)',
            maskImage: 'linear-gradient(180deg, #000 0%, transparent 88%)',
          }}
        />

        <div className="contenedor relative grid items-center gap-12 py-14 lg:grid-cols-[1.05fr_auto] lg:gap-16 lg:py-20">
          <div>
            {/* Texto en tinta, no en dorado: a 12px hace falta 4.5:1 y el
                dorado de marca se queda en 3.63:1 sobre blanco. El borde y el
                fondo dorados siguen diciendo "promoción"; el rótulo solo tiene
                que leerse. Es el mismo criterio que la insignia CALIENTE del
                tablero de premios. */}
            <p className="inline-flex items-center gap-2 rounded-full border border-dorado/40 bg-dorado/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-tinta">
              Promoción del día
            </p>

            {/* h2 y no h1: el h1 de la página es ahora "Premios más altos
                ahora", que es lo que abre la portada. El tamaño no cambia —
                este sigue siendo el titular grande — solo el nivel, para que el
                orden de encabezados vuelva a ser 1, 2, 2, 2. */}
            <h2 className="mt-5 font-display text-5xl font-bold leading-[1.05] sm:text-7xl">
              Gira y gana{' '}
              <span className="texto-dorado">{PROMO.prizeLabel}</span> en
              efectivo
            </h2>

            <p className="mt-5 max-w-xl text-lg leading-relaxed text-tenue">
              Una tirada gratis cada día. Si te salen tres símbolos iguales,
              recibes un cupón digital que canjeas en Servicio al Cliente.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/jackpots"
                className="rounded-2xl border border-linea bg-superficie px-6 py-3.5 font-medium transition-colors hover:border-cian hover:text-cian"
              >
                Ver jackpots de hoy
              </Link>
              <a
                href={SITE.waze}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-2xl border border-linea px-6 py-3.5 font-medium text-tenue transition-colors hover:border-cian hover:text-cian"
              >
                Cómo llegar
              </a>
            </div>

            <p className="mt-6 text-sm text-tenue">
              {SITE.address.city}, Puerto Rico
            </p>
          </div>

          {/* La máquina va embebida en la portada, no solo en el modal: quien
              cerró el modal tiene que seguir topándose con ella. */}
          <div className="w-full rounded-3xl border border-linea bg-fondo p-6 shadow-alza sm:p-8 lg:w-[27rem]">
            <PromoExperience />
          </div>
        </div>

        {/* Las muescas del canto de la ficha cierran la portada igual que
            cierran cada cabecera: es el mismo remate en todo el sitio. */}
        <div
          aria-hidden="true"
          className="cinta-ficha absolute inset-x-0 bottom-0 h-[3px] opacity-45"
        />
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Máquinas nuevas                                                   */}
      {/* ---------------------------------------------------------------- */}
      {maquinas.length > 0 && (
        // Banda de superficie con textura. La portada era una sola hoja blanca
        // de arriba abajo: sin un cambio de fondo, cuatro secciones seguidas se
        // leen como una sola lista larga. Alternar da respiro y marca dónde
        // empieza cada cosa.
        <section className="revela relative border-y border-linea bg-superficie">
          <div
            aria-hidden="true"
            className="patron-picas pointer-events-none absolute inset-0 opacity-[0.10]"
          />
          <div className="contenedor relative py-14">
          <EncabezadoSeccion
            titulo="Máquinas recién llegadas"
            enlace={{ href: '/maquinas-nuevas', texto: 'Ver todas' }}
          />

          <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {maquinas.slice(0, 3).map((m) => (
              <li key={m.id} className="tarjeta overflow-hidden">
                <Marco imagen={m.image_path} alt={m.name} proporcion="aspect-square" />
                <div className="p-5">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-cian/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-tinta">
                      Nueva
                    </span>
                    {m.bank_number !== null && (
                      <span className="text-xs text-tenue">Banco {m.bank_number}</span>
                    )}
                  </div>
                  <p className="mt-2.5 font-display text-lg font-semibold">{m.name}</p>
                  {m.description && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-tenue">{m.description}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Eventos                                                           */}
      {/* ---------------------------------------------------------------- */}
      {eventos.length > 0 && (
        <section className="revela contenedor py-14">
          <EncabezadoSeccion
            titulo="Eventos y promociones"
            enlace={{ href: '/eventos', texto: 'Ver todos' }}
          />

          <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {eventos.map((e) => (
              <li key={e.id} className="tarjeta overflow-hidden">
                <Marco imagen={e.image_path} alt={e.title} />
                <div className="p-5">
                  <p className="font-display text-lg font-semibold">{e.title}</p>
                  {/* El rango entero, no solo la fecha de inicio.
                      Un evento que empezó el 18 y acaba el 17 del mes que viene
                      está EN CURSO, pero enseñando solo su fecha de inicio se
                      leía como algo ya pasado — y encima aparecía debajo de dos
                      eventos futuros. En /eventos ya se mostraba el rango; aquí
                      faltaba. */}
                  {(e.starts_on || e.ends_on) && (
                    <p className="mt-1 text-sm text-cian">
                      {e.starts_on && e.ends_on && e.starts_on !== e.ends_on
                        ? `${longDate(e.starts_on)} — ${longDate(e.ends_on)}`
                        : longDate((e.starts_on ?? e.ends_on)!)}
                    </p>
                  )}
                  {e.body && (
                    <p className="mt-2 line-clamp-3 text-sm text-tenue">{e.body}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Visítanos                                                         */}
      {/* ---------------------------------------------------------------- */}
      <section className="revela contenedor py-14">
        <div className="tarjeta relative grid gap-8 overflow-hidden p-8 sm:p-10 md:grid-cols-2">
          <div
            aria-hidden="true"
            className="patron-picas pointer-events-none absolute inset-0 opacity-[0.10]"
          />
          <div className="relative">
            <h2 className="font-display text-3xl font-bold">Visítanos</h2>
            <address className="mt-5 space-y-3 not-italic text-tenue">
              <p className="text-tinta">{fullAddress()}</p>
              <p>
                <a className="inline-flex min-h-11 items-center hover:text-cian" href={`tel:${SITE.phone}`}>
                  {SITE.phoneDisplay}
                </a>
              </p>
              <HorarioTexto />
            </address>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={SITE.waze}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-11 items-center rounded-xl bg-cian px-5 text-sm font-semibold text-white"
              >
                Abrir en Waze
              </a>
              <a
                href={SITE.maps}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-xl border border-linea px-5 py-2.5 text-sm font-medium transition-colors hover:border-cian hover:text-cian"
              >
                Google Maps
              </a>
            </div>
          </div>

          <ul className="relative grid grid-cols-2 gap-4 self-center">
            {[
              { n: '285+', t: 'Máquinas' },
              { n: '6', t: 'Mesas de juego' },
              { n: '16 h', t: 'Abierto al día' },
              { n: PROMO.prizeLabel, t: 'Premio diario' },
            ].map((s) => (
              <li key={s.t} className="rounded-2xl border border-linea bg-superficie p-5 text-center">
                <p className="font-display text-3xl font-bold text-cian tabular">{s.n}</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-tenue">{s.t}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function EncabezadoSeccion({
  titulo,
  enlace,
  nota,
  compacto,
  comoH1,
}: {
  titulo: string;
  enlace?: { href: string; texto: string };
  nota?: string;
  /**
   * Titular más pequeño. Lo usa la sección de premios, que ahora abre la
   * página: a tamaño completo, en un teléfono el titular con su regla y su nota
   * se comía 350px antes de la primera cifra — justo lo que se subió aquí para
   * que se viera de entrada.
   */
  compacto?: boolean;
  /**
   * Renderiza el título como `h1` en vez de `h2`.
   *
   * Al subir los premios por encima de la portada, el primer encabezado del
   * documento pasó a ser un h2 y el h1 quedaba más abajo. Funcionaba, pero el
   * orden de encabezados dejaba de ser descendente y quien navega por títulos
   * con un lector de pantalla se encontraba el nivel 2 antes que el 1.
   *
   * El nivel no lo decide el tamaño de la letra: este h1 se sigue viendo
   * compacto. Lo que dice es cuál es el tema de la página, y en un casino cuyo
   * reclamo son los progresivos, ese tema son los premios.
   */
  comoH1?: boolean;
}) {
  const Titulo = comoH1 ? 'h1' : 'h2';
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Titulo
          className={`font-display font-bold ${
            compacto ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'
          }`}
        >
          {titulo}
        </Titulo>
        {/* Un trocito del canto de la ficha bajo cada título. Es lo mínimo que
            hace falta para que un encabezado se lea como parte de un sistema y
            no como texto grande suelto. */}
        <div aria-hidden="true" className="cinta-ficha mt-3 h-[3px] w-16" />
        {nota && <p className="mt-2.5 text-sm text-tenue">{nota}</p>}
      </div>
      {enlace && (
        // 44px de alto, no 24.
        //
        // Estaba en 24 —  el mínimo AA de WCAG 2.2 —  y el razonamiento de
        // entonces terminaba en "tiene que ser fácil de dar con el pulgar", que
        // es justamente el argumento para subirlo. No es un enlace suelto
        // dentro de un párrafo (esos están exentos y estirarlos rompería el
        // renglón): es el acceso a una sección entera.
        <Link
          href={enlace.href}
          className="inline-flex min-h-11 items-center text-sm font-medium text-cian underline-offset-4 hover:underline"
        >
          {enlace.texto} →
        </Link>
      )}
    </div>
  );
}
