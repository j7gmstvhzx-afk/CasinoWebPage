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
      {/* Halo de fondo. El sitio actual usa una foto desenfocada en cada
          cabecera; esto da el mismo aire sin cargar una imagen grande en cada
          página, que es lo que hoy hace lenta la navegación en celular. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(38rem 22rem at 12% 0%, rgb(43 169 224 / .28), transparent 65%),' +
            'radial-gradient(30rem 20rem at 85% 20%, rgb(27 79 156 / .45), transparent 60%)',
        }}
      />
      <div className="contenedor relative py-14 sm:py-20">
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
