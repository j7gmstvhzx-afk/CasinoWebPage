import Link from 'next/link';
import { Logo } from './Logo';
import { NAV, SITE, PROMO, fullAddress } from '@/lib/site';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-linea bg-noche/60">
      <div className="contenedor grid gap-10 py-14 md:grid-cols-3">
        <div>
          <Logo compact />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-tenue">
            {SITE.tagline}. Más de 285 máquinas, mesas de juego y el mejor
            ambiente del norte de Puerto Rico.
          </p>
        </div>

        <div>
          <h2 className="font-display text-sm font-semibold tracking-wide text-crema">
            Visítanos
          </h2>
          <address className="mt-4 space-y-2 text-sm not-italic text-tenue">
            <p>{fullAddress()}</p>
            <p>
              <a className="hover:text-cian" href={`tel:${SITE.phone}`}>
                {SITE.phoneDisplay}
              </a>
            </p>
            <p>{SITE.hours}</p>
          </address>
          <div className="mt-4 flex gap-2">
            <a
              href={SITE.waze}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-linea px-3.5 py-1.5 text-xs font-medium text-tenue transition-colors hover:border-cian hover:text-cian"
            >
              Waze
            </a>
            <a
              href={SITE.maps}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-linea px-3.5 py-1.5 text-xs font-medium text-tenue transition-colors hover:border-cian hover:text-cian"
            >
              Google Maps
            </a>
          </div>
        </div>

        <div>
          <h2 className="font-display text-sm font-semibold tracking-wide text-crema">
            Explora
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-tenue">
            {NAV.filter((n) => n.href !== '/').map((item) => (
              <li key={item.href}>
                <Link className="hover:text-cian" href={item.href}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link className="hover:text-cian" href="/terminos">
                Términos
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Juego responsable. Va en TODAS las páginas, no escondido en Términos:
          es un casino con licencia y esta línea es parte de operar en serio. */}
      <div className="border-t border-linea">
        <div className="contenedor flex flex-col gap-3 py-6 text-xs text-tenue sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE.name}. Todos los derechos reservados.
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="rounded-full border border-linea px-2 py-0.5 font-semibold">
              +{PROMO.minAge}
            </span>
            <span>Juega con responsabilidad.</span>
            <Link className="underline underline-offset-4 hover:text-cian" href="/terminos">
              Términos y condiciones
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
