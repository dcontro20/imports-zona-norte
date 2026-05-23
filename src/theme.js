// Paleta inspirada en el logo de Imports Zona Norte: navy profundo + cream cálido.
// El navy se usa como primary y para texto. El cream da una atmósfera más cálida
// y profesional que el clásico off-white, manteniendo legibilidad y suavidad.
export const T = {
  // Surfaces
  bg: "#F8F2E7",        // Cream cálido (warm canvas) — inspirado en el bg del logo
  card: "#FFFFFF",      // Cards y modales — white puro para contraste limpio
  cardHover: "#F4ECDB", // Hover sobre filas (cream un poco más oscuro)
  surface2: "#F1E9D6",  // Secciones secundarias / inputs sobre cards
  input: "#FFFFFF",     // Inputs — white puro
  border: "#E5DAC2",    // Bordes principales (beige medio)
  borderSoft: "#EFE5CE",// Separadores sutiles (beige claro)

  // Text — navy del logo. No usar negro puro para mantener calidez.
  text: "#1E2B4A",      // Navy oscuro (texto principal)
  textSub: "#3A4868",   // Navy medio (texto secundario)
  textMuted: "#6B7794", // Gris-azul (labels, metadata)
  textFaint: "#9AA2B3", // Gris claro (placeholders, info muy tenue)

  // Accent — navy como primary
  primary: "#1E2B4A",
  primaryHover: "#2A3A5C",
  primarySoft: "#E8EBF2",  // Navy diluido (badges, pills, bg de hovers)
  primarySofter: "#F1F3F7",// Aún más diluido (alternate row bg)

  // Status — colores ajustados para combinar con navy+cream (cálidos, profundos)
  green: "#0F6B5C", greenBg: "#D9E8E4", greenBorder: "#A8C8BE",
  red: "#B83232", redBg: "#F7DEDE", redBorder: "#E5A8A8",
  blue: "#1F5DB8", blueBg: "#DCE6F4", blueBorder: "#A8BFE2",
  amber: "#B07A1F", amberBg: "#F5E4C2", amberBorder: "#E1C684",  // Gold/cobre cálido
  purple: "#5B3592", purpleBg: "#E4D8F0", purpleBorder: "#C5A8E0",
  pink: "#C73E8F", pinkBg: "#F2D8E8", pinkBorder: "#E0A8C9",

  // Shadows — sutiles, alineadas a tono cream
  shadowXs: "0 1px 2px rgba(30, 43, 74, 0.05)",
  shadowSm: "0 1px 3px rgba(30, 43, 74, 0.07), 0 1px 2px rgba(30, 43, 74, 0.04)",
  shadow: "0 4px 12px rgba(30, 43, 74, 0.09)",
  shadowLg: "0 12px 32px rgba(30, 43, 74, 0.12)",

  // Radius
  radiusSm: 6, radius: 10, radiusLg: 14, radiusXl: 18,

  // Font
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Rubik', sans-serif",
  fontDisplay: "'Rubik', 'Inter', -apple-system, sans-serif",
};

// Pastel palette para avatares de clientes — armonizada con paleta cream+navy.
export const AVATAR_PALETTE = [
  { bg: "#FED7AA", fg: "#9A3412" }, // peach
  { bg: "#FBCFE8", fg: "#9F1239" }, // rose
  { bg: "#C4CCDE", fg: "#1E2B4A" }, // navy soft (alineado al brand)
  { bg: "#BAE6FD", fg: "#075985" }, // sky
  { bg: "#A7F3D0", fg: "#065F46" }, // mint
  { bg: "#FEF08A", fg: "#854D0E" }, // lemon
  { bg: "#FECACA", fg: "#991B1B" }, // coral
  { bg: "#FDE68A", fg: "#92400E" }, // apricot
  { bg: "#E9D5FF", fg: "#6B21A8" }, // lilac
  { bg: "#A5F3FC", fg: "#155E75" }, // seafoam
  { bg: "#FECDD3", fg: "#9F1239" }, // blush
  { bg: "#BBF7D0", fg: "#166534" }, // sage
];

export const pickAvatarColor = (seed) => {
  let h = 0;
  for (const c of String(seed || "?")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
};
