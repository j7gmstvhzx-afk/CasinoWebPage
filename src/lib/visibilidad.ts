/**
 * ¿ESTO SE VE EN LA PÁGINA? — una sola respuesta, para el panel y para el sitio.
 *
 * EL PROBLEMA QUE RESUELVE
 * -----------------------
 * Las consultas públicas filtran; las del panel no. `/eventos` pide
 * `published AND (ends_on is null OR ends_on >= hoy)`; el panel pide la tabla
 * entera. Así que una promoción vencida salía en el panel con la etiqueta verde
 * "Publicada" y un botón que decía "Ocultar" —los dos afirmando que estaba a la
 * vista— y en la página no estaba. El dueño lo reportó como que el panel y la
 * página no cuadran, y tenía toda la razón: el panel le estaba mintiendo.
 *
 * Lo mismo pasaba con el tablero de jackpots, donde la regla es más difícil de
 * adivinar todavía (ver `estadoMaquinaJackpot`).
 *
 * LA REGLA
 * --------
 * Toda condición que decida si algo sale en la página pública se escribe AQUÍ,
 * una sola vez, y el panel la pinta tal cual. Cuando mañana alguien añada un
 * filtro nuevo a una consulta pública, tiene que añadirlo aquí también, o el
 * panel volverá a mentir. `scripts/verificar-visibilidad.mjs` comprueba contra
 * la base de datos que las dos mitades siguen diciendo lo mismo.
 *
 * UNA SOLA FORMA DE DECIRLO
 * -------------------------
 * Antes había cinco vocabularios para la misma idea en cinco pestañas:
 * "Publicada/Oculta" en promociones y máquinas, "agotado / volver a servir" en
 * la carta, "(no sale)" en ganadores, "(apagado)" en el horario, y nada en la
 * galería. Ahora todas dicen lo mismo: EN LA PÁGINA, u OCULTO con el motivo al
 * lado. El personal no tiene que aprender una palabra por pestaña.
 */

import { longDate } from './format';
import { hoyEnPR } from './hora-pr';

/** Cuántos días atrás sigue publicándose un monto de jackpot. Ver `getJackpots`. */
export const VENTANA_TABLERO_DIAS = 3;

/** Cuántas promociones caben en el pop-up de entrada. Ver `getPromocionesPopup`. */
export const TOPE_POPUP = 4;

export type EstadoPublico = {
  /** ¿Lo ve ahora mismo cualquiera que entre a la página? */
  visible: boolean;
  /** Dos o tres palabras, para la etiqueta. */
  etiqueta: string;
  /** Una frase entera que explica el porqué. Se lee sola, sin la etiqueta. */
  detalle: string;
  /**
   * El color.
   * - `vive`: está en la página.
   * - `apagado`: no está, y es porque alguien lo decidió.
   * - `aviso`: no está (o está a medias) por una regla que conviene explicar.
   */
  tono: 'vive' | 'apagado' | 'aviso';
};

const EN_LA_PAGINA: EstadoPublico = {
  visible: true,
  etiqueta: 'En la página',
  detalle: 'Cualquiera que entre a la página lo está viendo ahora mismo.',
  tono: 'vive',
};

function oculto(detalle: string): EstadoPublico {
  return { visible: false, etiqueta: 'Oculto', detalle, tono: 'apagado' };
}

function noSale(etiqueta: string, detalle: string): EstadoPublico {
  return { visible: false, etiqueta, detalle, tono: 'aviso' };
}

// =============================================================================
// Promociones y eventos
// =============================================================================

export type CamposEvento = {
  published: boolean;
  starts_on: string | null;
  ends_on: string | null;
};

/**
 * Una promoción en `/eventos` y en la portada.
 *
 * Espeja `getEventos`: `where published and (ends_on is null or ends_on >= hoy)`.
 *
 * Una promoción que todavía no ha empezado SÍ sale —la página la pinta bajo
 * "Próximamente"—, así que aquí cuenta como visible; pero se dice, porque no
 * está donde el personal cree que la puso.
 */
export function estadoEvento(e: CamposEvento, hoy = hoyEnPR()): EstadoPublico {
  if (!e.published) {
    return oculto('Solo la ves tú. Pulsa "Publicar" para que salga en la página.');
  }
  if (e.ends_on && e.ends_on < hoy) {
    return noSale(
      'Ya terminó',
      `Terminó el ${longDate(e.ends_on)} y se quitó sola de la página. ` +
        'Para volver a usarla, edítala y ponle una fecha de fin posterior a hoy.',
    );
  }
  if (e.starts_on && e.starts_on > hoy) {
    return {
      visible: true,
      etiqueta: 'Programada',
      detalle:
        `Sale en la página bajo "Próximamente". Pasa a lo de ahora mismo el ` +
        `${longDate(e.starts_on)}.`,
      tono: 'aviso',
    };
  }
  return EN_LA_PAGINA;
}

/**
 * La misma promoción, pero en el pop-up que ve el visitante al entrar.
 *
 * El pop-up es más estricto que la página: además de estar publicada y no
 * vencida, tiene que haber EMPEZADO ya, y solo caben cuatro. `puesto` es el
 * lugar que ocupa entre las que sí califican, contando desde 0, en el mismo
 * orden que `getPromocionesPopup` (`sort_order, created_at desc`).
 */
