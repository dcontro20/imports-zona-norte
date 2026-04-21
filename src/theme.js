// Dark theme tokens — alineados con Dashboard v3.
// Fuente única de verdad para superficies, texto, bordes y acentos.
export const T = {
  // Surfaces
  bg: "#0F172A",        // Fondo general de la app
  card: "#1E293B",      // Cards, modales, topbar, sidebar
  cardHover: "#253347", // Hover sobre filas/botones sutiles
  input: "#0F172A",     // Fondo de inputs (más oscuro que card para contraste)
  border: "#334155",    // Bordes y separadores
  borderSoft: "#273246",// Bordes muy sutiles (table row divider)

  // Text
  text: "#F8FAFC",      // Texto principal
  textSub: "#CBD5E1",   // Texto secundario
  textMuted: "#94A3B8", // Labels, metadata
  textFaint: "#64748B", // Texto muy tenue

  // Accent
  primary: "#6366f1",   // Indigo (accent histórico)
  primarySoft: "#6366f120",

  // Status (valores brightos sobre fondo oscuro)
  green: "#22C55E", greenBg: "#22C55E18", greenBorder: "#22C55E40",
  red: "#EF4444", redBg: "#EF444418", redBorder: "#EF444440",
  blue: "#3B82F6", blueBg: "#3B82F618", blueBorder: "#3B82F640",
  amber: "#F59E0B", amberBg: "#F59E0B18", amberBorder: "#F59E0B40",
  purple: "#8B5CF6", purpleBg: "#8B5CF618", purpleBorder: "#8B5CF640",
  cyan: "#06B6D4",

  // Shadows
  shadowSm: "0 1px 3px rgba(0,0,0,0.4)",
  shadow: "0 4px 24px rgba(0,0,0,0.5)",
};

// Mapping light → dark para componentes que todavía usan colores viejos.
// Útil si se quiere hacer migración gradual.
export const LEGACY = {
  white: T.card,
  pageBg: T.bg,
  border: T.border,
  textPrimary: T.text,
  textBody: T.textSub,
  textMuted: T.textMuted,
  textFaint: T.textFaint,
  inputBg: T.input,
  secondaryBg: T.border,
};
