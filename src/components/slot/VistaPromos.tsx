'use client';

import { useState } from 'react';
import { longDate } from '@/lib/format';

/**
 * Promociones del día, antes de la tragamonedas.
 *
 * Es la razón de ser de todo esto: la tragamonedas trae al visitante, y la
 * promoción es lo que lo trae al casino. Por eso el arte va PRIMERO y hay que
 * pasar por todas para llegar a la máquina — si fuera saltable, casi nadie las
 * vería y el premio de $25 estaría pagando por nada.
 *
 * Se limita a 4 desde la consulta. Más pantallas seguidas y la gente cierra en
 * vez de leer, que es justo lo contrario de lo que se busca.
 */

export type PromoPopup = {
  id: string;
  title: string;
  body: string | null;
  image_path: string | null;
  starts_on: string | null;
  ends_on: string | null;
};

export function VistaPromos({
  promos,
  onTerminar,
}: {
  promos: PromoPopup[];
  onTerminar: () => void;
}) {
  const [i, setI] = useState(0);
  const promo = promos[i];
  const ultima = i === promos.length - 1;

  return (
    <div className="anim-aparecer text-center">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-dorado">
        {promos.length > 1 ? `Promoción ${i + 1} de ${promos.length}` : 'Promoción de hoy'}
      </p>

      {/* MARCO 4:5 EN CELULAR, 5:4 EN PANTALLA ANCHA.
      
          Estaba en 16:10 y el arte se veía pequeño en el medio con dos franjas
          desenfocadas enormes a los lados: los flyers del casino se diseñan
          para WhatsApp e Instagram, o sea CUADRADOS o verticales, y un marco
          apaisado los deja nadando. En 4:5 un flyer cuadrado llena casi todo el
          hueco y solo deja una banda fina arriba y abajo.
      
          En pantalla ancha se invierte a 5:4: ahí el diálogo tiene 512px de
          ancho y un marco vertical se comería la pantalla entera de un
          portátil, dejando el botón fuera de la vista.

          Sigue siendo `object-contain`: el arte lleva texto y letra pequeña, y
          recortarlo para que llene el marco sería peor que la banda.

          EL ALTO SIGUE RESERVADO, y esto no es una preferencia estética: era el
          fallo del parpadeo.
      
          Antes el <img> no reservaba espacio (`w-auto`, sin width ni height) y
          además se remontaba con `key={promo.id}` al pasar de promoción. Medido
          en un celular a 1.6 Mbps: al aterrizar la foto, el diálogo saltaba de
          434 a 600px de alto y su borde superior brincaba de y=252 a y=168 — 84
          píxeles de golpe. Y como el diálogo está centrado, cada píxel que
          crecía lo recolocaba, así que el `backdrop-blur` del velo se
          recomponía en CADA fotograma: eso es lo que se veía como "cambios de
          luz" detrás. Playwright ni siquiera podía pulsar el botón, porque el
          elemento nunca llegaba a estar quieto dos fotogramas seguidos.

          Con la altura reservada, la foto aparece DENTRO de un marco que ya
          existía. Nada se mueve, ni al cargar ni al cambiar de promoción.

          `anim-aparecer` se quitó de la imagen y se dejó solo en el contenedor:
          estaban anidados, y el desliz de la imagen dentro de un contenedor
          centrado movía el diálogo aunque la altura ya estuviera reservada. */}
      <div className="relative mt-4 aspect-[4/5] max-h-[52vh] w-full overflow-hidden rounded-2xl border border-linea bg-superficie-2 sm:aspect-[5/4]">
        {promo.image_path ? (
          <>
            {/* Fondo desenfocado con la misma foto: rellena las bandas que deja
                `object-contain` cuando el arte no tiene la proporción del
                marco.

                Estaba al 25% y las bandas se veían casi blancas —  el arte
                parecía "pequeño en el medio", que es justo lo que se reportó.
                Al 70% la banda se lee como una prolongación del propio arte y
                el hueco se ve lleno, que es como lo resuelven Instagram y
                YouTube. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 scale-125 bg-cover bg-center opacity-70 blur-2xl"
              style={{ backgroundImage: `url(${JSON.stringify(promo.image_path)})` }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={promo.id}
              src={promo.image_path}
              alt={promo.title}
              // `decoding="sync"` para que el navegador no pinte el marco vacío
              // un instante antes de la foto al cambiar de promoción.
              decoding="sync"
              className="relative mx-auto h-full w-full object-contain"
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <p className="font-display text-3xl font-bold">{promo.title}</p>
          </div>
        )}
      </div>

      {promo.image_path && (
        <h3 className="mt-5 font-display text-2xl font-bold">{promo.title}</h3>
      )}

      {(promo.starts_on || promo.ends_on) && (
        <p className="mt-1.5 text-sm text-cian">
          {promo.starts_on ? longDate(promo.starts_on) : ''}
          {promo.ends_on ? ` — ${longDate(promo.ends_on)}` : ''}
        </p>
      )}

      {promo.body && (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-tenue">
          {promo.body}
        </p>
      )}

      {promos.length > 1 && (
        <div className="mt-5 flex items-center justify-center gap-2" aria-hidden="true">
          {promos.map((p, n) => (
            <span
              key={p.id}
              className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                n === i ? 'w-7 bg-dorado-2' : 'w-1.5 bg-linea'
              }`}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => (ultima ? onTerminar() : setI(i + 1))}
        className="mt-6 w-full rounded-2xl border-b-[4px] border-b-[#8a5f0c] bg-gradient-to-b from-dorado-3 to-dorado-2 px-8 py-4 font-display text-lg font-bold tracking-wide text-tinta shadow-premio transition-[transform,border-width,filter] duration-150 hover:brightness-105 active:translate-y-[2px] active:border-b-[1px]"
      >
        {ultima ? '🎰 IR A LA TRAGAMONEDAS' : 'SIGUIENTE'}
      </button>

      {i > 0 && (
        <button
          type="button"
          onClick={() => setI(i - 1)}
          className="mt-3 text-sm text-tenue underline underline-offset-4 hover:text-tinta"
        >
          Ver la anterior
        </button>
      )}
    </div>
  );
}
