import Link from 'next/link';
import { PromoExperience } from '@/components/slot/PromoExperience';
import { Marco } from '@/components/site/Marco';
import {
  getJackpots,
  getMaquinasNuevas,
  getEventos,
  getUltimaActualizacion,
  seguro,
} from '@/lib/queries';
import { money, relativeUpdate, longDate } from '@/lib/format';
import { SITE, PROMO, fullAddress } from '@/lib/site';

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

export default async function Inicio() {
  const [jackpots, maquinas, eventos, ultima] = await Promise.all([
    seguro(getJackpots, []),
    seguro(() => getMaquinasNuevas(6), []),
    seguro(() => getEventos(3), []),
    seguro(getUltimaActualizacion, null),
  ]);

  const destacados = jackpots.slice(0, 4);

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Portada: el premio y la máquina, arriba del todo.                  */}
      {/* La foto de la fachada pasa a un segundo plano a propósito — es      */}
      {/* bonita, pero no es lo que hace que alguien deje su celular.        */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              // Muy tenues: sobre blanco, lo que en el tema oscuro era un halo
              // sutil se convierte en dos manchas de color.
              'radial-gradient(48rem 30rem at 18% -10%, rgb(43 169 224 / .10), transparent 60%),' +
              'radial-gradient(40rem 26rem at 90% 0%, rgb(242 179 61 / .09), transparent 58%)',
          }}
        />

        <div className="contenedor relative grid items-center gap-12 py-14 lg:grid-cols-[1.05fr_auto] lg:gap-16 lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-dorado/40 bg-dorado/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-dorado">
              Promoción del día
            </p>

            <h1 className="mt-5 font-display text-5xl font-bold leading-[1.05] sm:text-7xl">
              Gira y gana{' '}
              <span className="texto-dorado">{PROMO.prizeLabel}</span> en
              efectivo
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-relaxed text-tenue">
              Una tirada gratis cada día. Si te salen tres símbolos iguales,
              recibes un cupón digital que canjeas en Servicio al Cliente.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/jackpots"
                className="rounded-2xl border border-linea bg-superficie px-6 py-3.5 font-medium transition-colors hover:border-cian hover:text-cian"
              >
                Ver jackpots de hoy
              </Link>
              <a
                href={SITE.waze}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-2xl border border-linea px-6 py-3.5 font-medium text-tenue transition-colors hover:border-cian hover:text-cian"
              >
                Cómo llegar
              </a>
            </div>

            <p className="mt-6 text-sm text-tenue">
              {SITE.hours} · {SITE.address.city}, Puerto Rico
            </p>
          </div>

          {/* La máquina va embebida en la portada, no solo en el modal: quien
              cerró el modal tiene que seguir topándose con ella. */}
          <div className="w-full rounded-3xl border border-linea bg-fondo p-6 shadow-alza sm:p-8 lg:w-[27rem]">
            <PromoExperience />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Jackpots calientes                                                */}
      {/* ---------------------------------------------------------------- */}
      {destacados.length > 0 && (
        <section className="contenedor py-14">
          <EncabezadoSeccion
            titulo="Premios más altos ahora"
            enlace={{ href: '/jackpots', texto: 'Ver todos' }}
            nota={ultima ? `Actualizado ${relativeUpdate(ultima)}` : undefined}
          />

          <ul className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {destacados.map((j) => (
              <li key={j.id} className="tarjeta p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-base font-semibold leading-tight">
                    {j.nombre}
                  </p>
                  {j.caliente && (
                    <span className="anim-brillo shrink-0 text-sm" title="Premio caliente">
                      🔥
                    </span>
                  )}
                </div>
                <p className="mt-3 font-display text-2xl font-bold text-dorado tabular">
                  {money(j.centavos)}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-tenue">
                  Banco {j.banco}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Máquinas nuevas                                                   */}
      {/* ---------------------------------------------------------------- */}
      {maquinas.length > 0 && (
        <section className="contenedor py-14">
          <EncabezadoSeccion
            titulo="Máquinas recién llegadas"
            enlace={{ href: '/maquinas-nuevas', texto: 'Ver todas' }}
          />

          <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {maquinas.slice(0, 3).map((m) => (
              <li key={m.id} className="tarjeta overflow-hidden">
                <Marco imagen={m.image_path} alt={m.name} />
                <div className="p-5">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-cian/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cian">
                      Nueva
                    </span>
                    {m.bank_number !== null && (
                      <span className="text-xs text-tenue">Banco {m.bank_number}</span>
                    )}
                  </div>
                  <p className="mt-2.5 font-display text-lg font-semibold">{m.name}</p>
                  {m.description && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-tenue">{m.description}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Eventos                                                           */}
      {/* ---------------------------------------------------------------- */}
      {eventos.length > 0 && (
        <section className="contenedor py-14">
          <EncabezadoSeccion
            titulo="Eventos y promociones"
            enlace={{ href: '/eventos', texto: 'Ver todos' }}
          />

          <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {eventos.map((e) => (
              <li key={e.id} className="tarjeta overflow-hidden">
                <Marco imagen={e.image_path} alt={e.title} />
                <div className="p-5">
                  <p className="font-display text-lg font-semibold">{e.title}</p>
                  {e.starts_on && (
                    <p className="mt-1 text-sm text-cian">{longDate(e.starts_on)}</p>
                  )}
                  {e.body && (
                    <p className="mt-2 line-clamp-3 text-sm text-tenue">{e.body}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Visítanos                                                         */}
      {/* ---------------------------------------------------------------- */}
      <section className="contenedor py-14">
        <div className="tarjeta grid gap-8 p-8 sm:p-10 md:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-bold">Visítanos</h2>
            <address className="mt-5 space-y-3 not-italic text-tenue">
              <p className="text-tinta">{fullAddress()}</p>
              <p>
                <a className="hover:text-cian" href={`tel:${SITE.phone}`}>
                  {SITE.phoneDisplay}
                </a>
              </p>
              <p>{SITE.hours}</p>
            </address>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={SITE.waze}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-xl bg-cian px-5 py-2.5 text-sm font-semibold text-white"
              >
                Abrir en Waze
              </a>
              <a
                href={SITE.maps}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-xl border border-linea px-5 py-2.5 text-sm font-medium transition-colors hover:border-cian hover:text-cian"
              >
                Google Maps
              </a>
            </div>
          </div>

          <ul className="grid grid-cols-2 gap-4 self-center">
            {[
              { n: '285+', t: 'Máquinas' },
              { n: '6', t: 'Mesas de juego' },
              { n: '16 h', t: 'Abierto al día' },
              { n: PROMO.prizeLabel, t: 'Premio diario' },
            ].map((s) => (
              <li key={s.t} className="rounded-2xl border border-linea bg-superficie p-5 text-center">
                <p className="font-display text-3xl font-bold text-cian tabular">{s.n}</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-tenue">{s.t}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function EncabezadoSeccion({
  titulo,
  enlace,
  nota,
}: {
  titulo: string;
  enlace?: { href: string; texto: string };
  nota?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-3xl font-bold sm:text-4xl">{titulo}</h2>
        {nota && <p className="mt-1.5 text-sm text-tenue">{nota}</p>}
      </div>
      {enlace && (
        <Link
          href={enlace.href}
          className="text-sm font-medium text-cian underline-offset-4 hover:underline"
        >
          {enlace.texto} →
        </Link>
      )}
    </div>
  );
}
