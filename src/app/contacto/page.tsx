import type { Metadata } from 'next';
import { PageHero } from '@/components/site/PageHero';
import { SITE, fullAddress } from '@/lib/site';
import { HorarioTexto } from '@/components/site/HorarioTexto';

// Esta página pide el horario a la base (`HorarioTexto`), así que necesita lo
// mismo que las demás: caché de un minuto —sin esto se hornea en el build y se
// queda con el respaldo escrito a mano para siempre— y el techo de 15 s, porque
// por defecto Vercel deja llegar a 300 y ahí fue donde se colgaron las pestañas.
export const revalidate = 60;
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Contacto',
  description: `Dirección, teléfono y horario de ${SITE.name}.`,
};

export default function PaginaContacto() {
  return (
    <>
      <PageHero
        titulo="Contacto"
        descripcion="Estamos en Manatí, a la salida 48 del Expreso 22. Te esperamos."
      />

      <section className="contenedor py-10 sm:py-14">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="tarjeta relative overflow-hidden p-8">
            <div
              aria-hidden="true"
              className="patron-picas pointer-events-none absolute inset-0 opacity-[0.10]"
            />
            <h2 className="relative font-display text-2xl font-bold">Visítanos</h2>
            <div aria-hidden="true" className="cinta-ficha relative mt-3 h-[3px] w-16" />

            <dl className="relative mt-6 space-y-6">
              <Dato etiqueta="Dirección">
                <p>{fullAddress()}</p>
              </Dato>

              <Dato etiqueta="Teléfono">
                <a href={`tel:${SITE.phone}`} className="inline-flex min-h-11 items-center text-cian hover:underline">
                  {SITE.phoneDisplay}
                </a>
              </Dato>

              <Dato etiqueta="Horario">
                <HorarioTexto detallado />
              </Dato>

              <Dato etiqueta="Síguenos">
                <div className="flex gap-3">
                  <a
                    href={SITE.social.facebook}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-11 items-center rounded-xl border border-linea px-4 text-sm transition-colors hover:border-cian hover:text-cian"
                  >
                    Facebook
                  </a>
                  <a
                    href={SITE.social.instagram}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-11 items-center rounded-xl border border-linea px-4 text-sm transition-colors hover:border-cian hover:text-cian"
                  >
                    Instagram
                  </a>
                </div>
              </Dato>
            </dl>

            {/* `relative` no es adorno: la textura de arriba está posicionada
                y, por regla de pintado, un elemento posicionado se dibuja por
                ENCIMA de sus hermanos estáticos aunque vaya antes en el HTML.
                Sin esto, el patrón queda por delante de los botones. */}
            <div className="relative mt-8 flex flex-wrap gap-3">
              <a
                href={SITE.waze}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-xl bg-cian px-5 py-3 text-sm font-semibold text-white"
              >
                Abrir en Waze
              </a>
              <a
                href={SITE.maps}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-xl border border-linea px-5 py-3 text-sm font-medium transition-colors hover:border-cian hover:text-cian"
              >
                Google Maps
              </a>
            </div>
          </div>

          <div className="tarjeta overflow-hidden">
            {/* El mapa se carga en diferido: es el elemento más pesado de la
                página y casi nadie llega hasta él en celular. */}
            <iframe
              title="Mapa de Casino Atlántico Manatí"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-[26rem] w-full lg:h-full lg:min-h-[30rem]"
              src="https://www.google.com/maps?q=Casino%20Atl%C3%A1ntico%20Manat%C3%AD%2C%20Manat%C3%AD%2C%20PR&output=embed"
            />
          </div>
        </div>
      </section>
    </>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-tenue">
        {etiqueta}
      </dt>
      <dd className="mt-2 text-tinta">{children}</dd>
    </div>
  );
}
