import type { Metadata } from 'next';
import { PageHero, SeccionVacia } from '@/components/site/PageHero';
import { sql } from '@/lib/db';
import { seguro } from '@/lib/queries';
import { money } from '@/lib/format';
import { urlPublica } from '@/lib/storage';

export const revalidate = 60;
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Comida y bebida',
  description:
    'Café, desayuno y barra por cuenta de la casa mientras juegas, y el menú ' +
    'especial del fin de semana en Casino Atlántico Manatí.',
};

type Plato = {
  section_id: number;
  section: string;
  cortesia: boolean;
  nota: string | null;
  id: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  image_path: string | null;
};

async function getMenu(): Promise<Plato[]> {
  return sql<Plato[]>`
    select s.id as section_id, s.name as section, s.cortesia, s.nota,
           i.id, i.name, i.description, i.price_cents, i.image_path
      from app.menu_items i
      join app.menu_sections s on s.id = i.section_id
     where i.available
     order by s.sort_order, i.sort_order, i.name
  `;
}

type Seccion = { nombre: string; cortesia: boolean; nota: string | null; platos: Plato[] };

/**
 * Comida y bebida.
 *
 * LO QUE ESTA PÁGINA DECÍA ANTES Y POR QUÉ ESTABA MAL
 * ---------------------------------------------------
 * Era la carta de un restaurante —"Entradas", "Platos principales", con sus
 * precios— y en producción no tiene ni un plato cargado, así que lo único que
 * se veía era "Estamos actualizando el menú".
 *
 * Pero este casino sí da de comer: el café, el desayuno, las cervezas y los
 * tragos son DE CORTESÍA mientras juegas, y los fines de semana hay un menú
 * especial. Un casino que regala el desayuno estaba diciéndole a la gente que
 * no tenía cocina.
 *
 * Así que la página se organiza alrededor de eso: primero lo que va por cuenta
 * de la casa, en grande y sin precios, y después lo que se paga. Es el gancho
 * más barato que tiene el salón —los casinos pequeños de EEUU anuncian tragos
 * a $5 para llenar entre semana; aquí son gratis— y no salía en ninguna parte.
 */
export default async function PaginaMenu() {
  const platos = await seguro(getMenu, []);

  const secciones = platos.reduce<Seccion[]>((acc, p) => {
    const ultima = acc[acc.length - 1];
    if (ultima && ultima.nombre === p.section) ultima.platos.push(p);
    else acc.push({ nombre: p.section, cortesia: p.cortesia, nota: p.nota, platos: [p] });
    return acc;
  }, []);

  const cortesia = secciones.filter((s) => s.cortesia);
  const dePago = secciones.filter((s) => !s.cortesia);

  return (
    <>
      <PageHero
        titulo="Comida y bebida"
        descripcion="Mientras juegas, la casa invita. Café, desayuno y barra sin costo, y los fines de semana un menú especial."
      />

      <section className="contenedor py-10 sm:py-14">
        {secciones.length === 0 ? (
          <SeccionVacia mensaje="Estamos preparando esta página. Pregunta en el salón por la comida y la bebida de hoy." />
        ) : (
          <div className="grid gap-10">
            {cortesia.length > 0 && <PorCuentaDeLaCasa secciones={cortesia} />}
            {dePago.map((s) => (
              <SeccionDePago key={s.nombre} seccion={s} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/**
 * Lo que va por cuenta de la casa.
 *
 * En bloque azul de marca y no en una tarjeta clara como el resto: es lo que
 * distingue a este salón y tiene que pesar lo mismo que el tablero de premios.
 * Sin precios, porque no los tiene — poner "$0.00" convertiría un regalo en una
 * transacción.
 */
function PorCuentaDeLaCasa({ secciones }: { secciones: Seccion[] }) {
  return (
    <section className="bloque-marca relative overflow-hidden rounded-3xl">
      <div
        aria-hidden="true"
        className="patron-picas-oro pointer-events-none absolute inset-0 opacity-[0.14]"
      />
      <div className="relative p-6 sm:p-10">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-[#8ce8f6]">
          Por cuenta de la casa
        </p>
        <h2 className="mt-2 font-display text-3xl font-bold text-dorado-3 sm:text-4xl">
          Mientras juegas, no pagas
        </h2>

        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          {secciones.map((s) => (
            <div key={s.nombre}>
              <h3 className="font-display text-xl font-bold text-white">{s.nombre}</h3>
              {s.nota && <p className="mt-1 text-sm text-[#cfe0f5]">{s.nota}</p>}

              <ul className="mt-4 grid gap-2.5">
                {s.platos.map((p) => (
                  <li key={p.id} className="flex items-start gap-2.5 text-[#eaf2fb]">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-dorado-2" />
                    <span>
                      <strong className="font-semibold text-white">{p.name}</strong>
                      {p.description && (
                        <span className="block text-sm text-[#cfe0f5]">{p.description}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Lo que sí se paga: el menú del fin de semana y lo demás. */
function SeccionDePago({ seccion }: { seccion: Seccion }) {
  // Con fotos se pinta en tarjetas; sin fotos, como una carta. Un menú del fin
  // de semana con foto vende, pero una rejilla de recuadros grises vacíos vende
  // menos que una lista limpia.
  const hayFotos = seccion.platos.some((p) => p.image_path);

  return (
    <section className="tarjeta relative overflow-hidden p-6 sm:p-9">
      <div
        aria-hidden="true"
        className="patron-picas pointer-events-none absolute inset-0 opacity-[0.10]"
      />
      <div className="relative">
        <h2 className="font-display text-2xl font-bold text-cian">{seccion.nombre}</h2>
        <div aria-hidden="true" className="cinta-ficha mt-2.5 h-[3px] w-12" />
        {seccion.nota && <p className="mt-2 text-sm text-tenue">{seccion.nota}</p>}

        {hayFotos ? (
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {seccion.platos.map((p) => (
              <li key={p.id} className="hueco overflow-hidden">
                {p.image_path && (
                  <div className="aspect-[4/3] bg-superficie-2">
                    {/* <img> y no next/image, igual que en Marco.tsx y en el
                        resto del sitio: las fotos vienen de Supabase Storage y
                        next/image EXIGE declarar el dominio en
                        `images.remotePatterns`. No está declarado, así que en
                        cuanto un plato de pago tuviera foto esta página
                        reventaba entera con "hostname is not configured" — y
                        `seguro()` no cubre el pintado, solo la consulta.
                        Cuando se fije el dominio definitivo se migra y se gana
                        el redimensionado automático. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={urlPublica(p.image_path)}
                      alt={p.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                    <Precio centavos={p.price_cents} />
                  </div>
                  {p.description && (
                    <p className="mt-1.5 text-sm leading-relaxed text-tenue">{p.description}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-6 grid gap-5 lg:grid-cols-2 lg:gap-x-14">
            {seccion.platos.map((p) => (
              <li key={p.id} className="border-b border-linea/60 pb-4">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                  <Precio centavos={p.price_cents} />
                </div>
                {p.description && (
                  <p className="mt-1.5 text-sm leading-relaxed text-tenue">{p.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * `text-xl` no es capricho de tamaño: el dorado del dinero da 3.63:1 sobre
 * blanco. A 16px eso incumple (piden 4.5:1); a 20px en negrita cuenta como
 * texto grande y el mínimo baja a 3:1.
 */
function Precio({ centavos }: { centavos: number | null }) {
  return (
    <span className="shrink-0 font-display text-xl font-bold tabular text-dorado">
      {centavos === null ? 'Precio del día' : money(centavos)}
    </span>
  );
}
