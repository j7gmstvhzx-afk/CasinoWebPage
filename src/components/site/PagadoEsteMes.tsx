import { Monto } from './Monto';
import { money } from '@/lib/format';
import { nombreMesDe } from '@/lib/hora-pr';
import type { PremiosPagados } from '@/lib/queries';

/**
 * Lo que el casino lleva pagado en el mes.
 *
 * VA ARRIBA DEL TODO EN LA PORTADA, y no dentro del tablero de premios, porque
 * es la cifra que contesta la pregunta que trae a alguien a la página: ¿este
 * sitio paga?
 *
 * SIEMPRE ES EL MES EN CURSO, Y SIEMPRE SE PINTA
 * ----------------------------------------------
 * Aunque la cifra sea cero. La versión anterior enseñaba el último mes que
 * tuviera datos y se escondía entera si no había ninguno; las dos cosas se
 * cambiaron por lo mismo: el letrero dice "en el mes hasta hoy", así que tiene
 * que hablar de ESTE mes, y un hueco no le dice a nadie —tampoco al dueño, que
 * es quien puede arreglarlo— que lo que falta es teclear una cantidad.
 *
 * EL CERO SE REDACTA
 * ------------------
 * "en 0 premios" se lee como una avería. "Todavía no hay premios registrados
 * en septiembre" se lee como lo que es: el mes acaba de empezar. Y si el mes
 * pasado sí tiene cifra, se enseña debajo, para que el cero no quede solo
 * pareciendo que aquí no se paga nunca.
 */
export function PagadoEsteMes({ dato }: { dato: PremiosPagados }) {
  const { mes } = nombreMesDe(dato.mes);
  const sinCifra = dato.premios === 0 && dato.totalCentavos === 0;

  return (
    <section className="bloque-marca relative overflow-hidden">
      <div
        aria-hidden="true"
        className="patron-picas-oro pointer-events-none absolute inset-0 opacity-[0.14]"
      />
      <div className="contenedor relative flex flex-wrap items-end gap-x-10 gap-y-4 py-8 sm:py-10">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-[#8ce8f6]">
            Total de premios pagados en {mes}, hasta hoy
          </p>
          <Monto
            centavos={dato.totalCentavos}
            tam="xl"
            className="mt-2 font-display text-dorado-3"
          />
        </div>

        {sinCifra ? (
          <p className="pb-2 text-sm text-[#cfe0f5] sm:text-base">
            Todavía no hay premios registrados este mes.
            {dato.anterior && (
              <>
                {' '}
                <span className="whitespace-nowrap">
                  En {nombreMesDe(dato.anterior.mes).mes} se pagaron{' '}
                  <strong className="font-semibold text-dorado-3">
                    {money(dato.anterior.totalCentavos)}
                  </strong>
                  .
                </span>
              </>
            )}
          </p>
        ) : (
          <p className="pb-2 text-sm text-[#cfe0f5] sm:text-base">
            en{' '}
            <strong className="font-display text-lg font-bold tabular text-white sm:text-xl">
              {dato.premios}
            </strong>{' '}
            {dato.premios === 1 ? 'premio' : 'premios'}
          </p>
        )}
      </div>
    </section>
  );
}
