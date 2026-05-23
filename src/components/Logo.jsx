// Logo de Imports Zona Norte — SVG inline.
//
// Replica el diseño del logo oficial: escudo con vape estilizado sobre un
// globo terráqueo (líneas de meridianos y paralelos). Color principal navy.
//
// Es nítido en cualquier tamaño y se puede colorear via CSS.

export function LogoMark({ size = 48, color = "#1E2B4A", bgColor = "#FFFFFF", style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0, ...style }}
      aria-label="Imports Zona Norte"
    >
      {/* Shield outline */}
      <path
        d="M50 5 L88 17 L88 47 C88 70 72 86 50 95 C28 86 12 70 12 47 L12 17 Z"
        stroke={color}
        strokeWidth="4.5"
        strokeLinejoin="round"
        fill={bgColor}
      />

      {/* Globe — círculo principal */}
      <circle cx="50" cy="56" r="22" stroke={color} strokeWidth="2.5" fill="none" />
      {/* Globe — ecuador */}
      <ellipse cx="50" cy="56" rx="22" ry="7" stroke={color} strokeWidth="2" fill="none" />
      {/* Globe — meridiano vertical fino */}
      <ellipse cx="50" cy="56" rx="9" ry="22" stroke={color} strokeWidth="2" fill="none" />

      {/* Vape body (cuerpo principal del dispositivo, vertical) */}
      <rect
        x="42" y="32" width="16" height="42" rx="3"
        fill={bgColor}
        stroke={color}
        strokeWidth="3"
      />
      {/* Vape mouthpiece */}
      <rect
        x="45" y="22" width="10" height="10" rx="2"
        fill={color}
      />
      {/* Vape — detalle de luz/separación */}
      <line x1="42" y1="44" x2="58" y2="44" stroke={color} strokeWidth="2" />

      {/* Smoke wisp encima del mouthpiece */}
      <path
        d="M50 22 C 47 18, 53 14, 50 10 C 48 8, 50 6, 50 4"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

// LogoFull — logo + texto "IMPORTS / ZONA NORTE" en layout horizontal.
// orientation="horizontal" (default) o "stacked"
export function LogoFull({ size = 40, color = "#1E2B4A", bgColor = "#FFFFFF", orientation = "horizontal", style, compact = false }) {
  if (orientation === "stacked") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, ...style }}>
        <LogoMark size={size * 2} color={color} bgColor={bgColor} />
        <div style={{ textAlign: "center", lineHeight: 0.95 }}>
          <div style={{
            fontFamily: "'Rubik', 'Inter', sans-serif",
            fontWeight: 900, fontSize: size * 0.65,
            color, letterSpacing: "0.04em",
          }}>IMPORTS</div>
          <div style={{
            fontFamily: "'Rubik', 'Inter', sans-serif",
            fontWeight: 800, fontSize: size * 0.34,
            color, letterSpacing: "0.18em", marginTop: 2,
          }}>ZONA NORTE</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: compact ? 8 : 12, ...style }}>
      <LogoMark size={size} color={color} bgColor={bgColor} />
      <div style={{ lineHeight: 0.95, minWidth: 0 }}>
        <div style={{
          fontFamily: "'Rubik', 'Inter', sans-serif",
          fontWeight: 900,
          fontSize: compact ? size * 0.50 : size * 0.58,
          color, letterSpacing: "0.02em",
          whiteSpace: "nowrap",
        }}>IMPORTS</div>
        <div style={{
          fontFamily: "'Rubik', 'Inter', sans-serif",
          fontWeight: 700,
          fontSize: compact ? size * 0.28 : size * 0.32,
          color, letterSpacing: "0.14em",
          marginTop: compact ? 1 : 2,
          whiteSpace: "nowrap",
          opacity: 0.85,
        }}>ZONA NORTE</div>
      </div>
    </div>
  );
}
