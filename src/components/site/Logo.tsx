/**
 * Marca del casino.
 *
 * MARCADOR DE POSICIÓN. Es una reconstrucción de la ficha azul con el mandala
 * del logo real, hecha para no bloquear el desarrollo. Cuando el cliente
 * entregue el logo en alta resolución, se sustituye el <svg> de `ChipMark` por
 * el archivo real (idealmente SVG) y nada más cambia: la tipografía y el
 * espaciado del texto ya están calcados del sitio actual.
 */

export function ChipMark({ className = 'h-11 w-11' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="presentation" aria-hidden="true">
      <defs>
        <linearGradient id="chip-azul" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2BA9E0" />
          <stop offset="100%" stopColor="#1B4F9C" />
        </linearGradient>
      </defs>

      {/* Cuerpo de la ficha */}
      <circle cx="32" cy="32" r="30" fill="url(#chip-azul)" />
      <circle cx="32" cy="32" r="30" fill="none" stroke="#0A2547" strokeWidth="1.5" />

      {/* Los seis bloques del borde */}
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <rect
          key={deg}
          x="29"
          y="1.5"
          width="6"
          height="11"
          rx="1.5"
          fill="#F7F4EE"
          transform={`rotate(${deg} 32 32)`}
        />
      ))}

      <circle cx="32" cy="32" r="21" fill="#F7F4EE" />
      <circle cx="32" cy="32" r="21" fill="none" stroke="#1B4F9C" strokeWidth="1.2" />

      {/* Mandala */}
      <g fill="none" stroke="#1B4F9C" strokeWidth="1.6">
        {[0, 45, 90, 135].map((deg) => (
          <ellipse key={deg} cx="32" cy="32" rx="15" ry="6" transform={`rotate(${deg} 32 32)`} />
        ))}
      </g>
      <circle cx="32" cy="32" r="5" fill="#1B4F9C" />
      <circle cx="32" cy="32" r="2" fill="#F7F4EE" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <ChipMark className={compact ? 'h-9 w-9' : 'h-11 w-11 sm:h-12 sm:w-12'} />
      <span className="leading-none">
        <span
          className={`block font-display font-semibold tracking-tight ${
            compact ? 'text-lg' : 'text-xl sm:text-2xl'
          }`}
        >
          CASINO <span className="text-cian">ATLÁNTICO</span>
        </span>
        <span
          className={`block font-display tracking-[0.42em] text-tenue ${
            compact ? 'text-[9px]' : 'text-[10px] sm:text-xs'
          }`}
        >
          MANATÍ
        </span>
      </span>
    </span>
  );
}
