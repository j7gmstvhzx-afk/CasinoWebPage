import Link from 'next/link';
import { money } from '@/lib/format';
import type { PagoMensual as Fila } from '@/lib/queries';
import { nombreMesDe } from '@/lib/hora-pr';

/** "2026-08-01" -> "agosto de 2026". */
const nombreMes = (iso: string) => {
  const { mes, anio } = nombreMesDe(iso);
  return `${mes} de ${anio}`;
};

/**
 * Lo pagado en premios, mes a mes. SOLO DE LECTURA.
 *
 * AQUÍ HABÍA UN FORMULARIO, Y ERA EL FALLO
 * ----------------------------------------
 * Esta cifra —la que sale en grande en la portada y en la página de premios—
 * se tecleaba a mano aquí, en una tabla propia (`app.monthly_payouts`). Nadie
 * la tecleó nunca: en producción tenía CERO filas. Mientras tanto, en la
 * pestaña de Ganadores había tres premios de septiembre cargados con su pueblo
 * y su cantidad. Resultado: la portada anunciaba "$0.00 pagados en septiembre"
 * teniendo $9,799.56 registrados a dos pestañas de distancia.
 *
 * El fallo no era la tabla vacía, era pedir el mismo dato dos veces. Nadie
 * teclea dos veces el mismo dinero, y el que se olvida es siempre el segundo.
 * Ahora la cifra se SUMA de los ganadores registrados y este bloque solo la
 * enseña: registrar un ganador la sube, y no hay ningún otro sitio donde
 * escribirla.
 *
 * Se queda aquí, y no solo en la pestaña de Ganadores, porque ésta es la
 * pantalla donde se trabaja con el dinero de las máquinas y la pregunta
 * "¿cuánto llevamos pagado este mes?" se hace aquí.
 */
export function PremiosPagados({ historial }: { historial: Fila[] }) {
  const esteMes = historial.find((h) => h.esMesActual);

  return (
    <section className="tarjeta mt-8 p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold">Premios pagados del mes</h2>
      <p className="mt-1.5 text-sm text-tenue">
        Sale en la portada y en la página de premios, en grande. Se suma sola de
        los ganadores que registras: aquí no hay nada que teclear.
      </p>

      {esteMes ? (
        <p className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <strong className="font-display text-3xl font-bold tabular texto-dorado">
            {money(esteMes.totalCentavos)}
          </strong>
          <span className="text-sm text-tenue">
            en {esteMes.premios} {esteMes.premios === 1 ? 'premio' : 'premios'} de{' '}
            <span className="capitalize">{nombreMes(esteMes.mes)}</span>
          </span>
        </p>
      ) : (
        <p className="mt-5 flex items-start gap-2.5 rounded-2xl border border-dorado/40 bg-dorado/10 px-4 py-3 text-sm text-tinta">
          <span aria-hidden="true">📅</span>
          <span>
            Este mes todavía no tiene ningún premio registrado, así que la
            portada dice <strong>$0.00</strong>. En cuanto registres el primero,
            la cifra aparece sola.
          </span>
        </p>
      )}

      <p className="mt-4 text-sm">
        <Link href="/admin/ganadores" className="font-medium text-cian underline-offset-2 hover:underline">
          Registrar un ganador →
        </Link>
      </p>

      {historial.length > 0 && (
        <div className="mt-6 border-t border-linea pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tenue">
            Mes a mes
          </p>
          <ul className="mt-3 grid gap-2">
            {historial.map((h) => (
              <li
                key={h.mes}
                className="hueco flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm"
              >
                <span className="font-medium capitalize">{nombreMes(h.mes)}</span>
                <span className="tabular">
                  <strong className="font-semibold texto-dorado">{money(h.totalCentavos)}</strong>
                  <span className="text-tenue">
                    {' '}en {h.premios} {h.premios === 1 ? 'premio' : 'premios'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
