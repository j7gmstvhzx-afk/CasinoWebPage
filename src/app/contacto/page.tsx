import type { Metadata } from 'next';
import { PageHero } from '@/components/site/PageHero';
import { SITE, fullAddress } from '@/lib/site';

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
          <div className="tarjeta p-8">
            <h2 className="font-display text-2xl font-bold">Visítanos</h2>

            <dl className="mt-6 space-y-6">
              <Dato etiqueta="Dirección">
                <p>{fullAddress()}</p>
              </Dato>

              <Dato etiqueta="Teléfono">
                <a href={`tel:${SITE.phone}`} className="text-cian hover:underline">
                  {SITE.phoneDisplay}
                </a>
              </Dato>

              <Dato etiqueta="Horario">
                <p>{SITE.hours}</p>
              </Dato>

              <Dato etiqueta="Síguenos">
                <div className="flex gap-3">
                  <a
                    href={SITE.social.facebook}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-xl border border-linea px-4 py-2 text-sm transition-colors hover:border-cian hover:text-cian"
                  >
                    Facebook
                  </a>
                  <a
                    href={SITE.social.instagram}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-xl border border-linea px-4 py-2 text-sm transition-colors hover:border-cian hover:text-cian"
                  >
                    Instagram
                  </a>
                </div>
              </Dato>
            </dl>

            <div className="mt-8 flex flex-wrap gap-3">
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
