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
    <div className="anim-entrar text-center">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-dorado">
        {promos.length > 1 ? `Promoción ${i + 1} de ${promos.length}` : 'Promoción de hoy'}
      </p>

      {/* El arte manda. Si todavía no hay imagen cargada, el título ocupa su
          lugar en grande en vez de dejar un hueco. */}
      {promo.image_path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={promo.id}
          src={promo.image_path}
          alt={promo.title}
          className="anim-entrar mx-auto mt-4 max-h-[52vh] w-auto rounded-2xl border border-linea object-contain"
        />
      ) : (
        <div className="mt-4 flex min-h-[16rem] items-center justify-center rounded-2xl border border-linea bg-gradient-to-br from-superficie to-linea p-8">
          <p className="font-display text-3xl font-bold">{promo.title}</p>
        </div>
      )}

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
              className={`h-1.5 rounded-full transition-all ${
                n === i ? 'w-6 bg-dorado' : 'w-1.5 bg-linea'
              }`}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => (ultima ? onTerminar() : setI(i + 1))}
        className="mt-6 w-full rounded-2xl bg-gradient-to-b from-dorado-3 to-dorado-2 px-8 py-4 font-display text-lg font-bold tracking-wide text-tinta shadow-premio transition-transform hover:scale-[1.01] active:scale-[0.99]"
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
