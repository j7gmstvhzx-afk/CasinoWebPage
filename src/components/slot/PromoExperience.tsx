'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { SlotMachine, type SpinOutcome } from './SlotMachine';
import { VistaPromos, type PromoPopup } from './VistaPromos';
import { formatVoucherCode } from '@/lib/voucher';
import {
  FormularioRegistro,
  FormularioEntrar,
  type DatosRegistro,
} from '@/components/cuenta/formularios';
import { PROMO } from '@/lib/site';
import { untilLabel } from '@/lib/format';
import { pedirJson } from '@/lib/fetch-json';

/** Las palabras que pidió el dueño para una tirada que no gana. */
const MENSAJE_PIERDE = 'Esta no es una combinación ganadora, intenta mañana nuevamente.';

type Estado =
  | { paso: 'cargando' }
  | { paso: 'registro' }
  | { paso: 'entrar' }
  | { paso: 'maquina'; nombre?: string }
  | { paso: 'resultado'; outcome: SpinOutcome; proximaTirada: string };

type EstadoServidor = {
  registrado: boolean;
  promos?: PromoPopup[];
  nombre?: string;
  tiroHoy?: boolean;
  reels?: number[] | null;
  resultado?: 'win' | 'lose' | null;
  voucher?: { code: string; expiresAt: string } | null;
  proximaTirada?: string;
};

/**
 * Traduce la respuesta de GET /api/spin a lo que hay que enseñar.
 *
 * Vive fuera del componente y se usa en DOS sitios: al abrir, y justo después
 * de entrar con el celular. Antes, entrar saltaba directo a la máquina dando
 * por hecho que el jugador no había tirado — y a quien ya había tirado hoy le
 * salía el botón de GIRAR otra vez. El servidor lo rechazaba igual (la tirada
 * del día es única por jugador), pero enseñar un botón que no va a funcionar es
 * mentirle al cliente.
 */
function estadoDesdeServidor(d: EstadoServidor & { ok?: boolean }): Estado {
  if (!d.ok || !d.registrado) return { paso: 'registro' };

  if (d.tiroHoy && d.reels && d.resultado) {
    return {
      paso: 'resultado',
      outcome: {
        reels: d.reels,
        result: d.resultado,
        alreadySpunToday: true,
        voucherCode: d.voucher?.code ?? null,
        proximaTirada: d.proximaTirada ?? '',
      },
      proximaTirada: d.proximaTirada ?? '',
    };
  }

  return { paso: 'maquina', nombre: d.nombre };
}

