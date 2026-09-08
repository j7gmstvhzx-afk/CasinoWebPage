'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Monto } from '@/components/site/Monto';
import { formatVoucherCode } from '@/lib/voucher';
import { longDate } from '@/lib/format';
import { hoyEnPR } from '@/lib/hora-pr';
import {
  CUPON_VIVO,
  ETIQUETA_CUPON,
  desdeCuando,
  diaPasado,
  estadoDeCupon,
  plural,
  tituloDePremios,
  type EstadoGuardado,
} from '@/lib/historial-texto';
import { pedirJson } from '@/lib/fetch-json';

/**
 * Lo que la cuenta sabía y no decía.
 *
 * La pantalla contestaba una sola pregunta —"¿participaste hoy?"— y a
 * medianoche olvidaba todo lo demás. Cada tirada y cada premio llevan desde el
 * primer día guardados en la base; lo único que faltaba era enseñárselos a su
 * dueño.
 *
 * SE CARGA APARTE, DESPUÉS DEL RESUMEN
 * ------------------------------------
 * El resumen de arriba contesta lo urgente (si le toca tirada hoy) y no puede
 * esperar por esto. Si el historial tarda o falla, arriba no se entera: aquí
 * abajo sale una línea discreta y ya. Al revés —una sola llamada que traiga
 * todo— un fallo del historial dejaría al cliente sin saber si puede jugar.
 */

type Premio = {
  fecha: string;
  centavos: number;
  code: string;
  estado: EstadoGuardado;
  expiraEn: string;
  canjeadoEn: string | null;
};

type Datos = {
  ok?: boolean;
  registrado?: boolean;
  dias?: number;
  primero?: string | null;
  premios?: Premio[];
  totalCentavos?: number;
};

type Estado =
  | { paso: 'cargando' }
  | { paso: 'listo'; datos: Datos }
  | { paso: 'sin-suerte' };

export function Historial({ yaSaleHoy = false }: { yaSaleHoy?: boolean }) {
  const [estado, setEstado] = useState<Estado>({ paso: 'cargando' });

  useEffect(() => {
    let vivo = true;
    pedirJson('/api/cuenta/historial')
      .then((d) => {
        const datos = d as Datos;
        if (!vivo) return;
        setEstado(
          datos.ok && datos.registrado
            ? { paso: 'listo', datos }
            : { paso: 'sin-suerte' },
        );
      })
      .catch(() => vivo && setEstado({ paso: 'sin-suerte' }));
    return () => {
      vivo = false;
    };
  }, []);

  if (estado.paso === 'cargando') {
    return (
      <div className="tarjeta flex min-h-[9rem] items-center justify-center p-6">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-linea border-t-dorado" />
      </div>
    );
  }

  // Ni pantalla en blanco ni mentira: no se sabe, se dice, y se ofrece la única
  // salida que sirve —volver a mirar—. Lo de arriba sigue funcionando.
  if (estado.paso === 'sin-suerte') {
    return (
      <div className="tarjeta p-6 text-sm text-tenue">
        No se pudo cargar tu historial ahora mismo. Vuelve a entrar en un rato:
        tus tiradas y tus premios están guardados, no se pierde nada.
      </div>
    );
  }

  const { dias = 0, primero = null, premios = [], totalCentavos = 0 } = estado.datos;
  const hoy = hoyEnPR();

  // El premio de hoy ya tiene su propia tarjeta arriba, con el código en
  // grande. Repetirlo aquí pondría dos botones "VER CUPÓN" idénticos en la
  // misma pantalla. Sale de la LISTA, no de las cuentas: los días jugados y el
  // total sí lo incluyen, porque ganarlo cuenta.
  const lista = yaSaleHoy ? premios.filter((p) => p.fecha !== hoy) : premios;

  // Las VECES QUE GANÓ no son las filas de la lista. Un cupón anulado se
  // reemplaza por otro, y entonces el mismo premio aparece dos veces: el
  // anulado, que se enseña para que nadie crea que desapareció, y el bueno.
  // Contar filas diría "has ganado 2 veces" de un solo premio. Se cuentan los
  // que NO están anulados, que es la misma regla con la que la base suma el
  // total.
  const veces = premios.filter((p) => p.estado !== 'void').length;

  return (
    <div className="space-y-5">
      <div className="tarjeta p-6 sm:p-8">
        <h2 className="font-display text-xl font-bold">Tu historial</h2>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-linea bg-superficie px-5 py-4">
            <p className="text-xs uppercase tracking-widest text-tenue">Días que has jugado</p>
            <p className="mt-1 font-display text-3xl font-bold tabular">
              {plural(dias, 'día', 'días')}
            </p>
            <p className="mt-1 text-sm text-tenue">{desdeCuando(dias, primero, hoy)}</p>
          </div>

          <div className="rounded-2xl border border-linea bg-superficie px-5 py-4">
            <p className="text-xs uppercase tracking-widest text-tenue">Lo que has ganado</p>
            <div className="mt-1">
              <Monto centavos={totalCentavos} tam="md" />
            </div>
            <p className="mt-1 text-sm text-tenue">{tituloDePremios(veces)}</p>
          </div>
        </div>
      </div>

      {lista.length > 0 && (
        <div className="tarjeta p-6 sm:p-8">
          <h3 className="font-display text-lg font-bold">Tus premios</h3>
          <ul className="mt-4 space-y-3">
            {lista.map((p) => (
              <FilaPremio key={p.code} premio={p} hoy={hoy} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function FilaPremio({ premio, hoy }: { premio: Premio; hoy: string }) {
  const estado = estadoDeCupon(premio.estado, premio.expiraEn);
  const vivo = CUPON_VIVO[estado];

  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-4 ${
        vivo ? 'border-dorado/40 bg-dorado/10' : 'border-linea bg-superficie'
      }`}
    >
      <div>
        <div className="flex items-baseline gap-2">
          <Monto centavos={premio.centavos} tam="sm" />
          <span className="text-sm text-tenue">Ganaste {diaPasado(premio.fecha, hoy)}</span>
        </div>
        <p className="mt-1 text-xs uppercase tracking-widest text-tenue">
          {ETIQUETA_CUPON[estado]}
          {/* La fecha de vencimiento solo mientras sirva de algo: en un cupón ya
              canjeado o vencido es ruido, y en uno vivo es la única cosa que
              hay que hacer a tiempo. */}
          {vivo && <> · Hasta el {longDate(premio.expiraEn)}</>}
        </p>
      </div>

      {vivo ? (
        <Link
          href={`/premio/${premio.code}`}
          className="rounded-xl border border-dorado/50 px-4 py-2.5 font-display text-sm font-bold"
        >
          VER CUPÓN
        </Link>
      ) : (
        <span className="tabular text-sm text-tenue">{formatVoucherCode(premio.code)}</span>
      )}
    </li>
  );
}
