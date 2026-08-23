import type { Metadata } from 'next';
import { PageHero } from '@/components/site/PageHero';
import { PanelCuenta } from '@/components/cuenta/PanelCuenta';
import { SITE, PROMO } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Mi cuenta',
  description: `Crea tu cuenta de ${SITE.name}, entra y comprueba si ya participaste hoy en el sorteo.`,
};

// La cáscara es estática: el estado del jugador lo pide el navegador a
// /api/spin, que sí es dinámico. Así esta pantalla abre al instante y no puede
// quedarse colgada esperando a la base.
export const maxDuration = 15;

export default function PaginaCuenta() {
  return (
    <>
      <PageHero
        titulo="Mi cuenta"
        descripcion={`Tu cuenta es lo que te identifica en el sorteo: con ella sabemos que la tirada del día es tuya, y con ella reclamas los ${PROMO.prizeLabel} si ganas.`}
      />

      <section className="contenedor py-10 sm:py-14">
        <div className="mx-auto max-w-2xl">
          <PanelCuenta />
        </div>
      </section>
    </>
  );
}
