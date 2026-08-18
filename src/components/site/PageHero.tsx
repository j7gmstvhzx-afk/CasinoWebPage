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
      <div className="contenedor relative py-10 sm:py-14">
        <h1 className="font-display text-4xl font-bold sm:text-6xl">{titulo}</h1>
        {descripcion && (
          <div className="mt-4 max-w-2xl text-base leading-relaxed text-tenue sm:text-lg">
            {descripcion}
          </div>
        )}
        {children}
      </div>
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
