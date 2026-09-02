import type { EstadoPublico as Estado } from '@/lib/visibilidad';

/**
 * La etiqueta que dice si algo se está viendo en la página, y por qué no.
 *
 * ES LA MISMA EN LAS NUEVE PESTAÑAS. Antes cada una tenía la suya:
 * "Publicada/Oculta" en promociones y máquinas, "agotado" en la carta,
 * "(no sale)" en ganadores, "(apagado)" en el horario, y en la galería nada.
 * Cinco vocabularios para la misma pregunta —¿lo ve la gente o no?— en un panel
 * que usa una sola persona.
 *
 * El motivo va DEBAJO y en frase entera, no en un icono ni en un tooltip: el
 * caso que hay que resolver es el de una promoción vencida que salía marcada en
 * verde como publicada, y ahí la palabra "Oculto" sola no basta. Hace falta
 * "Terminó el 31 de agosto y se quitó sola de la página".
 */
export function EtiquetaEstado({ estado }: { estado: Estado }) {
  const color =
    estado.tono === 'vive'
      ? 'border-gana/40 text-gana'
      : estado.tono === 'aviso'
        ? 'border-dorado/50 text-dorado'
        : 'border-linea text-tenue';

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${color}`}
    >
      <span aria-hidden="true" className="text-[9px] leading-none">
        {estado.tono === 'vive' ? '●' : estado.tono === 'aviso' ? '▲' : '○'}
      </span>
      {estado.etiqueta}
    </span>
  );
}

/**
 * La etiqueta y su explicación, uno debajo del otro.
 *
 * La explicación solo se pinta cuando aporta algo: si está en la página y no
 * hay nada raro, la etiqueta verde ya lo dice todo y una frase más solo sería
 * ruido en una lista de veinte filas.
 */
export function Estado({ estado }: { estado: Estado }) {
  const callar = estado.visible && estado.tono === 'vive';

  return (
    <div className="min-w-0">
      <EtiquetaEstado estado={estado} />
      {!callar && <p className="mt-1 text-xs leading-snug text-tenue">{estado.detalle}</p>}
    </div>
  );
}
