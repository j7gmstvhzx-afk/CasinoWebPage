import type { Metadata } from 'next';
import { JackpotBoard } from '@/components/jackpots/JackpotBoard';
import {
  getJackpots,
  getJackpotsAlDia,
  getPremiosPagados,
  pagosEnCero,
  getResumenSalon,
  getUltimaActualizacion,
  seguro,
  type PremiosPagados,
  type ResumenSalon,
} from '@/lib/queries';
import { money, relativeUpdate, longDate } from '@/lib/format';
import { Monto } from '@/components/site/Monto';
import { nombreMesDe } from '@/lib/hora-pr';

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
    'Cuánto pagamos en premios este mes y qué máquinas tienen los progresivos ' +
    'más altos del salón.',
};

export default async function PaginaJackpots() {
  const [jackpots, ultima, alDia, salon, pagados] = await Promise.all([
    seguro(getJackpots, []),
    seguro(getUltimaActualizacion, null),
    seguro(getJackpotsAlDia, false),
    // El respaldo es `null` y NO `{ total: 0, maquinas: 0 }`.
    //
    // Con el cero por respaldo, una consulta que no vuelve a tiempo se pintaba
    // igual que un salón sin una sola máquina: "$0.00 repartidos en 0
    // máquinas", en letra grande y en la primera pantalla, mientras la lista de
    // debajo enseñaba quince máquinas con sus montos. Pasó en producción.
    //
    // Un cero es una AFIRMACIÓN sobre el dinero del salón. Cuando no se sabe,
    // hay que no decir nada; callar se entiende, mentir no.
    seguro<ResumenSalon | null>(getResumenSalon, null),
    seguro(getPremiosPagados, pagosEnCero()),
  ]);

  return (
    <>
      <Portada salon={salon} pagados={pagados} ultima={ultima} alDia={alDia} />

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
 * "2026-08-01" -> "agosto".
 *
 * Se parte la cadena en vez de usar `new Date`: la columna es un DÍA DE
 * CALENDARIO, y `new Date('2026-08-01')` lo lee como medianoche UTC, que desde
 * Puerto Rico (UTC-4) es el 31 de julio a las 8 p.m. El mes se cambiaría solo.
 */

/**
 * La primera pantalla de la pestaña de premios.
 *
 * QUÉ SE DICE PRIMERO
 * -------------------
 * Abría con "EN JUEGO AHORA MISMO" y el total de los progresivos. Es un buen
 * número, pero dice cuánto hay ACUMULADO, no cuánto SALE. Lo que convence de
 * manejar hasta Manatí es saber que aquí se paga, y eso es lo que pidió el
 * dueño que fuera el titular.
 *
 * Así que el titular es lo pagado en el mes, con EL NOMBRE DEL MES puesto solo
 * desde la fecha del propio dato. Nadie tiene que acordarse de cambiar un
 * texto el día 1.
 *
 * El total en juego no se pierde: baja a la línea de apoyo, donde sigue
 * sumando ("y además hay tanto acumulado ahora mismo") sin robarle el sitio al
 * titular.
 *
 * CUANDO TODAVÍA NO HAY CIFRA DEL MES
 * -----------------------------------
 * Se enseña el mes en curso en cero. Antes se caía al titular del dinero EN
 * JUEGO —la suma de los progresivos disponibles— y eso resultó peor que el
 * cero que trataba de evitar: son dos cifras grandes y doradas en el mismo
 * sitio, y el total acumulado dentro de las máquinas se leyó como el total
 * pagado. Lo reportó el dueño desde una captura.
 *
 * Ahora el titular contesta SIEMPRE la misma pregunta —cuánto se ha pagado— y
 * lo acumulado baja a la línea de apoyo, donde ya dice que todavía no ha caído.
 *
 * El titular es el `h1` de la página. No es decoración: `/jackpots` no tenía
 * NINGÚN encabezado, así que quien llega con un lector de pantalla a la página
 * que es el reclamo principal del sitio no tenía por dónde entrar.
 */
function Portada({
  salon,
  pagados,
  ultima,
  alDia,
}: {
  salon: ResumenSalon | null;
  pagados: PremiosPagados;
  ultima: string | Date | null;
  alDia: boolean;
}) {
  const hayJuego = salon !== null && salon.maquinas > 0;

  return (
    <section className="bloque-marca relative overflow-hidden">
      <div className="patron-picas-oro pointer-events-none absolute inset-0 opacity-[0.14]" />
      <div className="contenedor relative py-9 sm:py-12">
        <TitularPagado pagados={pagados} />

        {/* La línea de apoyo: lo que hay ACUMULADO en las máquinas ahora. Es
            dinero esperando dentro de ellas, no dinero pagado, y por eso va
            aquí abajo y con su aclaración, nunca como titular. */}
        {hayJuego && (
          <p className="mt-5 max-w-2xl text-sm text-[#cfe0f5] sm:text-base">
            Y ahora mismo hay{' '}
            <strong className="whitespace-nowrap font-semibold text-dorado-3">
              {money(salon!.totalCentavos)}
            </strong>{' '}
            acumulados sin caer en{' '}
            <strong className="font-semibold text-white">
              {salon!.maquinas} {salon!.maquinas === 1 ? 'máquina' : 'máquinas'}
            </strong>{' '}
            del salón: es lo que hay para ganar
            {salon!.subioHoyCentavos > 0 && (
              <>
                {' · '}
                <span className="whitespace-nowrap font-semibold text-gana-claro">
                  ▲ {money(salon!.subioHoyCentavos)} desde la lectura anterior
                </span>
              </>
            )}
          </p>
        )}

        {ultima && <AvisoActualizacion ultima={ultima} alDia={alDia} />}
      </div>
    </section>
  );
}

/**
 * El titular de la página: lo que el casino lleva pagado este mes.
 *
 * Es el `h1` de /jackpots. La página no tenía ningún encabezado —ni uno— así
 * que en un lector de pantalla no había forma de saber de qué iba ni de saltar
 * a su contenido. El titular ya era visualmente el encabezado; ahora también lo
 * es en el marcado.
 */
function TitularPagado({ pagados }: { pagados: PremiosPagados }) {
  const { mes } = nombreMesDe(pagados.mes);
  const sinCifra = pagados.premios === 0 && pagados.totalCentavos === 0;

  return (
    <>
      <h1 className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-[#8ce8f6]">
        {/* El mes sale del dato, no de un texto escrito a mano, y el dato es
            SIEMPRE el mes en curso en Puerto Rico. */}
        Total de premios pagados en {mes}, hasta hoy
      </h1>

      <Monto
        centavos={pagados.totalCentavos}
        tam="xl"
        className="mt-2 font-display text-dorado-3"
      />

      {/* La cuenta de premios va EN UNA LÍNEA, no en un número grande al lado.
          Se probó al lado, a 4xl: en un teléfono el "7" caía debajo del monto,
          igual de grande y en blanco, y la pantalla abría con dos números
          enormes peleándose por ser el titular. Un titular es uno. */}
      {sinCifra ? (
        <p className="mt-3 text-sm text-[#cfe0f5] sm:text-base">
          Todavía no hay premios registrados este mes.
          {pagados.anterior && (
            <>
              {' '}
              En {nombreMesDe(pagados.anterior.mes).mes} se pagaron{' '}
              <strong className="whitespace-nowrap font-semibold text-dorado-3">
                {money(pagados.anterior.totalCentavos)}
              </strong>{' '}
              en {pagados.anterior.premios}{' '}
              {pagados.anterior.premios === 1 ? 'premio' : 'premios'}.
            </>
          )}
        </p>
      ) : (
        <p className="mt-3 text-sm text-[#cfe0f5] sm:text-base">
          en{' '}
          <strong className="font-display text-lg font-bold tabular text-white sm:text-xl">
            {pagados.premios}
          </strong>{' '}
          {pagados.premios === 1 ? 'premio entregado' : 'premios entregados'}
        </p>
      )}
    </>
  );
}

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
    <p className="mt-6 flex max-w-xl items-start gap-2.5 rounded-2xl border border-dorado-2/45 bg-maquina/50 px-4 py-3 text-sm text-[#e2ecf8]">
      <span aria-hidden="true" className="mt-px shrink-0">
        ⏳
      </span>
      <span>
        <strong className="font-semibold text-[#ffe9bf]">
          Estos montos son del {longDate(ultima)}.
        </strong>{' '}
        Todavía no hemos subido los de hoy; los de verdad pueden estar más
        altos. Pregunta en el casino por el monto del momento.
      </span>
    </p>
  );
}
