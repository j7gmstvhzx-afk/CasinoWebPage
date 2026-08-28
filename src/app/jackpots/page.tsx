import type { Metadata } from 'next';
import { JackpotBoard } from '@/components/jackpots/JackpotBoard';
import {
  getJackpots,
  getJackpotsAlDia,
  getPremiosPagados,
  getResumenSalon,
  getUltimaActualizacion,
  seguro,
} from '@/lib/queries';
import { money, relativeUpdate, longDate } from '@/lib/format';
import { Monto } from '@/components/site/Monto';

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

export const metadata: Metadata = {
  title: 'Jackpots',
  description:
    'Nuestro listado de premios actualizados a diario. Mira cuáles están más ' +
    'altos y en qué banco encontrarlos.',
};

export default async function PaginaJackpots() {
  const [jackpots, ultima, alDia, salon, pagados] = await Promise.all([
    seguro(getJackpots, []),
    seguro(getUltimaActualizacion, null),
    seguro(getJackpotsAlDia, false),
    seguro(getResumenSalon, { totalCentavos: 0, maquinas: 0, subioHoyCentavos: 0 }),
    seguro(getPremiosPagados, null),
  ]);

  return (
    <>
      {/* EL DINERO PRIMERO.
      
          Aquí había un titular "Jackpots" con dos frases de relleno —  "Nuestro
          listado de premios actualizados diariamente. ¡Ven y prueba tu suerte!"
          —  y había que bajar unos 700px en un teléfono para ver la primera
          cifra. Un tablero de premios tiene UNA cosa que decir al abrirse, y es
          cuánto hay en juego.

          El bloque va en azul de marca y la cifra en dorado: es el único sitio
          del sitio donde el dinero se enseña en grande, y tiene que pesar. */}
      <section className="bloque-marca relative overflow-hidden">
        <div className="patron-picas-oro pointer-events-none absolute inset-0 opacity-[0.14]" />
        <div className="contenedor relative py-9 sm:py-12">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-[#8ce8f6]">
            En juego ahora mismo
          </p>

          <Monto centavos={salon.totalCentavos} tam="xl" className="mt-2 font-display text-dorado-3" />

          <p className="mt-3 text-sm text-[#cfe0f5] sm:text-base">
            repartidos en{' '}
            <strong className="font-semibold text-white">
              {salon.maquinas} {salon.maquinas === 1 ? 'máquina' : 'máquinas'}
            </strong>{' '}
            del salón
            {/* El acumulado solo aparece si de verdad subió. Un "+$0.00" fijo
                debajo de la cifra grande resta en vez de sumar. */}
            {salon.subioHoyCentavos > 0 && (
              <>
                {' · '}
                <span className="whitespace-nowrap font-semibold text-gana-claro">
                  ▲ {money(salon.subioHoyCentavos)} desde la lectura anterior
                </span>
              </>
            )}
          </p>

          {ultima && <AvisoActualizacion ultima={ultima} alDia={alDia} />}
        </div>
      </section>

      {pagados && <PremiosPagadosPublico dato={pagados} />}

      <section className="contenedor py-10 sm:py-14">
        <JackpotBoard jackpots={jackpots} />

        <p className="mt-8 text-center text-xs text-tenue">
          Los montos se actualizan a lo largo del día y pueden variar al momento
          de tu visita.
        </p>
      </section>
    </>
  );
}

/**
 * Cuándo se actualizaron estos montos.
 *
 * Si son de hoy, basta con el punto verde y la hora: es la señal de "esto está
 * vivo". Si NO son de hoy hay que decirlo con todas las letras y con la fecha,
 * porque son cantidades de dinero por las que alguien maneja hasta Manatí.
 * Enseñar montos de hace una semana con el mismo puntito verde de siempre es
 * dejar que el visitante crea algo que no es.
 *
 * El corte a las 20 horas y no a las 24: la hoja se sube por la mañana, así que
 * a las 24 h una subida de ayer temprano todavía contaría como "de hoy" bien
 * entrada la tarde siguiente.
 */
function AvisoActualizacion({
  ultima,
  alDia,
}: {
  ultima: string | Date;
  alDia: boolean;
}) {
  if (alDia) {
    return (
      <p className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 bg-maquina/45 px-4 text-sm text-white">
        <span className="h-2 w-2 shrink-0 rounded-full bg-gana-claro anim-brillo" />
        <span className="text-[#dbe9f8]">Última actualización:</span>
        <span className="font-medium">{relativeUpdate(ultima)}</span>
      </p>
    );
  }

  return (
    <p className="mt-6 flex max-w-xl items-start gap-2.5 rounded-2xl border border-dorado/40 bg-dorado/10 px-4 py-3 text-sm text-tinta">
      <span aria-hidden="true" className="mt-px shrink-0">
        ⏳
      </span>
      <span>
        <strong className="font-semibold">
          Estos montos son del {longDate(ultima)}.
        </strong>{' '}
        Todavía no hemos subido los de hoy; los de verdad pueden estar más
        altos. Pregunta en el casino por el monto del momento.
      </span>
    </p>
  );
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Lo que el casino pagó en premios.
 *
 * Es la cifra que más convence de venir, y por eso mismo es la que más cuidado
 * pide: la escribe el personal en el panel y tiene que cuadrar con la caja. NO
 * se deduce de las lecturas. Se puede deducir —  cuando un progresivo cae en
 * picado, alguien lo pegó —  pero una caída también es un error de tecleo
 * corregido, una máquina reiniciada por mantenimiento o una que salió del
 * salón, y esto es una declaración pública de cuánto dinero paga el casino.
 *
 * Si el mes en curso todavía no tiene cifra, se enseña el último que la tenga
 * CON SU NOMBRE — "En julio pagamos…" — en vez de dejar que una cifra vieja
 * pase por la de este mes.
 */
function PremiosPagadosPublico({
  dato,
}: {
  dato: { mes: string; totalCentavos: number; premios: number; esMesActual: boolean };
}) {
  const [anio, mes] = dato.mes.split('-');
  const nombre = MESES[Number(mes) - 1];

  return (
    <section className="border-b border-linea bg-superficie">
      <div className="contenedor flex flex-wrap items-center justify-center gap-x-8 gap-y-4 py-7 text-center sm:py-9">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-tenue">
            {dato.esMesActual ? 'Pagado este mes' : `Pagado en ${nombre} de ${anio}`}
          </p>
          <Monto centavos={dato.totalCentavos} tam="lg" className="mt-1.5 font-display texto-dorado" />
        </div>

        <span aria-hidden="true" className="hidden h-12 w-px bg-linea sm:block" />

        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-tenue">
            Premios entregados
          </p>
          <p className="mt-1.5 font-display text-4xl font-bold tabular text-marca sm:text-5xl">
            {dato.premios}
          </p>
        </div>
      </div>
    </section>
  );
}
