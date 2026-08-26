'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MUNICIPIOS_ORDENADOS } from '@/lib/municipios';
import { maskPhoneInput } from '@/lib/phone';
import { PROMO } from '@/lib/site';
import { pedirJson, ERROR_GENERICO } from '@/lib/fetch-json';

/**
 * Los formularios de la cuenta, en un solo sitio.
 *
 * Viven aquí y no dentro del pop-up de la tragamonedas porque los usan DOS
 * pantallas: el pop-up y la página /cuenta. Antes solo existían dentro del
 * pop-up, así que crear una cuenta dependía de que el pop-up funcionara — y
 * cuando no funcionaba no había ninguna otra puerta. La cuenta es el dato que
 * esta página existe para capturar; no puede colgar de un modal.
 */

export type DatosRegistro = {
  nombre: string;
  celular: string;
  puebloId: number;
  acepta: boolean;
};

export const estiloCampo =
  'w-full rounded-xl border border-linea bg-superficie px-4 py-3 text-base text-tinta ' +
  'placeholder:text-tenue/60 focus:border-cian focus:outline-none';

export function Campo({
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

const botonPrincipal =
  'w-full rounded-2xl bg-gradient-to-b from-dorado-3 to-dorado-2 px-8 py-4 font-display ' +
  'text-lg font-bold tracking-wide text-tinta shadow-premio transition-transform ' +
  'hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50';

/**
 * Crear la cuenta.
 *
 * Guarda de verdad al pulsar CONTINUAR (POST /api/registrar), sin esperar a que
 * la persona hale la palanca. Quien se registra y cierra la página queda
 * grabado igual, y al volver puede entrar.
 *
 * `ids` existe porque las dos instancias del pop-up (el modal y la máquina de
 * la portada) llegan a estar montadas a la vez: con ids fijos habría dos
 * <label for="nombre"> apuntando al mismo sitio y tocar la etiqueta llevaría
 * el foco al formulario equivocado.
 */
export function FormularioRegistro({
  ids = 'reg',
  onListo,
  alEntrar,
  textoBoton = 'CONTINUAR',
}: {
  ids?: string;
  onListo: (datos: DatosRegistro & { nombreCorto: string }) => void;
  alEntrar?: () => void;
  textoBoton?: string;
}) {
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [pueblo, setPueblo] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [trampa, setTrampa] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (nombre.trim().split(/\s+/).length < 2) return setError('Escribe tu nombre y apellido.');
    if (!pueblo) return setError('Selecciona tu pueblo.');
    if (!acepta) return setError('Debes aceptar los términos para participar.');

    setEnviando(true);
    try {
      const d = (await pedirJson('/api/registrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          celular,
          puebloId: Number(pueblo),
          acepta,
          website: trampa,
        }),
      })) as { nombre?: string };

      onListo({
        nombre: nombre.trim(),
        celular,
        puebloId: Number(pueblo),
        acepta,
        nombreCorto: d.nombre ?? nombre.trim().split(/\s+/)[0],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : ERROR_GENERICO);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo etiqueta="Nombre completo" htmlFor={`${ids}-nombre`}>
        <input
          id={`${ids}-nombre`}
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
        <Campo etiqueta="Celular" htmlFor={`${ids}-celular`}>
          <input
            id={`${ids}-celular`}
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

        <Campo etiqueta="Pueblo" htmlFor={`${ids}-pueblo`}>
          <select
            id={`${ids}-pueblo`}
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
        <label htmlFor={`${ids}-website`}>No llenar</label>
        <input
          id={`${ids}-website`}
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

      {error && (
        <p role="alert" className="text-sm text-pierde">
          {error}
        </p>
      )}

      <button type="submit" disabled={enviando} className={botonPrincipal}>
        {enviando ? 'GUARDANDO…' : textoBoton}
      </button>

      <p className="text-center text-xs text-tenue">
        Solo mayores de {PROMO.minAge} años · Una tirada por persona al día
      </p>

      {alEntrar && (
        <button
          type="button"
          onClick={alEntrar}
          className="w-full py-2.5 text-center text-sm text-cian underline underline-offset-4"
        >
          ¿Ya te registraste? Entra aquí
        </button>
      )}
    </form>
  );
}

/**
 * Entrar a una cuenta que ya existe.
 *
 * Pide celular Y nombre: con el número solo, cualquiera podría probar números
 * ajenos hasta dar con uno que ganó y quedarse con el código del cupón.
 */
export function FormularioEntrar({
  ids = 'entrar',
  onListo,
  alRegistrarse,
}: {
  ids?: string;
  onListo: () => void;
  alRegistrarse?: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await pedirJson('/api/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ celular, nombre: nombre.trim() }),
      });
      onListo();
    } catch (err) {
      setError(err instanceof Error ? err.message : ERROR_GENERICO);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo etiqueta="Celular" htmlFor={`${ids}-celular`}>
        <input
          id={`${ids}-celular`}
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

      <Campo etiqueta="Nombre completo" htmlFor={`${ids}-nombre`}>
        <input
          id={`${ids}-nombre`}
          name="name"
          autoComplete="name"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. María Rivera Colón"
          className={estiloCampo}
        />
      </Campo>

      {error && (
        <p role="alert" className="text-sm text-pierde">
          {error}
        </p>
      )}

      <button type="submit" disabled={enviando} className={botonPrincipal}>
        {enviando ? 'ENTRANDO…' : 'ENTRAR'}
      </button>

      {alRegistrarse && (
        <button
          type="button"
          onClick={alRegistrarse}
          className="w-full text-center text-sm text-tenue underline underline-offset-4 hover:text-tinta"
        >
          Todavía no me he registrado
        </button>
      )}
    </form>
  );
}
