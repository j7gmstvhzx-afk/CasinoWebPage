export function PageHero({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    // La banda de cabecera es la MISMA en todas las páginas: el lavado de
    // color, el tejido de picas del logo y el remate con las muescas de la
    // ficha. No es opción por página — es la firma del sitio, y algo que
    // aparece en unas secciones sí y en otras no deja de ser identidad y pasa a
    // parecer un descuido.
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
      {/* La máscara desvanece el tejido hacia abajo. Sin ella se corta en seco
          contra el borde de la sección y parece un recorte mal pegado, no una
          textura del papel. Va con prefijo -webkit- porque Safari todavía lo
          pide. */}
      <div
        aria-hidden="true"
        className="patron-picas pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          WebkitMaskImage: 'linear-gradient(180deg, #000 0%, transparent 85%)',
          maskImage: 'linear-gradient(180deg, #000 0%, transparent 85%)',
        }}
      />
      <div className="contenedor relative py-10 sm:py-14">
        <h1 className="font-display text-4xl font-bold sm:text-6xl">{titulo}</h1>
        {descripcion && (
          <div className="mt-4 max-w-2xl text-base leading-relaxed text-tenue sm:text-lg">
            {descripcion}
          </div>
        )}
        {children}
      </div>
      {/* 3px y al 45%: a todo lo ancho de la pantalla, la cinta a plena
          intensidad se leía como cinta de obra y le robaba el ojo al contenido
          de abajo. Bajada, hace lo suyo — rematar la banda — sin gritar. */}
      <div
        aria-hidden="true"
        className="cinta-ficha absolute inset-x-0 bottom-0 h-[3px] opacity-45"
      />
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
