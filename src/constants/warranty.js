// Razones de falla para mermas tipo "Cambio por garantía" + helper isGarantia.

// Razón del fallo para withdrawals tipo garantía. Dropdown estructurado.
// "Daño de envío Paraguay" activa por default el toggle reclamable a proveedor.
export const FAILURE_REASONS = [
  "No enciende",
  "Batería se descarga rápido",
  "Sabor raro / no rinde lo prometido",
  "Pierde líquido",
  "Llegó dañado físico",
  "Daño de envío Paraguay",
  "Otro",
];

// Severidad/color por razón, usado para iconos en el listado.
export const FAILURE_REASON_CATEGORY = {
  "No enciende": "electrico",
  "Batería se descarga rápido": "electrico",
  "Sabor raro / no rinde lo prometido": "liquido",
  "Pierde líquido": "liquido",
  "Llegó dañado físico": "fisico",
  "Daño de envío Paraguay": "envio",
  "Otro": "otro",
};

// Helper: true para "Cambio por garantía" (nuevo) y "Garantía / Devolución" (viejo).
// Usarlo en TODOS los filtros (Reports, Dashboard, Clients, audit).
export function isGarantia(withdrawType) {
  return withdrawType === "Cambio por garantía" || withdrawType === "Garantía / Devolución";
}
