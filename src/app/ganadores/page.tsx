import type { Metadata } from 'next';
import { PageHero, SeccionVacia } from '@/components/site/PageHero';
import { getGanadores, seguro, type Ganador } from '@/lib/queries';
import { Monto } from '@/components/site/Monto';
import { longDate } from '@/lib/format';

export const revalidate = 60;
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Ganadores',
  description:
    'Lo que se ha pagado en Casino Atlántico Manatí y de qué pueblo era quien ' +
    'se lo llevó.',
};

/**
 * El muro de ganadores.
 *
 * DOS DATOS: PUEBLO Y CANTIDAD
 * ----------------------------
 * No hay nombre, ni foto, ni máquina. La versión anterior los tenía y por eso
 * arrastraba tres capas de consentimiento; con solo un pueblo y una cifra no se
 * publica ningún dato personal, así que no hay permiso que pedir ni que guardar.
 *
 * Y sigue funcionando como prueba social, que era el punto: "Vega Baja —
 * $2,400" dice que aquí se paga y que le tocó a alguien de al lado. Un nombre
 * añadía poco a eso y costaba mucho.
 *
 * Sin foto, la tarjeta es la cifra: el monto en grande sobre el azul de la
 * marca, con el pueblo debajo. Es la misma jerarquía del tablero de premios.
 */
export default async function PaginaGanadores() {
  const ganadores = await seguro(() => getGanadores(24), []);

  return (
    <>
      <PageHero
        titulo="Ganadores"
        descripcion="Lo que se ha pagado, y de qué pueblo era quien se lo llevó."
      />

      <section className="contenedor py-10 sm:py-14">
        {ganadores.length === 0 ? (
          <SeccionVacia mensaje="Pronto verás aquí los últimos premios pagados del salón." />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ganadores.map((g) => (
              <Tarjeta key={g.id} g={g} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Tarjeta({ g }: { g: Ganador }) {
  return (
    <li className="bloque-marca relative overflow-hidden rounded-3xl">
      <div
        aria-hidden="true"
        className="patron-picas-oro pointer-events-none absolute inset-0 opacity-[0.14]"
      />
      <div className="relative p-6">
        <Monto centavos={g.montoCentavos} tam="lg" className="font-display text-dorado-3" />
        <p className="mt-3 font-display text-xl font-bold text-white">{g.pueblo}</p>
        <p className="mt-0.5 text-sm text-[#cfe0f5]">{longDate(g.ganoEn)}</p>
      </div>
    </li>
  );
}
