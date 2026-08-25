export function PageHero({
  titulo,
  descripcion,
  children,
  patron,
}: {
  titulo: string;
  descripcion?: React.ReactNode;
  children?: React.ReactNode;
  /**
   * Enciende la textura de picas del logo y remata la banda con las muescas de
   * la ficha. Se usa donde la sección de abajo también lleva la textura (los
   * jackpots), para que la cabecera y el tablero se lean como UNA zona
   * diseñada y no como un título pegado encima de una lista.
   */
  patron?: boolean;
}) {
  return (
    <section className="relative overflow-hidden border-b border-linea">
      {/* Un lavado de color de arriba a abajo, sin manchas. En el tema oscuro
          esto eran dos halos radiales; sobre blanco se veían como dos borrones
          y no como profundidad. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgb(43 169 224 / .07), transparent)',
        }}
      />
      {patron && (
        // La máscara la desvanece hacia abajo. Sin ella el tejido se corta en
        // seco contra el borde de la sección y parece un recorte mal pegado, no
        // una textura del papel. Va con prefijo -webkit- porque Safari todavía
        // lo pide.
        <div
          aria-hidden="true"
          className="patron-picas pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            WebkitMaskImage: 'linear-gradient(180deg, #000 0%, transparent 85%)',
            maskImage: 'linear-gradient(180deg, #000 0%, transparent 85%)',
          }}
        />
      )}
      <div className="contenedor relative py-10 sm:py-14">
        <h1 className="font-display text-4xl font-bold sm:text-6xl">{titulo}</h1>
        {descripcion && (
          <div className="mt-4 max-w-2xl text-base leading-relaxed text-tenue sm:text-lg">
            {descripcion}
          </div>
        )}
        {children}
      </div>
      {patron && (
        <div
          aria-hidden="true"
          // 3px y al 45%: a todo lo ancho de la pantalla, la cinta a plena
          // intensidad se leía como cinta de obra y le robaba el ojo al primer
          // premio. Bajada, hace lo suyo — rematar la banda — sin gritar.
          className="cinta-ficha absolute inset-x-0 bottom-0 h-[3px] opacity-45"
        />
      )}
    </section>
  );
}

export function SeccionVacia({ mensaje }: { mensaje: string }) {
  return (
    <div className="tarjeta px-6 py-16 text-center">
      <p className="text-tenue">{mensaje}</p>
    </div>
  );
}
