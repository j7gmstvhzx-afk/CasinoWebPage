import type { Metadata } from 'next';
import { PageHero, SeccionVacia } from '@/components/site/PageHero';
import { sql } from '@/lib/db';
import { seguro } from '@/lib/queries';
import { money } from '@/lib/format';

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
          // La carta va sobre una pieza con textura, no suelta sobre el
          // blanco. Es la única página del sitio sin fotos ni tarjetas: sin un
          // soporte debajo, dos columnas de texto y precios se ven como un
          // documento pegado, no como la carta de un sitio.
          <div className="tarjeta relative overflow-hidden p-6 sm:p-9">
            <div
              aria-hidden="true"
              className="patron-picas pointer-events-none absolute inset-0 opacity-[0.05]"
            />
            <div className="relative grid gap-10 lg:grid-cols-2 lg:gap-x-14">
            {secciones.map((s) => (
              <div key={s.nombre}>
                <h2 className="font-display text-2xl font-bold text-cian">{s.nombre}</h2>
                {/* El mismo trocito del canto de la ficha que remata cada
                    encabezado de sección en la portada. */}
                <div aria-hidden="true" className="cinta-ficha mt-2.5 h-[3px] w-12" />
                <ul className="mt-5 space-y-5">
                  {s.platos.map((p) => (
                    <li key={p.id} className="border-b border-linea/60 pb-4">
                      <div className="flex items-baseline justify-between gap-4">
                        <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                        {/* text-xl no es capricho de tamaño: el dorado del
                            dinero da 3.63:1 sobre blanco. A 16px eso incumple
                            (piden 4.5:1); a 20px en negrita cuenta como texto
                            grande y el mínimo baja a 3:1. El precio se lee
                            mejor y deja de ser un fallo de accesibilidad. */}
                        <span className="shrink-0 font-display text-xl font-bold text-dorado tabular">
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
          </div>
        )}
      </section>
    </>
  );
}
