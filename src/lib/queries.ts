import 'server-only';
import { sql } from './db';

export type Jackpot = {
  id: string;
  name: string;
  bank_number: number;
  amount_cents: string;
  reading_at: string;
  anterior: string | null;
  maximo: string | null;
  lecturas: number;
  desactualizado: boolean;
};

export type JackpotVista = {
  id: string;
  nombre: string;
  banco: number;
  centavos: number;
  leidoEn: string;
  /** Cerca de lo más alto que ha estado esta máquina. */
  caliente: boolean;
  /** Comparado con la lectura anterior. */
  tendencia: 'sube' | 'baja' | 'igual';
  /** Su monto no entró en la última actualización general. */
  desactualizado: boolean;
};

/**
 * Jackpots actuales.
 *
 * Sobre el badge CALIENTE: se compara cada máquina contra SU PROPIO máximo de
 * los últimos 90 días, no contra el resto del salón ni contra su promedio.
 *
 * Comparar contra el promedio parece lo natural y está mal: un jackpot
 * progresivo sube sin parar hasta que alguien lo pega, así que casi siempre
 * está por encima de su promedio reciente, y el badge se encendería en todas
 * las máquinas a la vez — que es exactamente lo mismo que no encenderlo en
 * ninguna.
 *
 * Contra el máximo sí dice algo: la máquina está cerca de lo más alto que ha
 * llegado desde la última vez que se pegó. Eso es justo lo que el cliente
 * quiere saber, y solo es cierto en una parte del salón a la vez.
 *
 * Se compara cada máquina consigo misma y no con las demás porque una de $400
 * en su punto más alto es mejor noticia que una de $12,000 que siempre anda por
 * ahí; comparando entre máquinas, el fuego saldría siempre en las mismas tres.
 */
export async function getJackpots(): Promise<JackpotVista[]> {
  const filas = await sql<Jackpot[]>`
    -- La lectura más reciente de TODO el sistema. Es el momento de la última
    -- actualización general, sirve para saber qué máquinas se quedaron fuera,
    -- y además ANCLA la ventana de frescura (ver abajo).
    with corte as (
      select max(reading_at) as ultima from app.jackpot_readings where amount_cents is not null
    ),
    ultimas as (
      select distinct on (m.id)
             m.id, m.name, m.bank_number, r.amount_cents, r.reading_at
        from app.machines m
        join app.jackpot_readings r on r.machine_id = m.id
        cross join corte c
       where m.active
         and r.amount_cents is not null
         -- Ventana de frescura de 3 días, colgada de la ÚLTIMA SUBIDA y no de
         -- "ahora". Sigue sacando del tablero la máquina que salió del salón
         -- mientras el resto se actualiza — que es para lo que está: si la hoja
         -- se sube a diario, la última subida ES ahora y la ventana es la misma
         -- de siempre.
         --
         -- Pero anclada solo a now() tenía un modo de fallo grave: si NADIE
         -- sube la hoja durante tres días (el personal de vacaciones, el Excel
         -- que no cuadra, un festivo largo), la ventana se come el tablero
         -- ENTERO y la página de premios queda en blanco, con el mensaje de
         -- "Los premios se están actualizando". Un casino con sus jackpots al
         -- día en la base de datos se ve, desde la calle, como si no tuviera
         -- ninguno. Pasó: la última subida fue el 18 de agosto y la página
         -- llevaba una semana vacía.
         --
         -- Colgada de la última subida, el tablero muestra SIEMPRE el último
         -- estado publicado. Que ese estado es viejo se dice arriba, con su
         -- fecha, en vez de esconderlo todo.
         and r.reading_at > c.ultima - interval '3 days'
       order by m.id, r.reading_at desc
    ),
    previas as (
      select distinct on (r.machine_id) r.machine_id, r.amount_cents
        from app.jackpot_readings r
        join ultimas u on u.id = r.machine_id
       where r.amount_cents is not null and r.reading_at < u.reading_at
       order by r.machine_id, r.reading_at desc
    ),
    historial as (
      select machine_id,
             max(amount_cents) as maximo,
             count(*)          as lecturas
        from app.jackpot_readings
       where amount_cents is not null
         and reading_at > now() - interval '90 days'
       group by machine_id
    )
    select u.id, u.name, u.bank_number, u.amount_cents, u.reading_at,
           p.amount_cents as anterior,
           h.maximo, coalesce(h.lecturas, 0)::int as lecturas,
           (u.reading_at < c.ultima - interval '12 hours') as desactualizado
      from ultimas u
      cross join corte c
      left join previas   p on p.machine_id = u.id
      left join historial h on h.machine_id = u.id
     order by u.amount_cents desc
  `;

  return filas.map((f) => {
    const centavos = Number(f.amount_cents);
    const anterior = f.anterior === null ? null : Number(f.anterior);
    const maximo = f.maximo === null ? null : Number(f.maximo);

    return {
      id: f.id,
      nombre: f.name,
      banco: f.bank_number,
      centavos,
      leidoEn: f.reading_at,
      // Se exigen al menos 10 lecturas para no marcar caliente una máquina
      // recién añadida, que estaría en su "máximo" solo por no tener historial.
      caliente: maximo !== null && f.lecturas >= 10 && centavos >= maximo * 0.9,
      tendencia:
        anterior === null || anterior === centavos
          ? 'igual'
          : centavos > anterior
            ? 'sube'
            : 'baja',
      desactualizado: f.desactualizado,
    };
  });
}

