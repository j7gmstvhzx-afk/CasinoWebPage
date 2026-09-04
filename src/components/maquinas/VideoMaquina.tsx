'use client';

import { useState } from 'react';
import { Marco } from '@/components/site/Marco';
import { urlIncrustada, miniaturaDeYouTube } from '@/lib/youtube';

/**
 * La foto de una máquina que, al tocarla, se convierte en su video.
 *
 * NO HAY IFRAME HASTA QUE ALGUIEN TOCA.
 *
 * Es la decisión importante de este componente y merece explicarse, porque lo
 * fácil habría sido poner el reproductor de YouTube directamente en la tarjeta.
 * Un iframe de YouTube arrastra cerca de un mega de JavaScript ANTES de que
 * nadie le dé al play. Con doce máquinas en pantalla eso son doce megas y una
 * pestaña que en un teléfono con datos de Manatí no abre.
 *
 * Así que hasta que la persona toca, aquí solo hay una imagen y un botón. Al
 * tocar se cambia por el marco de verdad con `autoplay=1`, y como el toque es
 * un gesto real de la persona, el navegador deja que arranque solo — que es lo
 * que pidió el dueño: "que se dé play automáticamente cuando toques la
 * máquina".
 *
 * QUÉ SE VE ANTES DE TOCAR
 * ------------------------
 * La foto que subió el personal, si la hay. Si no la hay, la miniatura que
 * YouTube generó del propio video: es un fotograma de la máquina de verdad,
 * mucho mejor que la placa gris de la marca. Y si no hay ni una ni otra, la
 * placa, que es lo que hacía antes.
 *
 * SIN VIDEO ESTO NO SE ENTROMETE
 * ------------------------------
 * Si la máquina no tiene video, se devuelve el `Marco` de siempre, sin botón,
 * sin cursor de mano y sin nada que sugiera que se puede tocar. Una tarjeta que
 * parece un botón y no hace nada es peor que una tarjeta quieta.
 */
export function VideoMaquina({
  videoId,
  imagen,
  nombre,
  proporcion = 'aspect-square',
}: {
  videoId: string | null;
  imagen: string | null;
  nombre: string;
  proporcion?: string;
}) {
  const [tocado, setTocado] = useState(false);

  if (!videoId) return <Marco imagen={imagen} alt={nombre} proporcion={proporcion} />;

  if (tocado) {
    return (
      <div className={`relative ${proporcion} w-full overflow-hidden bg-maquina`}>
        <iframe
          src={urlIncrustada(videoId)}
          title={`Video de ${nombre}`}
          // `allow` con autoplay: sin esto Chrome bloquea el arranque aunque el
          // marco lo pida, porque un iframe no hereda el permiso del gesto.
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTocado(true)}
      // El nombre lo dice todo en voz alta: quien navega con lector de pantalla
      // oye "Ver el video de Money in the Bank", no "botón".
      aria-label={`Ver el video de ${nombre}`}
      className="group relative block w-full cursor-pointer overflow-hidden"
    >
      <Marco
        imagen={imagen ?? miniaturaDeYouTube(videoId)}
        alt={nombre}
        proporcion={proporcion}
      />

      {/* Una sombra suave para que el botón blanco se lea sobre cualquier foto,
          incluidas las claras. Sin ella, un gabinete blanco se comía el play. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent transition-opacity group-hover:opacity-80"
      />

      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 shadow-suave transition-transform duration-200 group-hover:scale-110 group-active:scale-95">
          {/* El triángulo va desplazado 2px a la derecha: centrado de verdad se
              ve corrido a la izquierda, porque el peso visual de un triángulo
              no está en su centro geométrico. */}
          <svg viewBox="0 0 24 24" className="ml-[2px] h-7 w-7 fill-tinta">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        </span>
      </span>

      <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
        Ver el video
      </span>
    </button>
  );
}
