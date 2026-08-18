/**
 * Peticiones al propio servidor que nunca revientan con un error en inglés.
 *
 * `res.json()` lanza si el cuerpo no es JSON — y eso pasa de verdad: cuando una
 * ruta se cae, Next devuelve una página de error en HTML, no JSON. El mensaje
 * de esa excepción lo escribe el navegador, en inglés y en jerga: Safari dice
 * "The string did not match the expected pattern." Ese texto llegó a verse en
 * la tragamonedas en producción, encima del botón de girar.
 *
 * Aquí el cuerpo se lee como texto y se intenta parsear. Si no se puede, sale
 * un mensaje escrito por nosotros, en español.
 */

export const ERROR_GENERICO =
  'No pudimos completar la acción. Vuelve a intentarlo en un momento.';

export type RespuestaJson = { ok?: boolean; mensaje?: string; error?: string } & Record<
  string,
  unknown
>;

/** Lanza `Error` con mensaje en español si algo sale mal. Nunca deja pasar el texto del navegador. */
export async function pedirJson(url: string, init?: RequestInit): Promise<RespuestaJson> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    // Sin red: el celular perdió señal, o el visitante está en el estacionamiento.
    throw new Error('No hay conexión. Revisa tu internet y vuelve a intentar.');
  }

  const texto = await res.text().catch(() => '');

  let datos: RespuestaJson | null = null;
  try {
    datos = texto ? (JSON.parse(texto) as RespuestaJson) : null;
  } catch {
    datos = null;
  }

  // El servidor contestó algo que no es JSON: casi siempre la página de error
  // de Next tras una excepción. El detalle técnico va a la consola, no a la cara
  // del cliente.
  if (!datos) {
    console.error('[respuesta no-JSON]', url, res.status, texto.slice(0, 300));
    throw new Error(ERROR_GENERICO);
  }

  if (!res.ok || datos.ok === false) {
    throw new Error(typeof datos.mensaje === 'string' ? datos.mensaje : ERROR_GENERICO);
  }

  return datos;
}
