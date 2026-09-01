/**
 * "No pudimos leer esto", que NO es lo mismo que "no hay nada".
 *
 * POR QUÉ HACE FALTA UN COMPONENTE PARA ESTO
 * ------------------------------------------
 * Todas las pantallas del panel piden sus datos a la base y, si la consulta
 * falla o tarda demasiado, recibían una lista vacía de respaldo y la pintaban
 * con su mensaje normal de "todavía no has añadido nada".
 *
 * Para quien lo usa, eso es la frase más cara posible: dice que su trabajo no
 * está. El dueño lo cazó con dos capturas del mismo despliegue —la página
 * pública enseñando una máquina y el panel diciendo "Máquinas (0)"— y lo
 * describió exactamente: "de momento se muestra la información y de momento
 * deja de mostrarla".
 *
 * Una lista vacía es una AFIRMACIÓN sobre lo que hay guardado. Cuando no se
 * pudo leer, no se afirma nada: se dice que no se pudo leer y se ofrece
 * reintentar.
 */
export function FalloDeCarga({ que }: { que: string }) {
  return (
    <div
      role="alert"
      className="mt-6 rounded-2xl border border-dorado/50 bg-dorado/10 p-5 text-sm"
    >
      <p className="font-display font-semibold text-tinta">
        No pudimos cargar {que}
      </p>
      <p className="mt-1.5 text-tenue">
        Esto <strong>no</strong> quiere decir que se haya borrado: quiere decir que
        la base de datos no contestó a tiempo. Recarga la página en unos segundos.
        Si sigue igual, avísanos antes de volver a escribir nada.
      </p>
    </div>
  );
}
