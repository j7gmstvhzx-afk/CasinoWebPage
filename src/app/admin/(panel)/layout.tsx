import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SITE } from '@/lib/site';
import { esAdmin } from '@/lib/admin-auth';
import { BotonSalir } from './BotonSalir';
import { NavPanel } from './NavPanel';

export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

/**
 * Guardia del panel.
 *
 * La comprobación va en este layout y no en un middleware/proxy a propósito:
 * aquí es evidente en el árbol de archivos qué está protegido y qué no. Un
 * guardia en middleware con reglas de rutas es fácil de romper sin darse cuenta
 * al añadir una página nueva — y en este panel se canjean premios en efectivo.
 *
 * /admin/entrar queda FUERA de este grupo de rutas, así que no se protege a sí
 * misma y no hay bucle de redirección.
 */
export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  if (!(await esAdmin())) redirect('/admin/entrar');

  return (
    <div className="contenedor py-8">
      {/* Cabecera propia del panel.
          El panel ya no lleva la cabecera del sitio —el menú del visitante, el
          botón de la tragamonedas, la línea de juego responsable— porque nada
          de eso sirve para teclear los montos de las máquinas. A cambio hay que
          decir dónde está uno y dejar una puerta de vuelta al sitio. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pb-6">
        <div>
          <p className="font-display text-lg font-bold">{SITE.name}</p>
          <p className="text-sm text-tenue">Panel del personal</p>
        </div>
        <Link
          href="/"
          className="text-sm font-medium text-tenue underline-offset-4 hover:text-cian hover:underline"
        >
          Ir al sitio ↗
        </Link>
      </div>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-linea pb-5">
        <NavPanel />
        <BotonSalir />
      </div>

      {children}
    </div>
  );
}
