import { getHorario, seguro } from '@/lib/queries';
import { resumenSemana, type HorarioSitio } from '@/lib/horario';
import { SITE } from '@/lib/site';

/**
 * El horario del salón, escrito, sacado de la base de datos.
 *
 * QUÉ SUSTITUYE
 * -------------
 * Una cadena en `src/lib/site.ts`:
 *
 *     hours: 'Lunes a domingo, 8:00 a.m. – 12:00 a.m.'
 *
 * Salía en cuatro sitios —el pie de todas las páginas, Contacto y dos veces en
 * la portada— y para cambiarla había que tocar código y desplegar. El dueño no
 * podía. Y el propio archivo avisa de que ese horario salió de un directorio
 * público, no del casino, así que además podía no ser cierto.
 *
 * Ahora se agrupan los días iguales: si el casino cierra los lunes o abre más
 * tarde los domingos, esto lo dice solo y sin que nadie se acuerde de nada.
 *
 * EL RESPALDO NO ES UNA HORA INVENTADA
 * ------------------------------------
 * Si la consulta falla o la tabla está vacía se cae a `SITE.hours`, que es lo
 * que decía la página hasta ahora. No se pinta "Cerrado": una consulta fallida
 * no es información sobre el salón, y decirle a alguien que el casino está
 * cerrado cuando no lo está le cuesta un viaje.
 */
export async function HorarioTexto({ detallado = false }: { detallado?: boolean }) {
  const horario = await seguro<HorarioSitio | null>(getHorario, null);
  const filas = horario ? resumenSemana(horario) : [];
  const hayDatos = filas.some((f) => f.horas !== 'Cerrado');

  if (!hayDatos) return <p>{SITE.hours}</p>;

  if (!detallado) {
    return (
      <>
        {filas.map((f) => (
          <p key={f.dias}>
            {f.dias}, {f.horas.toLowerCase()}
          </p>
        ))}
      </>
    );
  }

  return (
    <ul className="grid gap-1.5">
      {filas.map((f) => (
        <li key={f.dias} className="flex flex-wrap justify-between gap-x-4">
          <span className="font-medium">{f.dias}</span>
          <span className="tabular">{f.horas}</span>
        </li>
      ))}
    </ul>
  );
}
