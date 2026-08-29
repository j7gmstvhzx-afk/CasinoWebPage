import {
  aMinutos,
  comoHora,
  DIAS,
  diaSemanaDe,
  hoyEnPR,
  minutosEnPR,
  sumarDias,
} from './hora-pr';

/**
 * ¿Está abierto el casino ahora mismo?
 *
 * Funciones puras, sin base de datos y sin `server-only`: LAS MISMAS CORREN EN
 * EL SERVIDOR Y EN EL NAVEGADOR, y esa es la parte importante del diseño.
 *
 * POR QUÉ SE CALCULA DOS VECES
 * ----------------------------
 * Todas las páginas públicas se sirven de caché (`export const revalidate = 60`
 * en cada una). Si el servidor calculara "Abierto" y mandara esa palabra ya
 * pintada, un visitante podría leer "Abierto ahora" un minuto largo después de
 * que el salón cerrara, porque lo que le llega es una página guardada.
 *
 * La solución no es quitar la caché —eso devuelve la página a consultar la base
 * de datos en cada visita, que es lo que tumbó las pestañas en producción— sino
 * mandar EL HORARIO en vez del ESTADO. Un horario no caduca: "los sábados
 * abrimos a las 8" sigue siendo cierto mañana. El estado se calcula en el
 * navegador, con el reloj del momento, y se corrige solo cada minuto.
 *
 * El servidor pinta igualmente su versión para que la página tenga sentido sin
 * JavaScript y para que no haya un hueco en blanco mientras carga.
 *
 * LA HORA QUE MANDA ES LA DE PUERTO RICO
 * --------------------------------------
 * Nunca la del visitante. Alguien mirando desde Nueva York a las 11 de la noche
 * tiene que ver si el salón de Manatí está abierto a las 7 de la tarde de allá,
 * no si lo está a las 11 de la suya. Ver `hora-pr.ts`.
 */

/** Una franja de apertura. Horas en 'HH:MM' (o 'HH:MM:SS', como las manda Postgres). */
export type Franja = { abre: string; cierra: string };

/** La regla de un día. `null` = cerrado. */
export type ReglaDia = Franja | null;

export type HorarioSitio = {
  /** Siete posiciones, 0 = domingo … 6 = sábado. */
  semana: ReglaDia[];
  /**
   * Excepciones por fecha 'YYYY-MM-DD'. El valor `null` significa CERRADO ese
   * día, que no es lo mismo que no tener excepción — de ahí que se compruebe
   * con `hasOwn` y no con `!= null`.
   */
  excepciones: Record<string, ReglaDia>;
};

export type Programa = {
  id: string;
  titulo: string;
  detalle: string | null;
  dias: number[];
  desde: string;
  hasta: string;
  cortesia: boolean;
  icono: string | null;
};

export type Estado =
  | { abierto: true; cierraTexto: string; minutosParaCerrar: number }
  | { abierto: false; abreTexto: string | null; cuandoAbre: string | null };

/** La regla que aplica a una fecha: la excepción si la hay, si no la del día de la semana. */
export function reglaDe(h: HorarioSitio, fecha: string): ReglaDia {
  if (Object.hasOwn(h.excepciones, fecha)) return h.excepciones[fecha];
  return h.semana[diaSemanaDe(fecha)] ?? null;
}

/**
 * ¿Esta franja termina al día siguiente?
 *
 * ESTE ES EL CASO QUE SIEMPRE SE CALCULA MAL. Un casino que abre a las 8:00
 * a.m. y cierra a las 12:00 a.m. cierra al DÍA SIGUIENTE. Comparado a lo bruto,
 * a las 11:30 p.m. la cuenta da "abierto" de casualidad y a las 12:30 a.m. da
 * "cerrado" con el salón lleno de gente.
 *
 * La regla, escrita una sola vez: si la hora de cierre es MENOR que la de
 * apertura, el cierre es de mañana.
 */
function cruzaMedianoche(f: Franja): boolean {
  const a = aMinutos(f.abre);
  const c = aMinutos(f.cierra);
  return a !== null && c !== null && c < a;
}

/** Abierto las 24 horas: la misma hora de apertura y de cierre. */
function esVeinticuatro(f: Franja): boolean {
  return aMinutos(f.abre) === aMinutos(f.cierra);
}