export function estadoPopup(
  e: CamposEvento & { show_in_popup: boolean },
  puesto: number,
  hoy = hoyEnPR(),
): EstadoPublico | null {
  if (!e.show_in_popup) return null;

  if (!e.published) return oculto('No sale al entrar porque la promoción está oculta.');
  if (e.ends_on && e.ends_on < hoy) {
    return noSale('No sale al entrar', `Ya terminó el ${longDate(e.ends_on)}.`);
  }
  if (e.starts_on && e.starts_on > hoy) {
    return noSale(
      'Todavía no sale al entrar',
      `Empieza el ${longDate(e.starts_on)}. Hasta ese día no se le enseña a nadie al entrar.`,
    );
  }
  if (puesto >= TOPE_POPUP) {
    return noSale(
      'No cabe al entrar',
      `Solo se le enseñan ${TOPE_POPUP} al visitante y esta es la número ${puesto + 1}. ` +
        'Desmarca alguna de las de arriba para hacerle sitio.',
    );
  }
  return {
    visible: true,
    etiqueta: 'Sale al entrar',
    detalle: 'El visitante ve este arte antes de poder usar la tragamonedas.',
    tono: 'vive',
  };
}

// =============================================================================
// Máquinas nuevas, ganadores, galería
// =============================================================================

/** Espeja `getMaquinasNuevas`: `where published`. */
export function estadoMaquinaNueva(m: { published: boolean }): EstadoPublico {
  return m.published
    ? EN_LA_PAGINA
    : oculto('Solo la ves tú. Pulsa "Publicar" para anunciarla en la página.');
}

/** Espeja `getGanadores`: `where publicado`. */
export function estadoGanador(g: { publicado: boolean }): EstadoPublico {
  return g.publicado
    ? EN_LA_PAGINA
    : oculto('Solo lo ves tú. Pulsa "Publicar" para que salga en el muro.');
}

/**
 * La galería no tiene borrador: `getGaleria` no filtra nada.
 *
 * No es un descuido que haya que arreglar con una columna más; es una decisión
 * que hay que DECIR. Subir una foto es publicarla, y el panel tiene que
 * advertirlo antes de que alguien suba una foto para "verla luego".
 */
export function estadoFoto(): EstadoPublico {
  return {
    visible: true,
    etiqueta: 'En la página',
    detalle: 'En la galería no hay borrador: al subir una foto ya se ve. Para quitarla, bórrala.',
    tono: 'vive',
  };
}

// =============================================================================
// La carta
// =============================================================================

/** Espeja el `where i.available` de la consulta de `/menu`. */
export function estadoPlato(p: { available: boolean }): EstadoPublico {
  return p.available
    ? EN_LA_PAGINA
    : noSale('Agotado', 'No sale en la carta mientras esté marcado como agotado.');
}

// =============================================================================
// El tablero de jackpots
// =============================================================================

/**
 * ¿Está esta máquina en el tablero público?
 *
 * ESTA ES LA REGLA MÁS DIFÍCIL DE ADIVINAR DE TODO EL SITIO, y la que más
 * confusión ha causado. El tablero solo publica las máquinas cuya última
 * lectura entra en una ventana de tres días, y esa ventana NO cuelga de hoy:
 * cuelga de la lectura más reciente de todo el sistema.
 *
 * Lo que eso significa en la práctica, y que nadie puede deducir mirando la
 * pantalla: si el personal actualiza una sola máquina, la ventana entera se
 * corre hasta hoy, y CUALQUIER OTRA máquina que llevara más de tres días sin
 * tocarse se cae del tablero en ese mismo momento. Se cae por actualizar otra.
 *
 * La ventana existe por una buena razón —que el tablero no se quede en blanco
 * cuando nadie sube la hoja durante unos días, que ya pasó en producción— pero
 * su efecto secundario tiene que salir escrito en la pantalla del que teclea.
 *
 * `corte` es la lectura más reciente del sistema y `ultima` la de esta máquina,
 * las dos como día de calendario 'YYYY-MM-DD'.
 */
export function estadoMaquinaJackpot(m: {
  ultima: string | null;
  corte: string | null;
}): EstadoPublico {
  if (!m.ultima) {
    return noSale(
      'Sin monto',
      'Nunca se le ha guardado un monto, así que no sale en el tablero. Escribe uno y guarda.',
    );
  }
  if (!m.corte) return EN_LA_PAGINA;

  // El mismo `>` estricto que la consulta: un empate exacto queda fuera.
  const limite = restarDias(m.corte, VENTANA_TABLERO_DIAS);
  if (m.ultima <= limite) {
    return noSale(
      'Fuera del tablero',
      `Su último monto es del ${longDate(m.ultima)} y el tablero solo publica los de los ` +
        `últimos ${VENTANA_TABLERO_DIAS} días. Escríbele un monto de hoy y vuelve.`,
    );
  }
  return EN_LA_PAGINA;
}

/** 'YYYY-MM-DD' menos N días. En UTC, para que no lo corra ningún huso. */
function restarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}

// =============================================================================
// El programa semanal
// =============================================================================

/** Espeja `getPrograma`: `where activo`. */
export function estadoPrograma(p: { activo: boolean }): EstadoPublico {
  return p.activo
    ? EN_LA_PAGINA
    : oculto('Solo lo ves tú. Enciéndelo para que salga en el parte del día.');
}
