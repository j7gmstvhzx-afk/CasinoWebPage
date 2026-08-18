import type { Metadata, Viewport } from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import { PromoLauncher } from '@/components/slot/PromoLauncher';
import { SITE, PROMO } from '@/lib/site';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s | ${SITE.name}`,
  },
  description:
    `Jackpots actualizados a diario, máquinas nuevas, promociones y eventos en ` +
    `${SITE.name}. Gira nuestra tragamonedas y gana ${PROMO.prizeLabel}.`,
  openGraph: {
    type: 'website',
    locale: 'es_PR',
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: `Mira los jackpots más altos del día y gira para ganar ${PROMO.prizeLabel}.`,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  // Color de la barra del navegador en celular. Va con el fondo del sitio: si
  // se queda el azul oscuro del tema anterior, en Android sale una franja
  // oscura encima de una página blanca.
  themeColor: '#ffffff',
};

/**
 * Datos estructurados para que Google muestre dirección, teléfono y horario
 * directamente en los resultados. Para un negocio local es de lo que más
 * tráfico real genera y cuesta muy poco.
 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Casino',
  name: SITE.name,
  url: SITE.url,
  telephone: SITE.phoneDisplay,
  address: {
    '@type': 'PostalAddress',
    streetAddress: SITE.address.line1,
    addressLocality: SITE.address.city,
    addressRegion: SITE.address.state,
    postalCode: SITE.address.zip,
    addressCountry: 'PR',
  },
  openingHours: 'Mo-Su 08:00-24:00',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es-PR"
      data-scroll-behavior="smooth"
      className={`${outfit.variable} ${inter.variable}`}
    >
      <body className="flex min-h-dvh flex-col">
        <a
          href="#contenido"
          // z-[60]: por encima incluso del header (z-50). Sin esto, al
          // enfocar este enlace con Tab el header lo tapaba visualmente —
          // seguía funcionando por teclado, pero quien navega por teclado
          // nunca veía dónde estaba el foco.
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-cian focus:px-4 focus:py-2 focus:font-medium focus:text-white"
        >
          Saltar al contenido
        </a>

        <Header />
        <main id="contenido" className="flex-1">
          {children}
        </main>
        <Footer />
        <PromoLauncher />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
