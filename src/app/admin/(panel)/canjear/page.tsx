import type { Metadata } from 'next';
import { PantallaCanje } from './PantallaCanje';
import { buscarCupon, MENSAJES_CUPON } from '@/lib/vouchers';
import { intentar, LIMITE_PANEL_MS } from '@/lib/queries';

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
  // Si la búsqueda no llega a correr, se DICE. El respaldo era `null`, que aquí
  // significa "todavía no se ha buscado nada": el empleado escribía un código,
  // la base tardaba, y la pantalla volvía igual que antes de buscar. En un
  // mostrador eso se lee como "el lector no funcionó" y se vuelve a teclear.
  //
  // Lo que NUNCA puede pasar aquí es decir "ese cupón no existe" por un fallo de
  // lectura: sería negarle su premio a alguien que sí lo ganó.
  const busqueda = codigo
    ? await intentar(async () => {
        const r = await buscarCupon(codigo);
        return r.ok
          ? { cupon: r.cupon, canjeable: r.canjeable }
          : { error: MENSAJES_CUPON[r.codigo] };
      }, null, LIMITE_PANEL_MS)
    : null;

  const inicial =
    busqueda === null
      ? null
      : busqueda.ok
        ? busqueda.datos
        : {
            error:
              'No pudimos consultar el cupón: la base de datos no contestó. ' +
              'Vuelve a intentarlo — esto NO quiere decir que el cupón sea inválido.',
          };

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
