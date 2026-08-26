import Link from 'next/link';
import { Logo } from './Logo';
import { NAV, SITE, PROMO, fullAddress } from '@/lib/site';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-linea bg-superficie">
      <div className="contenedor grid gap-10 py-14 md:grid-cols-3">
        <div>
          <Logo compact />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-tenue">
            {SITE.tagline}. Más de 285 máquinas, mesas de juego y el mejor
            ambiente del norte de Puerto Rico.
          </p>
        </div>

        <div>
          <h2 className="font-display text-sm font-semibold tracking-wide text-tinta">
            Visítanos
          </h2>
          <address className="mt-4 space-y-2 text-sm not-italic text-tenue">
            <p>{fullAddress()}</p>
            <p>
              <a className="inline-block py-1 hover:text-cian" href={`tel:${SITE.phone}`}>
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
          <h2 className="font-display text-sm font-semibold tracking-wide text-tinta">
            Explora
          </h2>
          {/* `inline-block py-1.5` para que la zona tocable llegue a 24px de
              alto. El texto de 14px deja enlaces de 17px, por debajo del mínimo
              que piden las guías de accesibilidad, y en un pie con dos columnas
              de enlaces pegados eso son toques fallidos en celular. El tamaño
              del texto no cambia; solo crece el área que responde. */}
          <ul className="mt-4 grid grid-cols-2 gap-x-4 text-sm text-tenue">
            {NAV.filter((n) => n.href !== '/').map((item) => (
              <li key={item.href}>
                <Link className="inline-block py-1.5 hover:text-cian" href={item.href}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link className="inline-block py-1.5 hover:text-cian" href="/terminos">
                Términos
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Juego responsable. Va en TODAS las páginas, no escondido en Términos:
          es un casino con licencia y esta línea es parte de operar en serio. */}
      <div className="border-t border-linea">
        {/* pb-28 en celular: el botón flotante "GANA $25" es `fixed` abajo a la
            derecha y se comía un 31% del enlace "Administración" en TODAS las
            páginas. Reservando ese alto al final del documento, la última fila
            del pie sube por encima del botón y vuelve a ser tocable entera. */}
        <div className="contenedor flex flex-col gap-3 py-6 pb-28 text-xs text-tenue sm:flex-row sm:items-center sm:justify-between sm:pb-6">
          <p>
            © {new Date().getFullYear()} {SITE.name}. Todos los derechos reservados.
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="rounded-full border border-linea px-2 py-0.5 font-semibold">
              +{PROMO.minAge}
            </span>
            <span>Juega con responsabilidad.</span>
            {/* `inline-block py-1.5` sube estos enlaces de 16px de alto a 28.
                No son enlaces sueltos dentro de una frase —esos están exentos—
                sino ítems de una fila; el mínimo tocable son 24px. */}
            <Link
              className="inline-block py-1.5 underline underline-offset-4 hover:text-cian"
              href="/terminos"
            >
              Términos y condiciones
            </Link>
            {/* Entrada al panel del casino. Va aquí abajo, discreta: el cliente
                no tiene por qué verla en el menú principal, pero el dueño y los
                empleados necesitan poder llegar sin escribir la dirección de
                memoria. La contraseña la sigue pidiendo /admin/entrar. */}
            {/* Sin el `/70`. Rebajar el token al 70% dejaba #8a99ab sobre el
                gris del pie: 2,69:1, muy por debajo del 4,5:1 que pide un texto
                de 12px. El token a pleno da 4,71:1 — está calibrado justo para
                este fondo. Discreto no puede significar ilegible, y menos en el
                enlace por el que entra el personal. */}
            <Link
              className="inline-block py-1.5 text-tenue underline underline-offset-4 hover:text-cian"
              href="/admin"
            >
              Administración
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