export function PromoExperience({ onCerrar }: { onCerrar?: () => void }) {
  const [estado, setEstado] = useState<Estado>({ paso: 'cargando' });

  // Las promociones del día van DELANTE de todo lo demás. Se guardan aparte del
  // resto del estado para no tener que duplicar cada paso en dos versiones
  // (con promo pendiente y sin ella).
  const [promos, setPromos] = useState<PromoPopup[]>([]);
  const [promosVistas, setPromosVistas] = useState(true);

  // Lo que se escribió al registrarse. Se guarda SOLO para el respaldo de
  // `enviarTirada`: si la cookie se pierde entre el registro y la tirada, el
  // servidor puede volver a crear la cuenta con los mismos datos en vez de
  // rebotar a la persona a un formulario que ya llenó.
  const [datos, setDatos] = useState<DatosRegistro | null>(null);

  // Las dos instancias (modal y portada) viven a la vez. Cuando una termina de
  // enseñar las promociones, avisa por este evento para que la otra no las
  // repita: guardar en localStorage no basta, porque la otra ya leyó su estado
  // al montarse y no se entera del cambio.
  useEffect(() => {
    const alVerlas = () => setPromosVistas(true);
    window.addEventListener(EVENTO_PROMOS, alVerlas);
    return () => window.removeEventListener(EVENTO_PROMOS, alVerlas);
  }, []);

  // Al abrir se pregunta el estado sin consumir la tirada del día.
  useEffect(() => {
    let vivo = true;
    pedirJson('/api/spin')
      .then((d) => d as EstadoServidor & { ok: boolean })
      .then((d) => {
        if (!vivo) return;
        const conPromos = d.promos ?? [];
        setPromos(conPromos);
        setPromosVistas(conPromos.length === 0 || yaVioPromosHoy());
        setEstado(estadoDesdeServidor(d));
      })
      .catch(() => vivo && setEstado({ paso: 'registro' }));
    return () => {
      vivo = false;
    };
  }, []);

  const enviarTirada = useCallback(async (): Promise<SpinOutcome> => {
    // pedirJson ya traduce cualquier fallo a un mensaje en español; si la ruta
    // se cae, aquí NUNCA sube el texto que escribe el navegador.
    const d = (await pedirJson('/api/spin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(datos ?? {}),
    })) as {
      reels: number[];
      result: 'win' | 'lose';
      alreadySpunToday: boolean;
      voucher: { code: string } | null;
      proximaTirada: string;
    };

    return {
      reels: d.reels,
      result: d.result,
      alreadySpunToday: d.alreadySpunToday,
      voucherCode: d.voucher?.code ?? null,
      proximaTirada: d.proximaTirada,
    };
  }, [datos]);

  // Ya con la cookie puesta, se vuelve a preguntar el estado: puede que esta
  // persona ya haya tirado hoy desde otro teléfono.
  const trasEntrar = useCallback(async () => {
    const estadoReal = (await pedirJson('/api/spin')) as EstadoServidor & { ok: boolean };
    setEstado(estadoDesdeServidor(estadoReal));
  }, []);

  // Salir hace falta de verdad: en el casino un mismo celular pasa de mano en
  // mano, y sin esto el segundo cliente vería el nombre del primero.
  const salir = useCallback(async () => {
    await pedirJson('/api/entrar', { method: 'DELETE' }).catch(() => null);
    setDatos(null);
    setEstado({ paso: 'registro' });
  }, []);

  if (estado.paso === 'cargando') {
    return (
      <div className="flex min-h-[22rem] items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-linea border-t-dorado" />
      </div>
    );
  }

  // Antes de la máquina, el arte de las promociones del día.
  if (!promosVistas && promos.length > 0) {
    return (
      <VistaPromos
        promos={promos}
        onTerminar={() => {
          marcarPromosVistas();
          setPromosVistas(true);
        }}
      />
    );
  }

  if (estado.paso === 'entrar') {
    return (
      <div className="anim-entrar">
        <div className="text-center">
          <h2 className="font-display text-3xl font-bold">Entra a tu cuenta</h2>
          <p className="mt-2 text-sm text-tenue">
            Con los mismos datos que usaste al registrarte.
          </p>
        </div>
        <div className="mt-6">
          <FormularioEntrar
            ids="pop-entrar"
            onListo={trasEntrar}
            alRegistrarse={() => setEstado({ paso: 'registro' })}
          />
        </div>
      </div>
    );
  }

  if (estado.paso === 'registro') {
    return (
      <div className="anim-entrar">
        <Encabezado />
        <div className="mt-6">
          <FormularioRegistro
            ids="pop-reg"
            onListo={(d) => {
              setDatos(d);
              setEstado({ paso: 'maquina', nombre: d.nombreCorto });
            }}
            alEntrar={() => setEstado({ paso: 'entrar' })}
          />
        </div>
      </div>
    );
  }

  if (estado.paso === 'maquina') {
    return (
      <div className="anim-entrar">
        <Encabezado saludo={estado.nombre} onSalir={salir} />
        <div className="mt-7">
          <SlotMachine
            onSpin={enviarTirada}
            onRevealed={(outcome) =>
              setEstado({ paso: 'resultado', outcome, proximaTirada: outcome.proximaTirada })
            }
          />
        </div>
      </div>
    );
  }

  return <Resultado estado={estado} onCerrar={onCerrar} />;
}

/* -------------------------------------------------------------------------- */

function Resultado({
  estado,
  onCerrar,
}: {
  estado: Extract<Estado, { paso: 'resultado' }>;
  onCerrar?: () => void;
}) {
  const { outcome, proximaTirada } = estado;
  const gano = outcome.result === 'win';

  if (gano && outcome.voucherCode) {
    return (
      <div className="anim-entrar text-center">
        <Confeti />
        <p className="font-display text-sm font-semibold tracking-[0.3em] text-dorado">
          ¡GANASTE!
        </p>
        <p className="mt-3 font-display text-6xl font-bold texto-dorado tabular">
          {PROMO.prizeLabel}
        </p>
        <p className="mt-4 text-tenue">
          Presenta tu cupón en Servicio al Cliente para reclamar tu premio en efectivo.
        </p>

        <div className="mt-6 rounded-2xl border border-dorado/40 bg-fondo p-5">
          <p className="text-xs uppercase tracking-widest text-tenue">Tu código</p>
          <p className="mt-1.5 font-display text-2xl font-bold tracking-[0.18em] text-tinta tabular">
            {formatVoucherCode(outcome.voucherCode)}
          </p>
        </div>

        <Link
          href={`/premio/${outcome.voucherCode}`}
          className="anim-pulso-premio mt-6 block w-full rounded-2xl bg-gradient-to-b from-dorado-3 to-dorado-2 px-8 py-4 font-display text-lg font-bold text-tinta"
        >
          VER MI CUPÓN
        </Link>
        <p className="mt-3 text-xs text-tenue">
          Válido por {PROMO.voucherDays} días · Requiere identificación con foto
        </p>
      </div>
    );
  }

  if (gano) {
    // Ganó pero el cupón ya se había emitido antes (volvió a abrir la página).
    return (
      <div className="anim-entrar text-center">
        <p className="font-display text-3xl font-bold texto-dorado">¡Ya ganaste hoy!</p>
        <p className="mt-3 text-tenue">Busca tu cupón en el enlace que te mostramos al ganar.</p>
        <CerrarBoton onCerrar={onCerrar} />
      </div>
    );
  }

  return (
    <div className="anim-entrar text-center">
      <p className="font-display text-3xl font-bold text-tinta">
        {outcome.alreadySpunToday ? 'Ya tiraste hoy' : '¡Casi!'}
      </p>
      <p className="mt-3 text-tenue">
        {outcome.alreadySpunToday
          ? 'Tu próxima tirada gratis está a la vuelta de la esquina.'
          : MENSAJE_PIERDE}
      </p>

      {proximaTirada && (
        <p className="mt-5 inline-block rounded-full border border-linea px-4 py-2 text-sm text-tinta">
          Próxima tirada en{' '}
          <span className="font-semibold text-cian tabular">{untilLabel(proximaTirada)}</span>
        </p>
      )}

      {/* Perder también tiene que empujar tráfico al casino: se le enseña lo
          que sí hay hoy en vez de dejarlo con las manos vacías. */}
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <Link
          href="/jackpots"
          className="tarjeta px-4 py-3.5 text-sm font-medium transition-colors hover:border-dorado/50"
        >
          Ver jackpots de hoy →
        </Link>
        <Link
          href="/maquinas-nuevas"
          className="tarjeta px-4 py-3.5 text-sm font-medium transition-colors hover:border-cian/50"
        >
          Máquinas nuevas →
        </Link>
      </div>

      <CerrarBoton onCerrar={onCerrar} />
    </div>
  );
}

