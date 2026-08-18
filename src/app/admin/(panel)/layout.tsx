import Link from 'next/link';
import { redirect } from 'next/navigation';
import { esAdmin } from '@/lib/admin-auth';
import { BotonSalir } from './BotonSalir';

export const dynamic = 'force-dynamic';

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

  const enlaces = [
    { href: '/admin', label: 'Resumen' },
    { href: '/admin/canjear', label: 'Canjear' },
    { href: '/admin/jackpots', label: 'Jackpots' },
    { href: '/admin/eventos', label: 'Promociones' },
    { href: '/admin/maquinas-nuevas', label: 'Máquinas nuevas' },
    { href: '/admin/menu', label: 'Menú' },
    { href: '/admin/clientes', label: 'Clientes' },
  ];

  return (
    <div className="contenedor py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-linea pb-5">
        <nav className="flex flex-wrap gap-1.5" aria-label="Panel">
          {enlaces.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-tenue transition-colors hover:bg-marca/10 hover:text-tinta"
            >
              {e.label}
            </Link>
          ))}
        </nav>
        <BotonSalir />
      </div>

      {children}
    </div>
  );
}
