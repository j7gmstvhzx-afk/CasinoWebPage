'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FormularioRegistro, FormularioEntrar } from '@/components/cuenta/formularios';
import { formatVoucherCode } from '@/lib/voucher';
import { untilLabel } from '@/lib/format';
import { PROMO } from '@/lib/site';
import { pedirJson } from '@/lib/fetch-json';

/**
 * La cuenta del jugador, con su propia dirección.
 *
 * Por qué existe aparte del pop-up de la tragamonedas:
 *
 *  · Crear la cuenta dejaba de ser posible cuando el pop-up fallaba, y el
 *    registro —  nombre, celular, pueblo —  es justo el dato que esta página
 *    existe para capturar.
 *  · El dueño necesita poder responder "¿participó hoy?" sin abrir la base de
 *    datos. Aquí lo dice la propia pantalla del cliente.
 *  · Un enlace se puede mandar por mensaje. Un modal que se abre solo a los
 *    2.2 s, no.
 */

type Estado =
  | { paso: 'cargando' }
  | { paso: 'registro' }
  | { paso: 'entrar' }
  | { paso: 'cuenta'; datos: Cuenta };

type Cuenta = {
  nombre?: string;
  tiroHoy?: boolean;
  resultado?: 'win' | 'lose' | null;
  voucher?: { code: string; expiresAt: string } | null;
  proximaTirada?: string;
};

type Respuesta = Cuenta & { ok?: boolean; registrado?: boolean };

/** Qué enseñar según lo que conteste GET /api/spin. */
function desdeServidor(d: Respuesta): Estado {
  return d.ok && d.registrado ? { paso: 'cuenta', datos: d } : { paso: 'registro' };
}

export function PanelCuenta() {
  const [estado, setEstado] = useState<Estado>({ paso: 'cargando' });

  const leerEstado = useCallback(async () => {
    try {
      setEstado(desdeServidor((await pedirJson('/api/spin')) as Respuesta));
    } catch {
      // Si el estado no se puede leer, lo honesto es enseñar la puerta de
      // entrada: quien ya tiene cuenta entra, y quien no, se registra. Fingir
      // que no tiene cuenta sería mentir, pero bloquear la pantalla es peor.
      setEstado({ paso: 'entrar' });
    }
  }, []);

  // La bandera `vivo` no es ceremonia: si alguien abre /cuenta y navega antes
  // de que conteste el servidor, sin ella se llamaría setState sobre un
  // componente ya desmontado.
  useEffect(() => {
    let vivo = true;
    pedirJson('/api/spin')
      .then((d) => vivo && setEstado(desdeServidor(d as Respuesta)))
      .catch(() => vivo && setEstado({ paso: 'entrar' }));
    return () => {
      vivo = false;
    };
  }, []);

  const salir = useCallback(async () => {
    await pedirJson('/api/entrar', { method: 'DELETE' }).catch(() => null);
    setEstado({ paso: 'registro' });
  }, []);

  if (estado.paso === 'cargando') {
    return (
      <div className="tarjeta flex min-h-[18rem] items-center justify-center p-8">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-linea border-t-dorado" />
      </div>
    );
  }

  if (estado.paso === 'registro') {
    return (
      <div className="tarjeta p-6 sm:p-8">
        <h2 className="font-display text-2xl font-bold">Crea tu cuenta</h2>
        <p className="mt-2 text-sm text-tenue">
          Es lo que te identifica en el sorteo: con ella sabemos que la tirada de
          hoy es tuya, y con ella reclamas el premio si ganas.
        </p>
        <div className="mt-6">
          <FormularioRegistro
            ids="cuenta-reg"
            textoBoton="CREAR MI CUENTA"
            onListo={() => void leerEstado()}
            alEntrar={() => setEstado({ paso: 'entrar' })}
          />
        </div>
      </div>
    );
  }

  if (estado.paso === 'entrar') {
    return (
      <div className="tarjeta p-6 sm:p-8">
        <h2 className="font-display text-2xl font-bold">Entra a tu cuenta</h2>
        <p className="mt-2 text-sm text-tenue">
          Con los mismos datos que usaste al registrarte. Hace falta si cambiaste
          de teléfono o borraste el navegador.
        </p>
        <div className="mt-6">
          <FormularioEntrar
            ids="cuenta-entrar"
            onListo={() => void leerEstado()}
            alRegistrarse={() => setEstado({ paso: 'registro' })}
          />
        </div>
      </div>
    );
  }

  return <Resumen datos={estado.datos} onSalir={salir} />;
}

/* -------------------------------------------------------------------------- */

function Resumen({ datos, onSalir }: { datos: Cuenta; onSalir: () => void }) {
  const gano = datos.tiroHoy && datos.resultado === 'win';

  return (
    <div className="space-y-5">
      <div className="tarjeta p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-tenue">Tu cuenta</p>
            <p className="mt-1 font-display text-3xl font-bold">
              Hola, <span className="text-cian">{datos.nombre ?? 'de nuevo'}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onSalir}
            className="rounded-xl border border-linea px-4 py-2.5 text-sm text-tenue hover:border-tinta hover:text-tinta"
          >
            No soy yo / Salir
          </button>
        </div>

        {/* La respuesta a la pregunta del dueño, en una línea. */}
        <div
          className={`mt-6 rounded-2xl border px-5 py-4 ${
            datos.tiroHoy ? 'border-linea bg-superficie' : 'border-dorado/40 bg-dorado/10'
          }`}
        >
          <p className="font-display text-lg font-bold">
            {datos.tiroHoy ? 'Ya participaste hoy' : 'Todavía no has participado hoy'}
          </p>
          <p className="mt-1 text-sm text-tenue">
            {datos.tiroHoy
              ? gano
                ? '¡Y ganaste! Tu cupón está abajo.'
                : 'Esta no fue una combinación ganadora. Vuelve mañana.'
              : `Te toca una tirada gratis por ${PROMO.prizeLabel}.`}
          </p>
        </div>

        {datos.tiroHoy && datos.proximaTirada && (
          <p className="mt-4 inline-block rounded-full border border-linea px-4 py-2 text-sm">
            Próxima tirada en{' '}
            <span className="font-semibold text-cian tabular">
              {untilLabel(datos.proximaTirada)}
            </span>
          </p>
        )}

        {!datos.tiroHoy && (
          <Link
            href="/"
            className="mt-6 block w-full rounded-2xl bg-gradient-to-b from-dorado-3 to-dorado-2 px-8 py-4 text-center font-display text-lg font-bold tracking-wide text-tinta shadow-premio"
          >
            IR A LA MÁQUINA
          </Link>
        )}
      </div>

      {gano && datos.voucher && (
        <div className="tarjeta border-dorado/40 p-6 text-center sm:p-8">
          <p className="text-xs uppercase tracking-widest text-tenue">Tu cupón de hoy</p>
          <p className="mt-2 font-display text-2xl font-bold tracking-[0.18em] tabular">
            {formatVoucherCode(datos.voucher.code)}
          </p>
          <Link
            href={`/premio/${datos.voucher.code}`}
            className="mt-5 inline-block rounded-2xl border border-dorado/50 px-6 py-3 font-display font-bold"
          >
            VER MI CUPÓN
          </Link>
          <p className="mt-3 text-xs text-tenue">
            Válido por {PROMO.voucherDays} días · Requiere identificación con foto
          </p>
        </div>
      )}
    </div>
  );
}