export type FilaEntrada = {
  id: string;
  nombre: string;
  banco: number;
  centavosHoy: number | null;
  centavosPrevio: number | null;
};

/**
 * Máquinas activas para la pantalla de entrada manual.
 *
 * Van en el MISMO orden que el tablero público — de mayor a menor — para que lo
 * que el empleado tiene delante cuadre con lo que el cliente ve. Si aquí
 * salieran alfabéticas y allá por monto, comprobar un dato obligaría a saltar
 * de un lado a otro.
 */
export async function getMaquinasParaEntrada(): Promise<FilaEntrada[]> {
  const filas = await sql<
    {
      id: string;
      name: string;
      bank_number: number;
      centavos_hoy: string | null;
      centavos_previo: string | null;
    }[]
  >`
    select m.id, m.name, m.bank_number,
           hoy.amount_cents  as centavos_hoy,
           ayer.amount_cents as centavos_previo
      from app.machines m
      left join lateral (
        select r.amount_cents
          from app.jackpot_readings r
         where r.machine_id = m.id
           and app.gaming_date(r.reading_at) = app.gaming_date(now())
         order by r.reading_at desc
         limit 1
      ) hoy on true
      left join lateral (
        select r.amount_cents
          from app.jackpot_readings r
         where r.machine_id = m.id
           and app.gaming_date(r.reading_at) < app.gaming_date(now())
           and r.amount_cents is not null
         order by r.reading_at desc
         limit 1
      ) ayer on true
     where m.active
     order by coalesce(hoy.amount_cents, ayer.amount_cents, 0) desc, m.name
  `;

  return filas.map((f) => ({
    id: f.id,
    nombre: f.name,
    banco: f.bank_number,
    centavosHoy: f.centavos_hoy === null ? null : Number(f.centavos_hoy),
    centavosPrevio: f.centavos_previo === null ? null : Number(f.centavos_previo),
  }));
}

export async function getUltimaActualizacion(): Promise<string | null> {
  const [fila] = await sql<{ max: string | null }[]>`
    select max(reading_at) as max from app.jackpot_readings where amount_cents is not null
  `;
  return fila?.max ?? null;
}

/**
 * ¿Los montos que se están enseñando son de hoy?
 *
 * El corte a las 20 horas y no a las 24: la hoja se sube por la mañana, así que
 * a las 24 h una subida de ayer temprano todavía contaría como "de hoy" bien
 * entrada la tarde siguiente.
 *
 * La comparación se hace en SQL, con el reloj de la base, y no en el
 * componente. `Date.now()` en el cuerpo de un componente es impuro —dos
 * renders pueden dar resultados distintos— y el linter de React lo rechaza con
 * razón. Aquí, además, el reloj de la base es la referencia correcta: es el
 * mismo que estampó `reading_at`, así que no puede haber deriva entre los dos
 * relojes que se están restando.
 */
export async function getJackpotsAlDia(): Promise<boolean> {
  const [fila] = await sql<{ al_dia: boolean | null }[]>`
    select max(reading_at) > now() - interval '20 hours' as al_dia
      from app.jackpot_readings
     where amount_cents is not null
  `;
  return fila?.al_dia ?? false;
}

export type MaquinaNueva = {
  id: string;
  name: string;
  description: string | null;
  image_path: string | null;
  arrived_on: string;
  bank_number: number | null;
  /** Llegó hace 30 días o menos. */
  es_nueva: boolean;
};

/** Se considera "recién llegada" durante 30 días. */
const DIAS_NUEVA = 30;

