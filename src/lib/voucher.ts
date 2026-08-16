import { randomBytes } from 'node:crypto';

/**
 * Códigos de voucher.
 *
 * Alfabeto Crockford base32: sin I, L, O ni U. Elimina las confusiones
 * clásicas 0/O y 1/I/L, que importan de verdad cuando un cajero está
 * tecleando el código desde la pantalla rajada de un celular a la 1 de la
 * mañana con el cliente esperando.
 *
 * 9 caracteres de contenido (~45 bits) + 1 dígito verificador = 10.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Lo que la gente teclea -> lo que quiso teclear. */
const CONFUSABLES: Record<string, string> = { O: '0', I: '1', L: '1', U: 'V' };

export function generateVoucherCode(): string {
  const bytes = randomBytes(9);
  let body = '';
  for (let i = 0; i < 9; i++) body += ALPHABET[bytes[i] % 32];
  return body + checkChar(body);
}

/**
 * Dígito verificador con pesos posicionales.
 *
 * Detecta cualquier error de un solo carácter y cualquier transposición de dos
 * caracteres DISTINTOS adyacentes (los pesos difieren exactamente en 1, así que
 * la suma cambia). No detecta intercambiar dos caracteres idénticos, que no
 * cambia nada de todos modos.
 *
 * El valor real: un código mal tecleado se rechaza como malformado en el acto,
 * en vez de irse a buscar a la base de datos y volver con "no existe" — que
 * hace pensar al cajero que el cupón es falso.
 */
function checkChar(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += ALPHABET.indexOf(body[i]) * (i + 2);
  return ALPHABET[sum % 32];
}

/**
 * Acepta "k7m2q-9xb4t", "K7M2Q 9XB4T", "K7MZQ9XB4T" -> canónico, o null.
 */
export function normalizeVoucherCode(input: string): string | null {
  const cleaned = (input ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .split('')
    .map((c) => CONFUSABLES[c] ?? c)
    .join('');

  if (cleaned.length !== 10) return null;
  if (!/^[0-9A-HJKMNP-TV-Z]{10}$/.test(cleaned)) return null;
  if (checkChar(cleaned.slice(0, 9)) !== cleaned[9]) return null;
  return cleaned;
}

/** K7M2Q9XB4T -> K7M2Q-9XB4T */
export const formatVoucherCode = (code: string) =>
  code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
