import { redirect } from 'next/navigation';
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
    <div className="contenedor py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-linea pb-5">
        <NavPanel />
        <BotonSalir />
      </div>

      {children}
    </div>
  );
}
