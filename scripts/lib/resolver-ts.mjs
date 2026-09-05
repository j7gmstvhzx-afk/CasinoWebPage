/**
 * Que Node encuentre los archivos que TypeScript sí encuentra.
 *
 * Node 22 sabe LEER TypeScript (`--experimental-strip-types`), pero resuelve
 * las rutas como ESM puro: exige la extensión y no conoce el atajo `@/`. El
 * código del sitio escribe `import { hoyEnPR } from '@/lib/hora-pr'`, que es lo
 * que entiende Next, así que sin este puente ningún guion de prueba puede
 * importar una librería que a su vez importe otra.
 *
 * La alternativa era duplicar la lógica dentro de la prueba, y una prueba que
 * reimplementa lo que prueba se aprueba sola.
 *
 * Solo lo usan los guiones de `scripts/`. La aplicación no pasa por aquí.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../../src/', import.meta.url);

/** Lo que Next prueba al resolver, en el mismo orden. */
const EXTENSIONES = ['.ts', '.tsx', '/index.ts', '/index.tsx', '.mjs', '.js'];

export async function resolve(especificador, contexto, siguiente) {
  const spec = especificador.startsWith('@/')
    ? new URL(especificador.slice(2), SRC).href
    : especificador;

  try {
    return await siguiente(spec, contexto);
  } catch (fallo) {
    if (!spec.startsWith('.') && !spec.startsWith('file:')) throw fallo;
    const base = new URL(spec, contexto.parentURL ?? SRC);
    for (const ext of EXTENSIONES) {
      const candidato = new URL(base.href + ext);
      if (existsSync(fileURLToPath(candidato))) {
        return { url: candidato.href, shortCircuit: true };
      }
    }
    throw fallo;
  }
}
