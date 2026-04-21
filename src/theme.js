// Light theme tokens — estilo Notion/Linear.
// Cálido, generoso en espaciado, apto para lectura al sol desde mobile.
export const T = {
  // Surfaces
  bg: "#FAFAF9",        // Page background (warm off-white, no harsh)
  card: "#FFFFFF",      // Cards, modals, topbar
  cardHover: "#F6F5F2", // Hover sobre filas
  surface2: "#F5F4F0",  // Secciones secundarias, inputs
  input: "#FFFFFF",     // Input bg (white, contrast with surface2)
  border: "#E8E7E3",    // Bordes principales
  borderSoft: "#F0EFEB",// Separadores sutiles

  // Text (Notion-style: warm brown-black, no true black)
  text: "#37352F",      // Texto primario
  textSub: "#555247",   // Texto secundario
  textMuted: "#8C8A82", // Muted (labels, metadata)
  textFaint: "#B1AFA7", // Texto muy tenue

  // Accent
  primary: "#5E6AD2",   // Linear indigo (modern + warm)
  primarySoft: "#EEF0FC",

  // Status — Notion colors, muted pero claros
  green: "#0F7B6C", greenBg: "#DDEDEA", greenBorder: "#B6D4CC",
  red: "#E03E3E", redBg: "#FBE4E4", redBorder: "#F1B8B6",
  blue: "#2383E2", blueBg: "#DDEBF1", blueBorder: "#B1D4E8",
  amber: "#CB912F", amberBg: "#FDECC8", amberBorder: "#F2D59A",
  purple: "#6940A5", purpleBg: "#EAE4F2", purpleBorder: "#CDB8E2",
  pink: "#E255A1", pinkBg: "#F5E0EE", pinkBorder: "#E8BDDB",

  // Shadows — muy sutiles tipo Notion
  shadowXs: "0 1px 2px rgba(15, 15, 15, 0.04)",
  shadowSm: "0 1px 3px rgba(15, 15, 15, 0.06), 0 1px 2px rgba(15, 15, 15, 0.04)",
  shadow: "0 4px 12px rgba(15, 15, 15, 0.08)",
  shadowLg: "0 12px 32px rgba(15, 15, 15, 0.1)",

  // Radius
  radiusSm: 6, radius: 10, radiusLg: 14, radiusXl: 18,

  // Font
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Rubik', sans-serif",
  fontDisplay: "'Rubik', 'Inter', -apple-system, sans-serif",
};

// Pastel palette para avatares de clientes (12 combinaciones cálidas).
export const AVATAR_PALETTE = [
  { bg: "#FED7AA", fg: "#9A3412" }, // peach
  { bg: "#FBCFE8", fg: "#9F1239" }, // rose
  { bg: "#DDD6FE", fg: "#5B21B6" }, // lavender
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
