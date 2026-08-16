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
    with ultimas as (
      select distinct on (m.id)
             m.id, m.name, m.bank_number, r.amount_cents, r.reading_at
        from app.machines m
        join app.jackpot_readings r on r.machine_id = m.id
       where m.active and r.amount_cents is not null
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
           h.maximo, coalesce(h.lecturas, 0)::int as lecturas
      from ultimas u
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
    };
  });
}

export async function getUltimaActualizacion(): Promise<string | null> {
  const [fila] = await sql<{ max: string | null }[]>`
    select max(reading_at) as max from app.jackpot_readings where amount_cents is not null
  `;
  return fila?.max ?? null;
}

export type MaquinaNueva = {
  id: string;
  name: string;
  description: string | null;
  image_path: string | null;
  arrived_on: string;
  bank_number: number | null;
};

export async function getMaquinasNuevas(limite = 24): Promise<MaquinaNueva[]> {
  return sql<MaquinaNueva[]>`
    select id, name, description, image_path, arrived_on, bank_number
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
 * Envoltura tolerante a fallos para las páginas públicas.
 *
 * Si la base de datos no responde, una sección informativa debe quedarse vacía
 * — no tumbar la página entera. El visitante que venía a ver la dirección y el
 * horario los sigue viendo, que es lo que más se consulta.
 */
export async function seguro<T>(fn: () => Promise<T>, respaldo: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error('[consulta fallida]', e);
    return respaldo;
  }
}
