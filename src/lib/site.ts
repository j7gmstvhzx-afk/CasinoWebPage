/**
 * Datos del negocio.
 *
 * PENDIENTE DE CONFIRMAR con el cliente antes de salir en vivo. Estos valores
 * vienen de directorios públicos (Discover Puerto Rico, InfoPáginas), no de una
 * fuente del casino.
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
  { href: '/menu', label: 'Menú' },
  { href: '/contacto', label: 'Contacto' },
  // Va en el menú, y no solo dentro del pop-up, porque es la cuenta con la que
  // se participa en el sorteo: tiene que poder crearse y consultarse sin
  // depender de que un modal se abra bien.
  { href: '/cuenta', label: 'Mi cuenta' },
] as const;

export const fullAddress = () =>
  `${SITE.address.line1}, ${SITE.address.city}, ${SITE.address.state} ${SITE.address.zip}`;
