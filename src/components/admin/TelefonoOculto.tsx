'use client';

import { useState } from 'react';
import { enmascararTelefono } from '@/lib/phone';

/**
 * El celular de un cliente, tapado hasta que alguien decide verlo.
 *
 * EL NÚMERO ENTERO SÍ LLEGA AL NAVEGADOR, y hay que decirlo claro para no
 * vender una protección que no es: esto NO defiende de alguien que ya entró al
 * panel y sabe mirar el código de la página. Defiende de lo que de verdad pasa
 * todos los días, que es mucho más tonto y mucho más frecuente: la pantalla
 * abierta en el salón mientras pasa gente por detrás, la foto que alguien le
 * hace a la pantalla, la captura que se manda por WhatsApp para preguntar algo.
 * Cien celulares completos a la vista son cien celulares publicados sin que
 * nadie robe nada.
 *
 * Para taparlos DE VERDAD haría falta no mandarlos y pedirlos de uno en uno al
 * servidor. Se puede hacer, y cuesta una ruta más y una espera por cada clic.
 * Hoy no compensa; el día que el panel tenga cuentas por empleado y haga falta
 * dejar rastro de quién miró qué número, sí.
 */
export function TelefonoOculto({ telefono }: { telefono: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setVisible((v) => !v)}
      aria-pressed={visible}
      aria-label={visible ? 'Ocultar el celular' : 'Ver el celular completo'}
      title={visible ? 'Ocultar' : 'Ver el celular completo'}
      className="tabular rounded px-1 text-left transition-colors hover:text-cian focus:outline-none focus-visible:ring-2 focus-visible:ring-cian-2"
    >
      {visible ? telefono : enmascararTelefono(telefono)}
    </button>
  );
}
