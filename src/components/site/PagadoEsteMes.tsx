import { Monto } from './Monto';
import { nombreMesDe } from '@/lib/hora-pr';
import type { PremiosPagados } from '@/lib/queries';

/**
 * Lo que el casino lleva pagado en el mes.
 *
 * VA ARRIBA DEL TODO EN LA PORTADA, y no dentro del tablero de premios, porque
 * es la cifra que contesta la pregunta que trae a alguien a la página: ¿este
 * sitio paga?
 *
 * ES AUTOMÁTICA EN EL ÚNICO SENTIDO QUE PUEDE SERLO
 * -------------------------------------------------
 * Sale sola la ÚLTIMA entrada que hizo el administrador: `getPremiosPagados`
 * pide el mes más reciente que tenga datos, así que en cuanto se guarda una
 * cifra nueva, esta es la que se enseña. Nadie tiene que tocar la portada.
 *
 * Lo que NO se puede automatizar es de dónde sale el número: no se deduce de
 * las lecturas de las máquinas. Una caída de un progresivo puede ser un premio
 * pagado, pero también un error de tecleo corregido al día siguiente o una
 * máquina que salió del salón — y esto es una declaración pública de cuánto
 * dinero paga el casino, así que tiene que cuadrar con la caja.
 *
 * EL NOMBRE DEL MES SALE DEL DATO
 * -------------------------------
 * Si todavía no se ha escrito la cifra de este mes, se enseña el último mes que
 * la tenga CON SU NOMBRE — "Pagado en julio"— en vez de dejar que una cantidad
 * vieja pase por la de hoy. Nadie tiene que acordarse de cambiar un texto el
 * día 1.
 */
export function PagadoEsteMes({ dato }: { dato: PremiosPagados }) {
  const { mes, anio } = nombreMesDe(dato.mes);

  return (
    <section className="bloque-marca relative overflow-hidden">
      <div
        aria-hidden="true"
        className="patron-picas-oro pointer-events-none absolute inset-0 opacity-[0.14]"
      />
      <div className="contenedor relative flex flex-wrap items-end gap-x-10 gap-y-4 py-8 sm:py-10">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-[#8ce8f6]">
            {dato.esMesActual
              ? `Pagado en ${mes}, hasta hoy`
              : `Pagado en ${mes} de ${anio}`}
          </p>
          <Monto
            centavos={dato.totalCentavos}
            tam="xl"
            className="mt-2 font-display text-dorado-3"
          />
        </div>

        <p className="pb-2 text-sm text-[#cfe0f5] sm:text-base">
          en{' '}
          <strong className="font-display text-lg font-bold tabular text-white sm:text-xl">
            {dato.premios}
          </strong>{' '}
          {dato.premios === 1 ? 'premio' : 'premios'}
        </p>
      </div>
    </section>
  );
}
