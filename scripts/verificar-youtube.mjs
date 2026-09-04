#!/usr/bin/env node
/**
 * ¿ENTIENDE EL SITIO CUALQUIER ENLACE DE YOUTUBE QUE LE PEGUEN?
 *
 * POR QUÉ EXISTE
 * --------------
 * El campo del video en el panel lo va a llenar una persona que copia y pega.
 * No va a escribir el enlace "canónico": va a pegar lo que le dio el botón
 * Compartir de su teléfono, que trae `?si=` detrás; o el de un Short, que ni
 * siquiera lleva `watch?v=`. Si el sitio solo entiende una de esas formas, el
 * dueño ve "ese enlace no parece de YouTube" con un enlace de YouTube en la
 * mano, y con razón deja de confiar en la pantalla.
 *
 * Y hay una segunda cosa que comprobar, que no es de comodidad sino de
 * seguridad: lo que sale de aquí acaba dentro del `src` de un iframe. Un enlace
 * que no sea de YouTube tiene que devolver `null`, siempre, sin excepciones.
 *
 * CÓMO SE USA
 *
 *     node scripts/verificar-youtube.mjs
 *
 * No toca la base, no levanta el servidor y no necesita nada: es lógica pura.
 * Por eso puede correr en cada build sin costar tiempo.
 */

const { idDeYouTube, urlIncrustada, miniaturaDeYouTube } = await import(
  '../src/lib/youtube.ts'
);

const ID = 'dQw4w9WgXcQ';

/** [lo que se pega, lo que tiene que salir, por qué importa este caso] */
const CASOS = [
  // --- Las formas que de verdad salen al copiar ---------------------------
  [`https://www.youtube.com/watch?v=${ID}`, ID, 'la barra del navegador'],
  [`https://youtu.be/${ID}`, ID, 'el botón Compartir'],
  [`https://youtu.be/${ID}?si=aBcDeFgHiJkLmNoP`, ID, 'Compartir desde el teléfono'],
  [`https://www.youtube.com/shorts/${ID}`, ID, 'un Short'],
  [`https://m.youtube.com/watch?v=${ID}`, ID, 'la web móvil'],
  [`https://music.youtube.com/watch?v=${ID}`, ID, 'la app de música'],
  [`https://www.youtube.com/embed/${ID}`, ID, 'código de incrustar'],
  [`https://www.youtube.com/live/${ID}`, ID, 'una transmisión en vivo'],
  [`https://www.youtube.com/v/${ID}`, ID, 'la forma vieja'],
  [`youtu.be/${ID}`, ID, 'pegado sin https delante'],
  [`  https://youtu.be/${ID}  `, ID, 'con espacios de sobra al copiar'],
  [`https://www.youtube.com/watch?v=${ID}&t=42s`, ID, 'con marca de tiempo'],
  [`https://www.youtube.com/watch?list=PLabc&v=${ID}`, ID, 'dentro de una lista'],
  [ID, ID, 'el identificador pelado, que es lo que guarda la base'],

  // --- Lo que NO puede pasar ---------------------------------------------
  ['', null, 'campo vacío'],
  ['   ', null, 'solo espacios'],
  [null, null, 'nulo'],
  [undefined, null, 'sin definir'],
  ['javascript:alert(1)', null, 'intento de meter código'],
  ['https://youtube.com.malo.example/watch?v=' + ID, null, 'dominio que IMITA a YouTube'],
  ['https://vimeo.com/123456789', null, 'otro sitio de video'],
  ['https://www.youtube.com/watch?v=corto', null, 'identificador de menos de 11'],
  ['https://www.youtube.com/watch?v=' + ID + 'DEMAS', null, 'identificador de más de 11'],
  ['https://www.youtube.com/@casinoatlantico', null, 'un canal, no un video'],
  ['https://www.youtube.com/watch?v=abc$def!ghi', null, 'caracteres que no son del alfabeto'],
  ['no es un enlace', null, 'texto cualquiera'],
];

let fallos = 0;

for (const [entrada, esperado, porque] of CASOS) {
  const dio = idDeYouTube(entrada);
  const bien = dio === esperado;
  if (!bien) fallos++;
  console.log(
    `${bien ? '  ok  ' : 'FALLA '} ${porque}\n` +
      `         pegó: ${JSON.stringify(entrada)}\n` +
      `         esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(dio)}`,
  );
}

// La dirección que se arma no puede llevar a otro sitio ni perder el autoplay:
// si alguna de estas dos cosas se rompe, el video no arranca al tocarlo y el
// dueño solo ve una tarjeta que "no hace nada".
const incrustada = urlIncrustada(ID);
const reglas = [
  [incrustada.startsWith('https://www.youtube-nocookie.com/embed/'), 'va al reproductor sin cookies'],
  [incrustada.includes(`/embed/${ID}?`), 'lleva el identificador correcto'],
  [incrustada.includes('autoplay=1'), 'arranca solo al tocar'],
  [incrustada.includes('playsinline=1'), 'no se pone a pantalla completa en el iPhone'],
  [incrustada.includes('rel=0'), 'no sugiere videos de otros al terminar'],
  [miniaturaDeYouTube(ID) === `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`, 'la miniatura de respaldo'],
];

for (const [ok, que] of reglas) {
  if (!ok) fallos++;
  console.log(`${ok ? '  ok  ' : 'FALLA '} ${que}`);
}

console.log(
  `\n${CASOS.length + reglas.length} comprobaciones, ${fallos} ${fallos === 1 ? 'fallo' : 'fallos'}.`,
);
process.exit(fallos === 0 ? 0 : 1);
