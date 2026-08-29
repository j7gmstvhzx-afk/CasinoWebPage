'use client';

import { useEffect, useState } from 'react';
import {
  estadoDelSalon,
  programaDelDia,
  type Estado,
  type HorarioSitio,
  type Programa,
  type ProgramaHoy,
} from '@/lib/horario';

/**
 * El parte del día: si el salón está abierto y qué hay hoy.
 *
 * POR QUÉ ESTO ES UN COMPONENTE DE NAVEGADOR
 * ------------------------------------------
 * La portada se sirve de caché (`revalidate = 60`). Si el estado se calculara
 * solo en el servidor, lo que llega al visitante sería una foto: podría leer
 * "Abierto ahora" un rato largo después de que el salón cerrara, y esa es
 * justo la frase que más caro sale equivocada — alguien maneja hasta Manatí.
 *
 * Así que el servidor manda EL HORARIO, que no caduca, y aquí se calcula el
 * estado con el reloj del momento. Se vuelve a calcular cada 30 segundos, así
 * que la banda cambia sola cuando el salón abre o cierra sin que nadie recargue.
 *
 * SIN PARPADEO Y SIN HUECO
 * ------------------------
 * `inicial` viene ya calculado por el servidor y se usa como primer estado. Sin
 * eso hay dos problemas: un hueco en blanco hasta que arranca el JavaScript, y
 * un aviso de hidratación de React porque el servidor pintó una cosa y el
 * navegador otra. Y la página sigue diciendo algo con sentido aunque el
 * JavaScript no llegue nunca.
 */
export function ParteDelDia({
  horario,
  programa,
  inicial,
  programaInicial,
}: {
  horario: HorarioSitio;
  programa: Programa[];
  inicial: Estado;
  programaInicial: ProgramaHoy[];
}) {
  const [estado, setEstado] = useState<Estado>(inicial);
  const [hoy, setHoy] = useState<ProgramaHoy[]>(programaInicial);

  useEffect(() => {
    function recalcular() {
      setEstado(estadoDelSalon(horario));
      setHoy(programaDelDia(programa));
    }
    // Una vez al montar: si la página venía de la caché, el reloj del servidor
    // podía llevar minutos de retraso.
    recalcular();
    const t = setInterval(recalcular, 30_000);
    return () => clearInterval(t);
  }, [horario, programa]);

  const ahora = hoy.filter((p) => p.ahora);
  const luego = hoy.filter((p) => !p.ahora && !p.yaPaso);

  // Sin horario cargado no se inventa nada: la banda no sale. Es preferible a
  // decir "cerrado" porque nadie llenó una tabla.
  if (!estado.abierto && estado.abreTexto === null && hoy.length === 0) return null;

  return (
    <section
      aria-label="Hoy en el casino"
      className="border-b border-linea bg-superficie"
    >
      <div className="contenedor flex flex-wrap items-center gap-x-6 gap-y-3 py-3.5 text-sm">
        <Estadillo estado={estado} />

        {ahora.map((p) => (
          <Renglon key={p.id} p={p} destacado />
        ))}
        {ahora.length === 0 && luego.slice(0, 2).map((p) => <Renglon key={p.id} p={p} />)}
      </div>
    </section>
  );
}

function Estadillo({ estado }: { estado: Estado }) {
  if (estado.abierto) {
    return (
      <p className="flex items-center gap-2 font-semibold text-tinta">
        {/* El punto verde solo cuando de verdad está abierto. Un indicador que
            está siempre encendido deja de significar nada. */}
        <span className="h-2 w-2 shrink-0 rounded-full bg-gana anim-brillo" aria-hidden="true" />
        Abierto ahora
        {estado.cierraTexto && (
          <span className="font-normal text-tenue">· cierra a las {estado.cierraTexto}</span>
        )}
      </p>
    );
  }

  return (
    <p className="flex items-center gap-2 font-semibold text-tinta">
      <span className="h-2 w-2 shrink-0 rounded-full bg-tenue/50" aria-hidden="true" />
      Cerrado ahora
      {estado.abreTexto && (
        <span className="font-normal text-tenue">· abre {cuando(estado.cuandoAbre)} a las {estado.abreTexto}</span>
      )}
    </p>
  );
}

function Renglon({ p, destacado = false }: { p: ProgramaHoy; destacado?: boolean }) {
  return (
    <p
      className={
        destacado
          ? 'flex items-center gap-2 rounded-full border border-dorado/45 bg-dorado/10 px-3.5 py-1 font-medium text-tinta'
          : 'flex items-center gap-2 text-tenue'
      }
    >
      {p.icono && <span aria-hidden="true">{p.icono}</span>}
      <span>
        {p.titulo}
        {/* Lo que es gratis se dice que es gratis. Es el gancho más barato que
            tiene este casino y no salía en ninguna parte del sitio. */}
        {p.cortesia && <strong className="ml-1.5 font-semibold texto-dorado">gratis</strong>}
      </span>
    </p>
  );
}

/** "hoy" y "mañana" van solos; un día de la semana lleva artículo: "el miércoles". */
function cuando(dia: string | null): string {
  if (!dia) return '';
  return dia === 'hoy' || dia === 'mañana' ? dia : `el ${dia}`;
}
