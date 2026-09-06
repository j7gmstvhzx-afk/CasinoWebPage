import type { Metadata } from 'next';
import { PageHero, SeccionVacia } from '@/components/site/PageHero';
import { getGanadores, paraLaPagina, type Ganador } from '@/lib/queries';
import { Monto } from '@/components/site/Monto';
import { moneyShort, longDate } from '@/lib/format';
import { hoyEnPR } from '@/lib/hora-pr';
import { porSemanas, type Semana } from '@/lib/semanas';

// NO SON 60 EN TODAS, Y ESO ES EL ARREGLO, NO UN DESCUIDO.
//
// Con las ocho páginas públicas a 60 s pasaba esto: el despliegue las hornea a
// todas en el mismo segundo, así que TODAS caducan en el mismo segundo. Y como
// Next precarga cada pestaña del menú que esté a la vista —y están las nueve—,
// el primer visitante que llega después de que caduquen dispara OCHO
// regeneraciones a la vez, cada una en su propia función y cada una abriendo su
// propio manojo de conexiones contra un pooler que solo tiene 15.
//
// Se vio en los registros de producción del 4 de septiembre a la 01:13:25: once
// peticiones en el mismo segundo, seis de ellas regenerando, y /jackpots
// cayéndose con "la consulta pasó de 6000 ms" mientras el diagnóstico decía
// "último acierto hace 5996 ms" — o sea, saturación, no conexión muerta.
//
// Separándolas, en cualquier instante hay como mucho una o dos por rehacer. El
// visitante no nota la diferencia entre 60 y 116 segundos de frescura; sí nota
// una página que no carga.
export const revalidate = 92;
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
  // SESENTA Y NO VEINTICUATRO.
  //
  // Con el muro repartido por semanas, el límite deja de ser "cuántas tarjetas
  // caben" y pasa a ser "hasta dónde llega el historial". Con veinticuatro, la
  // semana más antigua salía cortada por la mitad sin decirlo: el desplegable
  // prometía una semana entera y enseñaba los tres premios que cupieron.
  const r = await paraLaPagina(() => getGanadores(60), 'el muro de ganadores', [] as Ganador[]);
  const ganadores = r.datos;

  // El día en Puerto Rico, calculado en el servidor y pasado hacia abajo: si el
  // navegador mirara su propio reloj, en la medianoche del domingo el título de
  // la primera semana cambiaría solo y React tiraría la página abajo.
  const semanas = porSemanas(ganadores, (g) => g.ganoEn, hoyEnPR());

  return (
    <>
      <PageHero
        titulo="Ganadores"
        descripcion="Lo que se ha pagado, y de qué pueblo era quien se lo llevó."
      />

      <section className="contenedor py-10 sm:py-14">
        {!r.ok ? (
          /* No es que no haya nada: es que no se pudo leer. Solo pasa en un
             build que no alcanzó la base; en cuanto alguien visite la página
             se rehace sola con el contenido de verdad. */
          <SeccionVacia mensaje="Estamos actualizando esta página. Vuelve en un momento." />
        ) : ganadores.length === 0 ? (
          <SeccionVacia mensaje="Pronto verás aquí los últimos premios pagados del salón." />
        ) : (
          <div className="space-y-3">
            {semanas.map((s, i) => (
              /* LA PRIMERA SEMANA ABIERTA, LAS DEMÁS CERRADAS.
                 Quien entra quiere ver lo último; el resto es historial y se
                 abre si le interesa. Abrirlas todas sería la lista de siempre
                 con cabeceras en medio. */
              <SemanaDesplegable key={s.lunes} semana={s} abierta={i === 0} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/**
 * Una semana, plegable.
 *
 * SE USA `<details>` DEL NAVEGADOR, NO UN COMPONENTE CON ESTADO.
 *
 * Es la etiqueta que existe justo para esto, y trae de fábrica lo que si no
 * habría que escribir a mano y mantener: abre y cierra con el teclado, se
 * anuncia sola al lector de pantalla como "contraído/expandido", y el buscador
 * de la página (Ctrl+F) encuentra lo de dentro aunque esté cerrado.
 *
 * Y sobre todo: FUNCIONA SIN JAVASCRIPT. Esta página se sirve de caché y el
 * visitante puede tocar el desplegable antes de que el navegador termine de
 * cargar los guiones. Con un `useState` habría un momento en que pulsar no hace
 * nada; con `<details>`, no.
 *
 * El resumen dice cuántos premios y cuánto suman, que es lo que hace que valga
 * la pena abrirlo. Una fila que solo dijera "Del 17 al 23 de agosto" no da
 * ninguna razón para tocarla.
 */
function SemanaDesplegable({ semana, abierta }: { semana: Semana<Ganador>; abierta: boolean }) {
  const total = semana.items.reduce((n, g) => n + g.montoCentavos, 0);
  const n = semana.items.length;

  return (
    <details open={abierta} className="group tarjeta overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-5 transition-colors hover:bg-superficie [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="shrink-0 text-tenue transition-transform duration-200 group-open:rotate-90"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-semibold">{semana.titulo}</span>
          <span className="mt-0.5 block text-sm text-tenue">
            {n === 1 ? '1 premio' : `${n} premios`} · {moneyShort(total)}
          </span>
        </span>
      </summary>

      <div className="border-t border-linea p-5">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {semana.items.map((g) => (
            <Tarjeta key={g.id} g={g} />
          ))}
        </ul>
      </div>
    </details>
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
