import type { Metadata } from 'next';
import Image from 'next/image';
import { PageHero, SeccionVacia } from '@/components/site/PageHero';
import { getGanadores, seguro, type Ganador } from '@/lib/queries';
import { Monto } from '@/components/site/Monto';
import { longDate } from '@/lib/format';
import { urlPublica } from '@/lib/storage';

export const revalidate = 60;
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Ganadores',
  description:
    'Vecinos de Manatí y de todo el norte que se llevaron un premio en Casino ' +
    'Atlántico. Con su nombre, su pueblo y la máquina.',
};

/**
 * El muro de ganadores.
 *
 * De todo lo que hacen los casinos pequeños de Estados Unidos, esto es lo
 * segundo más universal después del calendario de promociones —lo tienen Big M,
 * Two Kings, Prairie Knights, Red Wind, Valley View— y es la pieza de contenido
 * más barata que existe: una foto y un pie.
 *
 * También es la más convincente para un casino de pueblo. La prueba de que aquí
 * se paga no la da una cifra en un tablero: la da un vecino con un cheque en la
 * mano y el nombre de su pueblo debajo.
 *
 * Toda fila que llega aquí tiene consentimiento por escrito: la columna es
 * `not null` en la base de datos, así que una foto sin permiso NO SE PUEDE
 * GUARDAR. Eso no depende de que nadie se acuerde.
 */
export default async function PaginaGanadores() {
  const ganadores = await seguro(() => getGanadores(24), []);

  return (
    <>
      <PageHero
        titulo="Ganadores"
        descripcion="Gente del norte que se fue con un premio. Con su permiso, y con su nombre."
      />

      <section className="contenedor py-10 sm:py-14">
        {ganadores.length === 0 ? (
          <SeccionVacia mensaje="Pronto verás aquí a los últimos ganadores del salón. ¿Ganaste? Pregunta en el mostrador si quieres salir." />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ganadores.map((g) => (
              <Tarjeta key={g.id} g={g} />
            ))}
          </ul>
        )}

        <p className="mt-10 text-center text-sm text-tenue">
          Solo publicamos a quien nos da permiso por escrito. Si ganaste y
          quieres salir —o quieres que te quitemos— dilo en el mostrador.
        </p>
      </section>
    </>
  );
}

function Tarjeta({ g }: { g: Ganador }) {
  return (
    <li className="tarjeta overflow-hidden">
      {/* La foto es opcional: un ganador sin foto sigue siendo prueba social, y
          esperar a tener foto de todos es como no tener la página. Sin ella se
          pinta el bloque azul con el monto, que ya es una tarjeta digna. */}
      {g.imagen ? (
        <div className="relative aspect-[4/3] bg-superficie-2">
          <Image
            src={urlPublica(g.imagen)}
            alt={`${g.nombre}, ganador en Casino Atlántico Manatí`}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover"
          />
        </div>
      ) : (
        <div className="bloque-marca relative flex aspect-[4/3] items-center justify-center overflow-hidden">
          <div
            aria-hidden="true"
            className="patron-picas-oro pointer-events-none absolute inset-0 opacity-[0.14]"
          />
          {g.montoCentavos !== null ? (
            <Monto centavos={g.montoCentavos} tam="lg" className="relative font-display text-dorado-3" />
          ) : (
            <span className="relative font-display text-2xl font-bold text-dorado-3">¡Ganó!</span>
          )}
        </div>
      )}

      <div className="p-5">
        <h2 className="font-display text-lg font-bold">{g.nombre}</h2>
        {g.pueblo && <p className="text-sm text-tenue">{g.pueblo}</p>}

        {/* Si la foto ya enseñó el monto, aquí no se repite. */}
        {g.imagen && g.montoCentavos !== null && (
          <Monto centavos={g.montoCentavos} tam="md" className="mt-2.5 font-display texto-dorado" />
        )}

        <p className="mt-2.5 text-sm text-tenue">
          {g.maquina && <span className="font-medium text-tinta">{g.maquina}</span>}
          {g.maquina && ' · '}
          {longDate(g.ganoEn)}
        </p>
      </div>
    </li>
  );
}
