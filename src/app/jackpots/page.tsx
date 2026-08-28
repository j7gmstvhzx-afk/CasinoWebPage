import type { Metadata } from 'next';
import { JackpotBoard } from '@/components/jackpots/JackpotBoard';
import {
  getJackpots,
  getJackpotsAlDia,
  getPremiosPagados,
  getResumenSalon,
  getUltimaActualizacion,
  seguro,
  type PremiosPagados,
  type ResumenSalon,
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
    seguro(getPremiosPagados, null),
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

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * "2026-08-01" -> "agosto".
 *
 * Se parte la cadena en vez de usar `new Date`: la columna es un DÍA DE
 * CALENDARIO, y `new Date('2026-08-01')` lo lee como medianoche UTC, que desde
 * Puerto Rico (UTC-4) es el 31 de julio a las 8 p.m. El mes se cambiaría solo.
 */
function nombreMes(iso: string): { mes: string; anio: string } {
  const [anio, mes] = iso.split('-');
  return { mes: MESES[Number(mes) - 1] ?? '', anio };
}

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
 * No se enseña "$0.00 pagados", que es lo peor que podría decir esta página.
 * Se cae al titular anterior —  el dinero en juego —  hasta que el panel tenga
 * la cifra. Y si tampoco hay montos, no hay portada: nada mejor que una cifra
 * inventada.
 */
function Portada({
  salon,
  pagados,
  ultima,
  alDia,
}: {
  salon: ResumenSalon | null;
  pagados: PremiosPagados | null;
  ultima: string | Date | null;
  alDia: boolean;
}) {
  const hayJuego = salon !== null && salon.maquinas > 0;
  if (!pagados && !hayJuego) return null;

  return (
    <section className="bloque-marca relative overflow-hidden">
      <div className="patron-picas-oro pointer-events-none absolute inset-0 opacity-[0.14]" />
      <div className="contenedor relative py-9 sm:py-12">
        {pagados ? (
          <TitularPagado pagados={pagados} />
        ) : (
          <TitularEnJuego salon={salon!} />
        )}

        {/* La línea de apoyo. Solo aparece si el titular es el de lo pagado —
            si el titular YA es el dinero en juego, repetirlo aquí sobra. */}
        {pagados && hayJuego && (
          <p className="mt-5 max-w-2xl text-sm text-[#cfe0f5] sm:text-base">
            Y ahora mismo hay{' '}
            <strong className="whitespace-nowrap font-semibold text-dorado-3">
              {money(salon!.totalCentavos)}
            </strong>{' '}
            acumulados en{' '}
            <strong className="font-semibold text-white">
              {salon!.maquinas} {salon!.maquinas === 1 ? 'máquina' : 'máquinas'}
            </strong>{' '}
            del salón
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

/** El titular: lo que el casino pagó en premios, con su mes. */
function TitularPagado({ pagados }: { pagados: PremiosPagados }) {
  const { mes, anio } = nombreMes(pagados.mes);

  return (
    <>
      <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-[#8ce8f6]">
        {/* El mes sale del dato, no de un texto escrito a mano. Si el panel
            todavía no tiene el mes en curso, esto dice el que sí tiene y con
            su nombre, para que una cifra vieja no pase por la de hoy. */}
        Total de premios pagados {pagados.esMesActual ? `en ${mes}` : `en ${mes} de ${anio}`}
      </p>

      <Monto
        centavos={pagados.totalCentavos}
        tam="xl"
        className="mt-2 font-display text-dorado-3"
      />

      {/* La cuenta de premios va EN UNA LÍNEA, no en un número grande al lado.
          Se probó al lado, a 4xl: en un teléfono el "7" caía debajo del monto,
          igual de grande y en blanco, y la pantalla abría con dos números
          enormes peleándose por ser el titular. Un titular es uno. */}
      <p className="mt-3 text-sm text-[#cfe0f5] sm:text-base">
        en{' '}
        <strong className="font-display text-lg font-bold tabular text-white sm:text-xl">
          {pagados.premios}
        </strong>{' '}
        {pagados.premios === 1 ? 'premio entregado' : 'premios entregados'}
      </p>
    </>
  );
}

/** El titular de reserva, mientras no haya cifra de premios pagados. */
function TitularEnJuego({ salon }: { salon: ResumenSalon }) {
  return (
    <>
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
 *
 * LOS COLORES DE ESTA CAJA
 * ------------------------
 * Iba en `text-tinta` (#0e2645) sobre un ámbar al 10%: los colores de un aviso
 * pensado para fondo claro, que se quedaron cuando el bloque pasó a ser el
 * azul de marca. Medido sobre el fondo real daba 1.54:1 con 4.5 exigido —
 * texto azul oscuro sobre azul oscuro. Se veía en la página en vivo como una
 * mancha sin letras.
 *
 * Se le escapó al comprobador de contraste porque esta caja SOLO existe cuando
 * los montos están atrasados, y las bases de prueba siempre tenían lecturas del
 * día: la rama nunca se llegó a pintar. La otra rama —  la del punto verde —  sí
 * se midió, y esa estaba bien.
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