export function estadoDelSalon(h: HorarioSitio, ahora: number = Date.now()): Estado {
  const hoy = hoyEnPR(ahora);
  const min = minutosEnPR(ahora);

  // 1. ¿Seguimos dentro de la franja de AYER? Es la madrugada, y es el tramo
  //    que se pierde si solo se mira el día de hoy.
  const ayer = sumarDias(hoy, -1);
  const rAyer = reglaDe(h, ayer);
  if (rAyer && !esVeinticuatro(rAyer) && cruzaMedianoche(rAyer)) {
    const cierra = aMinutos(rAyer.cierra)!;
    if (min < cierra) {
      return { abierto: true, cierraTexto: comoHora(cierra), minutosParaCerrar: cierra - min };
    }
  }

  // 2. La franja de hoy.
  const rHoy = reglaDe(h, hoy);
  if (rHoy) {
    const abre = aMinutos(rHoy.abre);
    const cierra = aMinutos(rHoy.cierra);
    if (abre !== null && cierra !== null) {
      if (esVeinticuatro(rHoy)) {
        return { abierto: true, cierraTexto: '', minutosParaCerrar: Number.POSITIVE_INFINITY };
      }
      const finAbsoluto = cruzaMedianoche(rHoy) ? cierra + 1440 : cierra;
      if (min >= abre && min < finAbsoluto) {
        return {
          abierto: true,
          cierraTexto: comoHora(cierra),
          minutosParaCerrar: finAbsoluto - min,
        };
      }
      // Todavía no ha abierto hoy.
      if (min < abre) {
        return { abierto: false, abreTexto: comoHora(abre), cuandoAbre: 'hoy' };
      }
    }
  }

  // 3. Cerrado. ¿Cuándo vuelve a abrir? Se miran los siete días siguientes y no
  //    solo mañana: un salón que cierra los lunes y martes tiene que poder
  //    decir "abrimos el miércoles" en vez de quedarse callado.
  for (let i = 1; i <= 7; i++) {
    const fecha = sumarDias(hoy, i);
    const r = reglaDe(h, fecha);
    const abre = r ? aMinutos(r.abre) : null;
    if (r && abre !== null) {
      return {
        abierto: false,
        abreTexto: comoHora(abre),
        cuandoAbre: i === 1 ? 'mañana' : DIAS[diaSemanaDe(fecha)],
      };
    }
  }

  // Ni un solo día con horario. Pasa cuando la tabla está vacía.
  return { abierto: false, abreTexto: null, cuandoAbre: null };
}

/** ¿Está corriendo esto ahora mismo? Misma regla de medianoche que el horario. */
function corriendo(p: Programa, min: number): boolean {
  const d = aMinutos(p.desde);
  const ha = aMinutos(p.hasta);
  if (d === null || ha === null) return false;
  return ha < d ? min >= d || min < ha : min >= d && min < ha;
}

export type ProgramaHoy = Programa & { ahora: boolean; yaPaso: boolean };

/**
 * Lo que hay hoy en el salón, con lo que está pasando ahora mismo marcado.
 *
 * Lo que ya pasó no se esconde: a las cuatro de la tarde sigue siendo útil
 * saber que hay café de cortesía por la mañana, porque es la razón para venir
 * MAÑANA. Se marca y se pinta apagado, no se borra.
 */
export function programaDelDia(
  programas: Programa[],
  ahora: number = Date.now(),
): ProgramaHoy[] {
  const hoy = hoyEnPR(ahora);
  const dow = diaSemanaDe(hoy);
  const min = minutosEnPR(ahora);

  return programas
    .filter((p) => p.dias.includes(dow))
    .map((p) => {
      const hasta = aMinutos(p.hasta);
      const ahoraMismo = corriendo(p, min);
      return {
        ...p,
        ahora: ahoraMismo,
        yaPaso: !ahoraMismo && hasta !== null && min >= hasta,
      };
    })
    .sort((a, b) => (aMinutos(a.desde) ?? 0) - (aMinutos(b.desde) ?? 0));
}

/** "8:00 a.m. – medianoche", para el pie y la página de contacto. */
export function franjaTexto(r: ReglaDia): string {
  if (!r) return 'Cerrado';
  const a = aMinutos(r.abre);
  const c = aMinutos(r.cierra);
  if (a === null || c === null) return 'Cerrado';
  if (a === c) return 'Abierto 24 horas';
  return `${comoHora(a)} – ${comoHora(c)}`;
}

/**
 * El horario de la semana en una o pocas líneas, agrupando días iguales.
 *
 * "Lunes a domingo, 8:00 a.m. – medianoche" en vez de siete renglones que dicen
 * lo mismo. Es lo que decía la cadena escrita a mano en `site.ts`, pero salido
 * del horario de verdad: si el dueño cierra los lunes, esto lo dice solo y
 * nadie tiene que acordarse de cambiar un texto.
 *
 * Se recorre de LUNES a DOMINGO y no de domingo a sábado: es como se lee un
 * horario en un cartel, aunque por dentro el índice 0 sea el domingo.
 */
export function resumenSemana(h: HorarioSitio): { dias: string; horas: string }[] {
  const orden = [1, 2, 3, 4, 5, 6, 0];
  const filas: { dias: string; horas: string }[] = [];

  let inicio = 0;
  for (let i = 0; i <= orden.length; i++) {
    const actual = i < orden.length ? franjaTexto(h.semana[orden[i]] ?? null) : null;
    const anterior = franjaTexto(h.semana[orden[inicio]] ?? null);

    if (actual !== anterior) {
      const desde = DIAS[orden[inicio]];
      const hasta = DIAS[orden[i - 1]];
      filas.push({
        dias: inicio === i - 1 ? cap(desde) : `${cap(desde)} a ${hasta}`,
        horas: anterior,
      });
      inicio = i;
    }
  }
  return filas;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
