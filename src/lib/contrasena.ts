import 'server-only';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derivar = promisify(scrypt) as (
  clave: string | Buffer,
  sal: Buffer,
  largo: number,
  opciones: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Contraseñas de los jugadores.
 *
 * POR QUÉ SCRYPT Y NO ARGON2 NI BCRYPT
 * ------------------------------------
 * Argon2 es mejor algoritmo. Pero las dos librerías buenas de Node
 * (`argon2`, `@node-rs/argon2`) son binarios nativos, y esto corre en
 * funciones serverless de Vercel: un binario nativo es una dependencia que
 * puede romper el despliegue en cada actualización de Node, y este sitio lo
 * mantiene una persona que no es programadora. `scrypt` viene DENTRO de Node,
 * está diseñado justo para esto, y es el que recomienda el propio manual de
 * Node para guardar contraseñas.
 *
 * PARÁMETROS
 * ----------
 * N=2^15 es el coste. Tarda ~90ms por comprobación en el hardware de Vercel,
 * que es el punto correcto: suficiente para que probar contraseñas a lo bruto
 * sea inviable, y poco para que entrar no se sienta lento. `maxmem` hay que
 * subirlo a mano — con N=32768 y r=8 hacen falta ~32MB y el valor por defecto
 * de Node es 32MB justos, así que sin esto revienta con "memory limit
 * exceeded" y solo en producción.
 *
 * El coste va GUARDADO en el propio hash. El día que haya que subirlo, las
 * contraseñas viejas siguen comprobándose con su coste original y no hay que
 * migrar nada ni echar a nadie fuera.
 *
 * FORMATO
 * -------
 *   scrypt$N$r$p$sal_base64$hash_base64
 */
const N = 32768;
const R = 8;
const P = 1;
const LARGO = 32;
const MAXMEM = 96 * 1024 * 1024;

/** Lo mínimo que se le exige a una contraseña, en español y sin jerga. */
export const REGLA_CONTRASENA = 'Tu contraseña debe tener al menos 8 caracteres.';

export function contrasenaValida(c: string): boolean {
  // Solo largo. Las reglas de "una mayúscula y un símbolo" empujan a la gente
  // a `Casino1!` y a apuntarla en un papel; el largo es lo que de verdad
  // aguanta, y es lo que recomienda el NIST desde 2017.
  //
  // Se mide DESPUÉS de normalizar, porque es lo que se va a guardar.
  // Midiéndolo antes, `áéíóúñá` escrito en forma descompuesta (NFD) son 14
  // unidades de código y pasaba el mínimo, pero al derivar el hash se
  // normaliza a NFKC y quedan 7 caracteres: un secreto por debajo del mínimo
  // que la propia pantalla anuncia. Comprobado: se aceptaba, y después entraba
  // escribiendo sus 7 caracteres en forma compuesta.
  if (typeof c !== 'string') return false;
  const n = c.normalize('NFKC');
  return n.length >= 8 && n.length <= 200;
}

export async function hashContrasena(clave: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(clave.normalize('NFKC'), sal, LARGO, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * Comprueba una contraseña contra el hash guardado.
 *
 * Devuelve false ante cualquier problema — hash con formato raro, algoritmo
 * desconocido, lo que sea — en vez de lanzar. Una excepción aquí se convierte
 * en un 500 que le dice al atacante que ese usuario existe y tiene algo
 * anómalo guardado.
 */
export async function verificarContrasena(
  clave: string,
  guardado: string | null,
): Promise<boolean> {
  if (!guardado) return false;
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

  const [, n, r, p, salB64, hashB64] = partes;
  const nN = Number(n);
  const nR = Number(r);
  const nP = Number(p);
  // Un N absurdo en la base de datos colgaría el servidor al intentar
  // derivarlo. Se acota a lo que este código podría haber escrito.
  if (!Number.isInteger(nN) || nN < 16384 || nN > 1048576) return false;
  if (!Number.isInteger(nR) || nR < 1 || nR > 32) return false;
  if (!Number.isInteger(nP) || nP < 1 || nP > 16) return false;

  try {
    const esperado = Buffer.from(hashB64, 'base64');
    const calculado = await derivar(clave.normalize('NFKC'), Buffer.from(salB64, 'base64'), esperado.length, {
      N: nN,
      r: nR,
      p: nP,
      maxmem: MAXMEM,
    });
    // timingSafeEqual exige el mismo largo; se comprueba antes porque lanza.
    if (calculado.length !== esperado.length) return false;
    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

/**
 * Trabajo falso, para cuando el celular no existe.
 *
 * Sin esto, "no hay tal cuenta" contesta en 2ms y "contraseña incorrecta" en
 * 90ms: cualquiera puede medir la diferencia y usar el formulario de entrada
 * como un detector de qué números están registrados en el casino. Con esto,
 * las dos respuestas tardan lo mismo.
 */
export async function gastarTiempoIgual(): Promise<void> {
  await derivar('no-existe', randomBytes(16), LARGO, { N, r: R, p: P, maxmem: MAXMEM }).catch(
    () => undefined,
  );
}
