import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { esAdmin } from '@/lib/admin-auth';
import { FormularioEntrar } from './FormularioEntrar';

export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Entrar al panel',
  robots: { index: false, follow: false },
};

export default async function PaginaEntrar() {
  if (await esAdmin()) redirect('/admin');

  return (
    <div className="contenedor flex min-h-[70vh] items-center justify-center py-14">
      <div className="w-full max-w-sm">
        <h1 className="text-center font-display text-3xl font-bold">Panel de empleados</h1>
        <p className="mt-2 text-center text-sm text-tenue">
          Acceso solo para personal de Casino Atlántico.
        </p>
        <FormularioEntrar />
      </div>
    </div>
  );
}