export async function getMaquinasNuevas(limite = 24): Promise<MaquinaNueva[]> {
  return sql<MaquinaNueva[]>`
    select id, name, description, image_path, arrived_on, bank_number,
           -- El "hoy" lo pone la base de datos, no el servidor de Next: es la
           -- misma fuente de fecha que usa el resto del sistema, y siempre en
           -- hora de Puerto Rico.
           --
           -- El ::integer NO es opcional. Sin él, el parámetro llega sin tipo,
           -- Postgres resuelve la resta como fecha menos fecha (que da entero)
           -- en vez de fecha menos entero (que da fecha), y revienta con
           -- "operator does not exist: date > integer".
           (arrived_on > app.gaming_date(now()) - ${DIAS_NUEVA}::integer) as es_nueva
      from app.new_machines
     where published
     order by arrived_on desc
     limit ${limite}
  `;
}

export type Evento = {
  id: string;
  title: string;
  body: string | null;
  image_path: string | null;
  starts_on: string | null;
  ends_on: string | null;
};

/**
 * Eventos publicados y todavía vigentes.
 *
 * Se filtra por `ends_on` en la consulta y no en la página: así una promoción
 * vencida desaparece sola el día que toca, sin que nadie tenga que acordarse de
 * despublicarla. Los eventos sin fecha de fin se quedan hasta que los quiten.
 */
export async function getEventos(limite = 60): Promise<Evento[]> {
  return sql<Evento[]>`
    select id, title, body, image_path, starts_on, ends_on
      from app.events
     where published
       and (ends_on is null or ends_on >= app.gaming_date(now()))
     order by sort_order, coalesce(starts_on, created_at::date) desc
     limit ${limite}
  `;
}

export type PromoPopup = {
  id: string;
  title: string;
  body: string | null;
  image_path: string | null;
  starts_on: string | null;
  ends_on: string | null;
};

/**
 * Promociones que salen en el pop-up de entrada.
 *
 * Solo las marcadas a mano por el personal, publicadas y vigentes hoy. Se
 * limita a 4 aunque marquen más: el visitante tiene que pasar por todas antes
 * de llegar a la tragamonedas, y a partir de cuatro pantallas la gente cierra
 * en vez de leer — se perdería justo lo que se quería enseñar.
 */
export async function getPromocionesPopup(): Promise<PromoPopup[]> {
  return sql<PromoPopup[]>`
    select id, title, body, image_path, starts_on, ends_on
      from app.events
     where show_in_popup
       and published
       and (starts_on is null or starts_on <= app.gaming_date(now()))
       and (ends_on   is null or ends_on   >= app.gaming_date(now()))
     order by sort_order, created_at desc
     limit 4
  `;
}

export type ItemGaleria = {
  id: string;
  image_path: string;
  caption: string | null;
};

export async function getGaleria(limite = 60): Promise<ItemGaleria[]> {
  return sql<ItemGaleria[]>`
    select id, image_path, caption
      from app.gallery_items
     order by sort_order, created_at desc
     limit ${limite}
  `;
}

/**
 * Cuánto se espera por una consulta antes de renunciar a ella.
 *
 * Ninguna de estas consultas es pesada: si a los 2.5 s no ha vuelto, no está
 * "tardando", está trabada, y esperar más no la va a arreglar.
 */
export const LIMITE_CONSULTA_MS = 2_500;

/**
 * Envoltura tolerante a fallos para las páginas públicas.
 *
 * Si la base de datos no responde, una sección informativa debe quedarse vacía
 * — no tumbar la página entera. El visitante que venía a ver la dirección y el
 * horario los sigue viendo, que es lo que más se consulta.
 *
 * POR QUÉ HAY UN TIEMPO LÍMITE Y NO SOLO UN try/catch
 * ---------------------------------------------------
 * Atrapar el error no alcanzaba: una conexión trabada NO lanza nada, se queda
 * esperando. Sin límite, la petición seguía viva hasta el techo de la función
 * en Vercel — 300 segundos. En producción eso salió 176 veces, repartido por
 * todas las pestañas del sitio.
 *
 * Y así es como se siente desde el celular: al tocar una pestaña, Next pide el
 * .rsc de esa ruta; si esa petición se cuelga cinco minutos, la pantalla no
 * cambia y no aparece ningún error. Es exactamente el "toco la pestaña y no
 * pasa nada" que se reportó una y otra vez, y por eso ningún arreglo del menú
 * lo resolvía: el menú nunca tuvo la culpa.
 */
export async function seguro<T>(fn: () => Promise<T>, respaldo: T): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, rechazar) => {
        temporizador = setTimeout(
          () => rechazar(new Error(`la consulta pasó de ${LIMITE_CONSULTA_MS} ms`)),
          LIMITE_CONSULTA_MS,
        );
      }),
    ]);
  } catch (e) {
    console.error('[consulta fallida]', e);
    return respaldo;
  } finally {
    // Sin esto, el temporizador mantiene vivo el proceso hasta que vence,
    // incluso cuando la consulta respondió a tiempo.
    clearTimeout(temporizador);
  }
}
