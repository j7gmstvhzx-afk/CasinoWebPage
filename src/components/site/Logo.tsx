/**
 * Marca del casino.
 *
 * Reconstrucción del logo real: ficha azul con seis muescas, mandala de pétalos
 * y una PICA en el centro, y el texto en tres líneas (CASINO / ATLÁNTICO /
 * MANATÍ).
 *
 * PARA SUSTITUIRLO POR EL ARCHIVO ORIGINAL: pon el logo en `public/logo.svg`
 * (o .png) y cambia `ChipMark` por una <img src="/logo.svg" />. El texto de
 * abajo se borra, porque el archivo original ya lo trae. Es un cambio de dos
 * líneas — todo lo demás del sitio ya usa este componente.
 */

/** Azul del logo. Vive aquí y no en los tokens porque es el color del archivo original. */
const AZUL = '#4F82B8';

export function ChipMark({ className = 'h-11 w-11' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="presentation" aria-hidden="true">
      {/* Aro exterior con las seis muescas */}
      <circle cx="50" cy="50" r="47" fill={AZUL} />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <rect
          key={deg}
          x="42"
          y="1"
          width="16"
          height="17"
          rx="1"
          fill="#F2F4F6"
          transform={`rotate(${deg} 50 50)`}
        />
      ))}

      {/* Disco interior */}
      <circle cx="50" cy="50" r="35" fill="#F2F4F6" />
      <circle cx="50" cy="50" r="31.5" fill="none" stroke={AZUL} strokeWidth="2.5" />

      {/* Mandala: ocho pétalos con voluta, como el original */}
      <g fill="none" stroke={AZUL} strokeWidth="1.9" strokeLinecap="round">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <g key={deg} transform={`rotate(${deg} 50 50)`}>
            {/* Pétalo */}
            <path d="M50 27.5 C43.5 18.5 46 10.5 50 7.5 C54 10.5 56.5 18.5 50 27.5 Z" />
            {/* Voluta interior del pétalo */}
            <path d="M50 22 C47.5 18 48.5 14.5 50.4 13.6 C52 14.8 51.6 17.6 49.7 17.8 C48.7 17.9 48.4 17 48.9 16.4" />
          </g>
        ))}
      </g>

      {/* Pica central */}
      <path
        d="M50 33 C50 33 39 43 39 50.5 C39 54.6 42 57.2 45.2 57.2 C47 57.2 48.4 56.4 49.2 55.2
           C48.9 59.4 47.6 62.6 45.6 64.8 L54.4 64.8 C52.4 62.6 51.1 59.4 50.8 55.2
           C51.6 56.4 53 57.2 54.8 57.2 C58 57.2 61 54.6 61 50.5 C61 43 50 33 50 33 Z"
        fill={AZUL}
      />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <ChipMark className={compact ? 'h-10 w-10' : 'h-12 w-12 sm:h-14 sm:w-14'} />

      {/* Tres líneas, como el logo original. Sobre fondo oscuro, el negro del
          archivo pasa a crema y el azul se aclara para que se lea. */}
      <span className="leading-[0.95]">
        <span
          className={`block font-display font-semibold tracking-tight text-crema ${
            compact ? 'text-lg' : 'text-xl sm:text-2xl'
          }`}
        >
          CASINO
        </span>
        <span
          className={`block font-display font-semibold tracking-tight text-[#7FB0DC] ${
            compact ? 'text-lg' : 'text-xl sm:text-2xl'
          }`}
        >
          ATLÁNTICO
        </span>
        <span
          className={`block font-display tracking-[0.5em] text-tenue ${
            compact ? 'text-[8px]' : 'text-[9px] sm:text-[10px]'
          }`}
        >
          MANATÍ
        </span>
      </span>
    </span>
  );
}