function CerrarBoton({ onCerrar }: { onCerrar?: () => void }) {
  if (!onCerrar) return null;
  return (
    <button
      type="button"
      onClick={onCerrar}
      className="mt-6 text-sm text-tenue underline underline-offset-4 hover:text-tinta"
    >
      Seguir explorando
    </button>
  );
}

function Encabezado({ saludo, onSalir }: { saludo?: string; onSalir?: () => void }) {
  return (
    <div className="text-center">
      {saludo ? (
        <p className="font-display text-lg text-tinta">
          ¡Hola de nuevo, <span className="text-cian">{saludo}</span>!{' '}
          {onSalir && (
            <button
              type="button"
              onClick={onSalir}
              className="align-middle text-xs font-normal text-tenue underline underline-offset-2 hover:text-tinta"
            >
              (no soy yo)
            </button>
          )}
        </p>
      ) : null}
      <h2 className="mt-1 font-display text-3xl font-bold sm:text-4xl">
        ¡Gira y gana <span className="texto-dorado">{PROMO.prizeLabel}</span>!
      </h2>
      <p className="mt-2 text-sm text-tenue">
        Una tirada gratis hoy, por ser cliente de Casino Atlántico.
      </p>
    </div>
  );
}

/** Confeti sin dependencias: 40 pedacitos con caída y giro. */
function Confeti() {
  const piezas = Array.from({ length: 40 }, (_, i) => ({
    izq: (i * 37) % 100,
    demora: (i % 10) * 0.12,
    dur: 2.4 + ((i * 7) % 12) / 10,
    color: ['#F2B33D', '#2BA9E0', '#FFD479', '#34D399', '#F7F4EE'][i % 5],
  }));

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      {piezas.map((p, i) => (
        <span
          key={i}
          className="absolute top-[-12px] block h-3 w-1.5 rounded-[1px]"
          style={{
            left: `${p.izq}%`,
            backgroundColor: p.color,
            animation: `caer ${p.dur}s linear ${p.demora}s forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes caer {
          to { transform: translateY(105vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Memoria de "ya vio las promociones hoy".
 *
 * Hace falta porque este componente se usa en DOS sitios a la vez: el modal de
 * entrada y la máquina embebida en la portada. Sin esto, al cerrar el modal la
 * persona se topaba con el mismo arte otra vez y tenía que pasarlo de nuevo
 * para poder tirar — justo el tipo de fricción que hace que cierren la página.
 *
 * Se guarda la fecha, no un simple "sí": mañana hay que volver a enseñarlas.
 */
const CLAVE_PROMOS = 'cam:promos-vistas';
const EVENTO_PROMOS = 'cam:promos-vistas';

function yaVioPromosHoy(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_PROMOS) === new Date().toDateString();
  } catch {
    // Modo privado de Safari puede lanzar. Se enseñan otra vez, que es el lado
    // seguro del error: es mejor repetir una promoción que no enseñarla.
    return false;
  }
}

function marcarPromosVistas(): void {
  try {
    window.localStorage.setItem(CLAVE_PROMOS, new Date().toDateString());
  } catch {
    /* sin almacenamiento: se volverán a mostrar */
  }
  window.dispatchEvent(new Event(EVENTO_PROMOS));
}
