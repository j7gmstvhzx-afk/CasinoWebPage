/**
 * Lo que se ve mientras una pestaña del panel carga.
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * Las nueve pestañas del panel son `force-dynamic`: consultan la base en cada
 * visita, porque enseñan lo que hay AHORA y una caché de un minuto en la
 * pantalla de canjear sería un premio pagado dos veces.
 *
 * Sin este archivo, Next no tiene nada que enseñar mientras espera, así que
 * deja al navegador QUIETO EN LA PESTAÑA ANTERIOR hasta que el servidor
 * termina. Para quien lo usa, el clic no hizo nada: ni cambio de color, ni
 * indicador, ni la pestaña nueva marcada. Y entonces se vuelve a pulsar.
 *
 * Es exactamente lo que reportó el dueño: "navegar entre los tabs es
 * complicado y se tardan en aparecer la información". La documentación de esta
 * versión de Next lo dice con todas las letras: la navegación se queda
 * bloqueada cuando la ruta de destino es dinámica Y no hay `loading.js`.
 *
 * Con este archivo la ruta entra al instante y el contenido llega después. La
 * pestaña se marca al pulsarla, y el armazón —las pestañas y el botón de
 * salir— se queda utilizable mientras tanto.
 *
 * POR QUÉ UN ESQUELETO Y NO "Cargando…"
 * -------------------------------------
 * Un esqueleto con la forma de lo que viene dice cuánto falta y evita que la
 * página dé un salto cuando llega el contenido. Un texto centrado no dice nada
 * y encima se mueve todo cuando se sustituye.
 *
 * `motion-safe:` en el latido: quien pide movimiento reducido ve el mismo
 * esqueleto, quieto. La regla global de `globals.css` ya frena las animaciones,
 * pero decirlo aquí también hace el archivo legible por sí solo.
 */
export default function CargandoPanel() {
  return (
    <div aria-busy="true" aria-live="polite">
      {/* Para lectores de pantalla: el esqueleto es decorativo y no se lee. */}
      <span className="sr-only">Cargando la sección…</span>

      <div aria-hidden="true" className="motion-safe:animate-pulse">
        {/* El título */}
        <div className="h-9 w-64 rounded-lg bg-linea" />
        <div className="mt-3 h-4 w-full max-w-xl rounded bg-linea/70" />

        {/* Los bloques de contenido, con la forma de las tarjetas del panel */}
        <div className="mt-8 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-linea p-5">
              <div className="h-5 w-48 rounded bg-linea" />
              <div className="mt-4 space-y-2.5">
                <div className="h-3.5 w-full rounded bg-linea/70" />
                <div className="h-3.5 w-11/12 rounded bg-linea/70" />
                <div className="h-3.5 w-3/4 rounded bg-linea/70" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
