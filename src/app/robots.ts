import type { MetadataRoute } from 'next';

/**
 * Qué puede recorrer un buscador, y qué no.
 *
 * NO HABÍA NINGUNO, y sin robots.txt la regla por defecto es "todo abierto":
 * Google, Bing y cualquier rastreador entraban también por el panel del
 * personal y por las páginas de cupón.
 *
 * Que /admin esté protegido con contraseña no hace inofensivo que lo indexen:
 * el buscador guarda y enseña la DIRECCIÓN, y una lista pública de las
 * pantallas internas es un mapa para quien quiera probar la puerta. Las páginas
 * de cupón son peores: /premio/CÓDIGO lleva el código en la propia dirección, y
 * un cupón indexado es un premio ajeno a la vista de todos.
 *
 * ESTO NO ES UNA MEDIDA DE SEGURIDAD, Y CONVIENE DECIRLO
 * -----------------------------------------------------
 * robots.txt es una petición, no una puerta: un rastreador que no quiera
 * respetarla, no la respeta. Lo que de verdad protege esas rutas es la
 * contraseña del panel y que el cupón no valga sin identificación con foto.
 * Esto quita el descuido, no al adversario.
 *
 * El resto del sitio SÍ se quiere indexar: es la razón por la que existe.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',      // el panel del personal
          '/api/',       // nada que enseñar y todo que no tocar
          '/cuenta',     // la pantalla de una persona, no del público
          '/premio/',    // el cupón lleva el código en la dirección
        ],
      },
    ],
    // Sin `sitemap` a propósito: este sitio no tiene uno todavía, y apuntar a
    // un /sitemap.xml que devuelve 404 es peor que no apuntar a nada.
  };
}
