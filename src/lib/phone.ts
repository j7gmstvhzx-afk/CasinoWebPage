/**
 * Normalización de números de teléfono para Puerto Rico.
 *
 * PR usa el plan norteamericano (NANP) con dos códigos de área superpuestos que
 * cubren toda la isla: 787 y 939.
 *
 * Se ACEPTAN números de otros códigos de área, no se rechazan. Un turista, o un
 * residente de Manatí que conserva su número de cuando vivía en Estados Unidos,
 * son clientes reales — y el premio se canja en persona en el casino, así que un
 * número de fuera no es sospechoso por sí solo. Se marcan aparte para revisión
 * en lugar de perder el registro en el formulario.
 */

export const PR_AREA_CODES = new Set(['787', '939']);

export type PhoneParse =
  | { ok: true; e164: string; areaCode: string; isPuertoRico: boolean }
  | { ok: false; reason: PhoneError };

export type PhoneError =
  | 'vacio'
  | 'largo'
  | 'area_invalida'
  | 'prefijo_invalido'
  | 'ficticio';

export const PHONE_ERROR_ES: Record<PhoneError, string> = {
  vacio: 'Escribe tu número de celular.',
  largo: 'El número debe tener 10 dígitos.',
  area_invalida: 'El código de área no es válido.',
  prefijo_invalido: 'Ese número no es válido.',
  ficticio: 'Ese número no es real.',
};

export function normalizePhone(raw: string): PhoneParse {
  const digits = (raw ?? '').replace(/\D+/g, '');
  if (!digits) return { ok: false, reason: 'vacio' };

  // "1" inicial opcional: 17878547373 -> 7878547373
  let national = digits;
  if (national.length === 11 && national.startsWith('1')) national = national.slice(1);
  if (national.length !== 10) return { ok: false, reason: 'largo' };

  const area = national.slice(0, 3);
  const exchange = national.slice(3, 6);
  const line = national.slice(6);

  // NANP: el código de área y el prefijo empiezan en 2-9. Los códigos N11
  // (411, 611, 911...) están reservados para servicios.
  if (!/^[2-9]\d\d$/.test(area) || (area[1] === '1' && area[2] === '1')) {
    return { ok: false, reason: 'area_invalida' };
  }
  if (!/^[2-9]\d\d$/.test(exchange)) {
    return { ok: false, reason: 'prefijo_invalido' };
  }
  // 555-01XX es el rango reservado para ficción.
  if (exchange === '555' && line.startsWith('01')) {
    return { ok: false, reason: 'ficticio' };
  }

  return {
    ok: true,
    e164: `+1${national}`,
    areaCode: area,
    isPuertoRico: PR_AREA_CODES.has(area),
  };
}

/** +17878547373 -> (787) 854-7373 */
export function formatPhone(e164: string): string {
  const d = e164.replace(/\D+/g, '').replace(/^1/, '');
  if (d.length !== 10) return e164;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Máscara progresiva mientras la persona escribe en el formulario. */
export function maskPhoneInput(raw: string): string {
  const d = (raw ?? '').replace(/\D+/g, '').replace(/^1/, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
