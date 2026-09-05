/**
 * Engancha el resolvedor de al lado. Se carga con `node --import`.
 *
 *     node --import ./scripts/lib/registrar-ts.mjs scripts/mi-prueba.mjs
 */
import { register } from 'node:module';

register('./resolver-ts.mjs', import.meta.url);
