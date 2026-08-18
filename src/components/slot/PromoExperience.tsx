'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { SlotMachine, type SpinOutcome } from './SlotMachine';
import { VistaPromos, type PromoPopup } from './VistaPromos';
import { MUNICIPIOS_ORDENADOS } from '@/lib/municipios';
import { maskPhoneInput } from '@/lib/phone';
import { formatVoucherCode } from '@/lib/voucher';
import { PROMO } from '@/lib/site';
import { untilLabel } from '@/lib/format';
import { pedirJson, ERROR_GENERICO } from '@/lib/fetch-json';

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
      },
      proximaTirada: d.proximaTirada ?? '',
    };
  }

  return { paso: 'maquina', nombre: d.nombre };
}

export function PromoExperience({ onCerrar }: { onCerrar?: () => void }) {
  const [estado, setEstado] = useState<Estado>({ paso: 'cargando' });
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  // Las promociones del día van DELANTE de todo lo demás. Se guardan aparte del
  // resto del estado para no tener que duplicar cada paso en dos versiones
  // (con promo pendiente y sin ella).
  const [promos, setPromos] = useState<PromoPopup[]>([]);
  const [promosVistas, setPromosVistas] = useState(true);

  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [pueblo, setPueblo] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [trampa, setTrampa] = useState('');

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
      body: JSON.stringify({
        nombre: nombre.trim(),
        celular,
        puebloId: pueblo ? Number(pueblo) : undefined,
        acepta,
        website: trampa,
      }),
    })) as {
      reels: number[];
      result: 'win' | 'lose';
      alreadySpunToday: boolean;
      voucher: { code: string } | null;
    };

    return {
      reels: d.reels,
      result: d.result,
      alreadySpunToday: d.alreadySpunToday,
      voucherCode: d.voucher?.code ?? null,
    };
  }, [nombre, celular, pueblo, acepta, trampa]);

  const entrar = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setErrorForm(null);
      setEnviando(true);
      try {
        await pedirJson('/api/entrar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ celular, nombre: nombre.trim() }),
        });

        // Ya con la cookie puesta, se vuelve a preguntar el estado: puede que
        // esta persona ya haya tirado hoy desde otro teléfono.
        const estadoReal = (await pedirJson('/api/spin')) as EstadoServidor & { ok: boolean };
        setEstado(estadoDesdeServidor(estadoReal));
      } catch (err) {
        setErrorForm(err instanceof Error ? err.message : ERROR_GENERICO);
      } finally {
        setEnviando(false);
      }
    },
    [celular, nombre],
  );

  // Salir hace falta de verdad: en el casino un mismo celular pasa de mano en
  // mano, y sin esto el segundo cliente vería el nombre del primero.
  const salir = useCallback(async () => {
    await pedirJson('/api/entrar', { method: 'DELETE' }).catch(() => null);
    setNombre('');
    setCelular('');
    setPueblo('');
    setAcepta(false);
    setEstado({ paso: 'registro' });
  }, []);

  const registrar = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setErrorForm(null);

      if (nombre.trim().split(/\s+/).length < 2) {
        return setErrorForm('Escribe tu nombre y apellido.');
      }
      if (!pueblo) return setErrorForm('Selecciona tu pueblo.');
      if (!acepta) return setErrorForm('Debes aceptar los términos para participar.');

      // La cuenta se GUARDA aquí, no al tirar. Antes solo se pasaba a la máquina
      // y el registro únicamente quedaba grabado si la persona halaba la palanca;
      // quien cerraba antes no existía después y no podía "Entrar". La tirada
      // sigue siendo aparte: halar la palanca en la máquina.
      setEnviando(true);
      try {
        const d = (await pedirJson('/api/registrar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            nombre: nombre.trim(),
            celular,
            puebloId: pueblo ? Number(pueblo) : undefined,
            acepta,
            website: trampa,
          }),
        })) as { nombre?: string };
        setEstado({ paso: 'maquina', nombre: d.nombre ?? nombre.trim().split(/\s+/)[0] });
      } catch (err) {
        setErrorForm(err instanceof Error ? err.message : ERROR_GENERICO);
      } finally {
        setEnviando(false);
      }
    },
    [nombre, celular, pueblo, acepta, trampa],
  );

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
      <form onSubmit={entrar} className="anim-entrar">
        <div className="text-center">
          <h2 className="font-display text-3xl font-bold">Entra a tu cuenta</h2>
          <p className="mt-2 text-sm text-tenue">
            Con los mismos datos que usaste al registrarte.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <Campo etiqueta="Celular" htmlFor="entrar-celular">
            <input
              id="entrar-celular"
              name="tel"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={celular}
              onChange={(e) => setCelular(maskPhoneInput(e.target.value))}
              placeholder="(787) 000-0000"
              className={`${estiloCampo} tabular`}
            />
          </Campo>

          <Campo etiqueta="Nombre completo" htmlFor="entrar-nombre">
            <input
              id="entrar-nombre"
              name="name"
              autoComplete="name"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. María Rivera Colón"
              className={estiloCampo}
            />
          </Campo>

          {errorForm && (
            <p role="alert" className="text-sm text-pierde">
              {errorForm}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-2xl bg-gradient-to-b from-dorado-3 to-dorado-2 px-8 py-4 font-display text-lg font-bold tracking-wide text-tinta shadow-premio transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          >
            {enviando ? 'ENTRANDO…' : 'ENTRAR'}
          </button>

          <button
            type="button"
            onClick={() => {
              setErrorForm(null);
              setEstado({ paso: 'registro' });
            }}
            className="w-full text-center text-sm text-tenue underline underline-offset-4 hover:text-tinta"
          >
            Todavía no me he registrado
          </button>
        </div>
      </form>
    );
  }

  if (estado.paso === 'registro') {
    return (
      <form onSubmit={registrar} className="anim-entrar">
        <Encabezado />

        <div className="mt-6 space-y-4">
          <Campo etiqueta="Nombre completo" htmlFor="nombre">
            <input
              id="nombre"
              name="name"
              autoComplete="name"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. María Rivera Colón"
              className={estiloCampo}
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Celular" htmlFor="celular">
              <input
                id="celular"
                name="tel"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={celular}
                onChange={(e) => setCelular(maskPhoneInput(e.target.value))}
                placeholder="(787) 000-0000"
                className={`${estiloCampo} tabular`}
              />
            </Campo>

            <Campo etiqueta="Pueblo" htmlFor="pueblo">
              <select
                id="pueblo"
                required
                value={pueblo}
                onChange={(e) => setPueblo(e.target.value)}
                className={estiloCampo}
              >
                <option value="">Selecciona…</option>
                {MUNICIPIOS_ORDENADOS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          {/* Trampa para bots: invisible y fuera del orden de tabulación. Una
              persona nunca la llena; muchos bots llenan todo lo que encuentran. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="website">No llenar</label>
            <input
              id="website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={trampa}
              onChange={(e) => setTrampa(e.target.value)}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-sm text-tenue">
            <input
              type="checkbox"
              checked={acepta}
              onChange={(e) => setAcepta(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-linea bg-superficie accent-dorado"
            />
            <span>
              Acepto recibir promociones y los{' '}
              <Link href="/terminos" target="_blank" className="text-cian underline underline-offset-4">
                términos y condiciones
              </Link>
              .
            </span>
          </label>

          {errorForm && (
            <p role="alert" className="text-sm text-pierde">
              {errorForm}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-2xl bg-gradient-to-b from-dorado-3 to-dorado-2 px-8 py-4 font-display text-lg font-bold tracking-wide text-tinta shadow-premio transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          >
            {enviando ? 'GUARDANDO…' : 'CONTINUAR'}
          </button>

          <p className="text-center text-xs text-tenue">
            Solo mayores de {PROMO.minAge} años · Una tirada por persona al día
          </p>

          <button
            type="button"
            onClick={() => {
              setErrorForm(null);
              setEstado({ paso: 'entrar' });
            }}
            className="w-full text-center text-sm text-cian underline underline-offset-4"
          >
            ¿Ya te registraste? Entra aquí
          </button>
        </div>
      </form>
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
              setEstado({
                paso: 'resultado',
                outcome,
                proximaTirada: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
              })
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

function Campo({
  etiqueta,
  htmlFor,
  children,
}: {
  etiqueta: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-tinta">
        {etiqueta}
      </label>
      {children}
    </div>
  );
}

const estiloCampo =
  'w-full rounded-xl border border-linea bg-superficie px-4 py-3 text-base text-tinta ' +
  'placeholder:text-tenue/60 focus:border-cian focus:outline-none';

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
