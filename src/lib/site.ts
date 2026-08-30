/**
 * Datos del negocio.
 *
 * OJO CON QUÉ ESTÁ CONFIRMADO Y QUÉ NO. Estos valores salieron de directorios
 * públicos (Discover Puerto Rico, InfoPáginas), no de una fuente del casino, y
 * solo se han ido confirmando de uno en uno:
 *
 *   HORARIO   Confirmado por el dueño: 8:00 a.m. a 12:00 a.m., los siete días.
 *             Coincide con lo que ya había, pero ahora se sabe que es cierto y
 *             no una coincidencia afortunada. El horario que ve el visitante ya
 *             NO sale de aquí: vive en `app.horario` y se edita en
 *             /admin/horario. El `hours` de abajo es solo el respaldo para
 *             cuando la consulta falla (ver HorarioTexto.tsx).
 *
 *   TELÉFONO, DIRECCIÓN, REDES   SIN CONFIRMAR todavía. Salen en el pie de
 *             todas las páginas, en Contacto y en el mapa. Un teléfono
 *             equivocado es un cliente que no llama.
 */
export const SITE = {
  name: 'Casino Atlántico Manatí',
  shortName: 'Casino Atlántico',
  tagline: 'Tu suerte te espera en Manatí',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.casinoatlanticomanati.com',

  phone: '+17878547373',
  phoneDisplay: '(787) 854-7373',

  address: {
    line1: 'Expreso 22, Salida #48, Carr. #2',
    city: 'Manatí',
    state: 'PR',
    zip: '00674',
  },

  hours: 'Lunes a domingo, 8:00 a.m. – 12:00 a.m.',

  // Coordenadas aproximadas; se ajustan con la ubicación exacta del cliente.
  maps: 'https://www.google.com/maps/search/?api=1&query=Casino+Atl%C3%A1ntico+Manat%C3%AD',
  waze: 'https://waze.com/ul?q=Casino%20Atl%C3%A1ntico%20Manat%C3%AD',

  social: {
    facebook: 'https://www.facebook.com/casinoatlanticomanati',
    instagram: 'https://www.instagram.com/casinoatlanticomanati',
  },
} as const;

/** Reglas de la promoción visibles al público. */
export const PROMO = {
  prizeCents: 2500,
  prizeLabel: '$25',
  minAge: 18,
  voucherDays: 7,
} as const;

export const NAV = [
  { href: '/', label: 'Inicio' },
  { href: '/jackpots', label: 'Jackpots' },
  { href: '/maquinas-nuevas', label: 'Máquinas Nuevas' },
  { href: '/eventos', label: 'Eventos' },
  { href: '/galeria', label: 'Galería' },
  // El muro de ganadores. Va en el menú y no escondido dentro de Jackpots: es
  // la prueba social del salón, y en los casinos pequeños de EEUU es una
  // sección de primer nivel en todos los que la tienen.
  { href: '/ganadores', label: 'Ganadores' },
  // "Comida" y no "Menú": la pestaña ya no es la carta de un restaurante —el
  // casino no tiene— sino lo que la casa invita mientras juegas más el menú del
  // fin de semana. Y cabe mejor en una barra de ocho pestañas.
  { href: '/menu', label: 'Comida' },
  { href: '/contacto', label: 'Contacto' },
  // Va en el menú, y no solo dentro del pop-up, porque es la cuenta con la que
  // se participa en el sorteo: tiene que poder crearse y consultarse sin
  // depender de que un modal se abra bien.
  { href: '/cuenta', label: 'Mi cuenta' },
] as const;

export const fullAddress = () =>
  `${SITE.address.line1}, ${SITE.address.city}, ${SITE.address.state} ${SITE.address.zip}`;
