import type { Metadata } from 'next';
import { PantallaCanje } from './PantallaCanje';
import { buscarCupon, MENSAJES_CUPON } from '@/lib/vouchers';
import { seguro } from '@/lib/queries';

export const dynamic = 'force-dynamic';
// Techo de la función: por defecto Vercel deja llegar a 300 s, y ahí es donde
// se quedaron colgadas las peticiones en producción.
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Canjear cupón',
  robots: { index: false, follow: false },
};

export default async function PaginaCanjear({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const { codigo } = await searchParams;

  // El QR del cupón apunta aquí con ?codigo=... La búsqueda se resuelve EN EL
  // SERVIDOR: el empleado escanea y el cupón ya está en pantalla cuando la
  // página pinta, sin una segunda vuelta al servidor desde el navegador.
  //
  // Abrir esta página NO canjea nada. El canje es un POST aparte, en su propio
  // clic, después de que el empleado coteje la identificación.
  const inicial = codigo
    ? await seguro(async () => {
        const r = await buscarCupon(codigo);
        return r.ok
          ? { cupon: r.cupon, canjeable: r.canjeable }
          : { error: MENSAJES_CUPON[r.codigo] };
      }, null)
    : null;

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Canjear cupón</h1>
      <p className="mt-2 text-tenue">
        Escanea el QR del cliente o escribe el código.
      </p>

      <div className="mt-8">
        <PantallaCanje codigoInicial={codigo} inicial={inicial} />
      </div>
    </>
  );
}
