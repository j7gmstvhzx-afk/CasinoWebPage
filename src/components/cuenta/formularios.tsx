'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
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
 * Los ids de los campos salen de `useId()`, no de una prop.
 *
 * Antes había una prop `ids` para esto mismo, y el aviso de este comentario
 * decía justo lo que pasaría si dos instancias compartían valor. Pasó: en la
 * portada están montadas a la vez la máquina del héroe y la del modal, y las
 * dos se llamaban `pop-reg`. Ocho ids duplicados. Como `label[for]` resuelve
 * SIEMPRE al primer elemento con ese id, las tres etiquetas del modal
 * apuntaban al formulario invisible de detrás: tocar "Nombre completo" —el
 * gesto normal en un celular— abría el teclado y todo lo tecleado caía en el
 * campo de atrás, mientras el del modal se quedaba vacío. Y de paso los
 * campos del modal se quedaban sin etiqueta programática, con solo el
 * `placeholder` para un lector de pantalla.
 *
 * Una prop que hay que acordarse de variar es una trampa esperando. `useId()`
 * da un valor distinto por instancia sin que nadie tenga que acordarse de
 * nada, y no se puede usar mal.
 */
export function FormularioRegistro({
  onListo,
  alEntrar,
  textoBoton = 'CONTINUAR',
}: {
  onListo: (datos: DatosRegistro & { nombreCorto: string }) => void;
  alEntrar?: () => void;
  textoBoton?: string;
}) {
  const ids = useId();
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [pueblo, setPueblo] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [trampa, setTrampa] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Qué campo señala el error, para poder marcarlo con `aria-invalid` y
  // llevarle el foco. El mensaje solo aparecía debajo del botón: quien usa
  // lector de pantalla lo oía, pero nada le decía CUÁL de los tres campos
  // arreglar, y el foco se quedaba en el botón de enviar.
  const [contrasena, setContrasena] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [campoMalo, setCampoMalo] = useState<'nombre' | 'pueblo' | 'acepta' | 'contrasena' | null>(null);
  const idError = `${ids}-error`;

  function fallar(campo: 'nombre' | 'pueblo' | 'acepta' | 'contrasena', mensaje: string) {
    setCampoMalo(campo);
    setError(mensaje);
    // Tras el repintado, para que el campo ya tenga `aria-invalid` puesto
    // cuando el lector de pantalla lo anuncie.
    setTimeout(() => document.getElementById(`${ids}-${campo}`)?.focus(), 0);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCampoMalo(null);

    if (nombre.trim().split(/\s+/).length < 2)
      return fallar('nombre', 'Escribe tu nombre y apellido.');
    if (!pueblo) return fallar('pueblo', 'Selecciona tu pueblo.');
    if (contrasena.length < 8)
      return fallar('contrasena', 'Tu contraseña debe tener al menos 8 caracteres.');
    if (!acepta) return fallar('acepta', 'Debes aceptar los términos para participar.');

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
          contrasena,
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
          aria-invalid={campoMalo === 'nombre' || undefined}
          aria-describedby={campoMalo === 'nombre' ? idError : undefined}
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
            aria-invalid={campoMalo === 'pueblo' || undefined}
            aria-describedby={campoMalo === 'pueblo' ? idError : undefined}
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

      <Campo etiqueta="Contraseña" htmlFor={`${ids}-contrasena`}>
        <div className="relative">
          <input
            id={`${ids}-contrasena`}
            name="new-password"
            // `new-password` y no `password`: así el gestor de contraseñas del
            // teléfono ofrece GENERAR una, en vez de intentar rellenar la de
            // otro sitio.
            autoComplete="new-password"
            type={verClave ? 'text' : 'password'}
            required
            minLength={8}
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            aria-invalid={campoMalo === 'contrasena' || undefined}
            aria-describedby={campoMalo === 'contrasena' ? idError : `${ids}-pista`}
            placeholder="Al menos 8 caracteres"
            className={`${estiloCampo} pr-20`}
          />
          {/* Poder verla no es un lujo: esto se escribe en un celular, de pie y
              con prisa. Sin verla la gente se equivoca y abandona justo en el
              paso que crea la cuenta. */}
          <button
            type="button"
            onClick={() => setVerClave((v) => !v)}
            className="absolute inset-y-0 right-0 px-4 text-sm font-medium text-cian"
          >
            {verClave ? 'Ocultar' : 'Ver'}
          </button>
        </div>
        <p id={`${ids}-pista`} className="mt-1.5 text-xs text-tenue">
          La vas a necesitar para entrar desde otro celular.
        </p>
      </Campo>

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
          id={`${ids}-acepta`}
          type="checkbox"
          checked={acepta}
          aria-invalid={campoMalo === 'acepta' || undefined}
          aria-describedby={campoMalo === 'acepta' ? idError : undefined}
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
        <p id={idError} role="alert" className="text-sm text-pierde">
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
  onListo,
  alRegistrarse,
}: {
  onListo: () => void;
  alRegistrarse?: () => void;
}) {
  const ids = useId();
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Cuentas de antes de que existieran las contraseñas.
   *
   * No se pide el nombre de entrada a todo el mundo: la inmensa mayoría ya
   * tendrá contraseña y pedirle un dato de más sería fricción sin motivo. Solo
   * cuando el servidor contesta FALTA_NOMBRE aparece el campo, con una
   * explicación de por qué. Es el propio servidor quien sabe qué cuentas son
   * heredadas —  el navegador no puede saberlo sin preguntar, y preguntar sería
   * decirle a cualquiera qué números están registrados.
   */
  const [pideNombre, setPideNombre] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await pedirJson('/api/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          celular,
          contrasena,
          ...(pideNombre ? { nombre: nombre.trim() } : {}),
        }),
      });
      onListo();
    } catch (err) {
      const msg = err instanceof Error ? err.message : ERROR_GENERICO;
      // El servidor responde con este mensaje cuando la cuenta es heredada.
      if (/nombre completo para crear/i.test(msg)) {
        setPideNombre(true);
        setError(msg);
        setTimeout(() => document.getElementById(`${ids}-nombre`)?.focus(), 0);
      } else {
        setError(msg);
      }
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

      <Campo etiqueta="Contraseña" htmlFor={`${ids}-clave`}>
        <div className="relative">
          <input
            id={`${ids}-clave`}
            name="password"
            autoComplete="current-password"
            type={verClave ? 'text' : 'password'}
            required
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            placeholder="Tu contraseña"
            className={`${estiloCampo} pr-20`}
          />
          <button
            type="button"
            onClick={() => setVerClave((v) => !v)}
            className="absolute inset-y-0 right-0 px-4 text-sm font-medium text-cian"
          >
            {verClave ? 'Ocultar' : 'Ver'}
          </button>
        </div>
      </Campo>

      {pideNombre && (
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
          <p className="mt-1.5 text-xs text-tenue">
            Tu cuenta es de antes de que existieran las contraseñas. Escribe tu
            nombre tal como te registraste y la contraseña de arriba queda
            guardada para la próxima vez.
          </p>
        </Campo>
      )}

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
