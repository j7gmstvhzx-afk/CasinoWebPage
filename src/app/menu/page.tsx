import type { Metadata } from 'next';
import { PageHero, SeccionVacia } from '@/components/site/PageHero';
import { sql } from '@/lib/db';
import { seguro } from '@/lib/queries';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Menú',
  description: 'Nuestra cocina en Casino Atlántico Manatí.',
};

type Plato = {
  section_id: number;
  section: string;
  id: string;
  name: string;
  description: string | null;
  price_cents: number | null;
};

async function getMenu(): Promise<Plato[]> {
  return sql<Plato[]>`
    select s.id as section_id, s.name as section,
           i.id, i.name, i.description, i.price_cents
      from app.menu_items i
      join app.menu_sections s on s.id = i.section_id
     where i.available
     order by s.sort_order, i.sort_order, i.name
  `;
}

export default async function PaginaMenu() {
  const platos = await seguro(getMenu, []);

  // Se agrupa en el servidor: la consulta ya viene ordenada, así que basta con
  // recorrerla una vez.
  const secciones = platos.reduce<{ nombre: string; platos: Plato[] }[]>((acc, p) => {
    const ultima = acc[acc.length - 1];
    if (ultima && ultima.nombre === p.section) ultima.platos.push(p);
    else acc.push({ nombre: p.section, platos: [p] });
    return acc;
  }, []);

  return (
    <>
      <PageHero
        titulo="Menú"
        descripcion="Buena comida para acompañar tu suerte. Pregunta por los especiales del día."
      />

      <section className="contenedor py-10 sm:py-14">
        {secciones.length === 0 ? (
          <SeccionVacia mensaje="Estamos actualizando el menú. Pregunta en el restaurante por nuestra oferta de hoy." />
        ) : (
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-x-14">
            {secciones.map((s) => (
              <div key={s.nombre}>
                <h2 className="font-display text-2xl font-bold text-cian">{s.nombre}</h2>
                <ul className="mt-5 space-y-5">
                  {s.platos.map((p) => (
                    <li key={p.id} className="border-b border-linea/60 pb-4">
                      <div className="flex items-baseline justify-between gap-4">
                        <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                        <span className="shrink-0 font-display font-bold text-dorado tabular">
                          {p.price_cents === null ? 'Precio del día' : money(p.price_cents)}
                        </span>
                      </div>
                      {p.description && (
                        <p className="mt-1.5 text-sm leading-relaxed text-tenue">
                          {p.description}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
