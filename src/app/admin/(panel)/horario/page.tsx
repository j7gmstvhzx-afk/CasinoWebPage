import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { intentar, LIMITE_PANEL_MS, algunoFallo } from '@/lib/queries';
import { GestorHorario } from './GestorHorario';
import { FalloDeCarga } from '../FalloDeCarga';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export const metadata: Metadata = {
  title: 'Horario',
  robots: { index: false, follow: false },
};

export default async function PaginaHorario() {
  const [rSemana, rExcep, rPrograma] = await Promise.all([
    intentar(
      () => sql<{ dia: number; abre: string | null; cierra: string | null }[]>`
        select dia, abre::text, cierra::text from app.horario order by dia
      `.then((f) => [...f]),
      [],
      LIMITE_PANEL_MS,
    ),
    intentar(
      () => sql<
        { fecha: string; abre: string | null; cierra: string | null; cerrado: boolean; motivo: string | null }[]
      >`
        select fecha::text, abre::text, cierra::text, cerrado, motivo
          from app.horario_excepcion
         where fecha >= (now() at time zone 'America/Puerto_Rico')::date - 7
         order by fecha
      `.then((f) => [...f]),
      [],
      LIMITE_PANEL_MS,
    ),
    intentar(
      () => sql<
        {
          id: string; titulo: string; detalle: string | null; dias: number[];
          desde: string; hasta: string; cortesia: boolean; icono: string | null;
          activo: boolean; orden: number;
        }[]
      >`
        select id, titulo, detalle, dias, desde::text, hasta::text,
               cortesia, icono, activo, orden
          from app.programa order by orden, desde
      `.then((f) => f.map((x) => ({ ...x, dias: (x.dias ?? []).map(Number) }))),
      [],
      LIMITE_PANEL_MS,
    ),
  ]);
  const semana = rSemana.datos;
  const excepciones = rExcep.datos;
  const programa = rPrograma.datos;
  const fallo = algunoFallo(rSemana, rExcep, rPrograma);

  return (
    <>
      <h1 className="font-display text-3xl font-bold">Horario</h1>
      <p className="mt-2 max-w-2xl text-sm text-tenue">
        Esto es lo que hace que la página sepa si el casino está abierto ahora
        mismo. Sale en la portada, en el pie de todas las páginas y en Contacto.
      </p>

      {fallo && <FalloDeCarga que="el horario" />}

      <GestorHorario semana={semana} excepciones={excepciones} programa={programa} />
    </>
  );
}
