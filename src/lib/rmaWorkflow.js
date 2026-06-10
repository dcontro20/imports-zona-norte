// src/lib/rmaWorkflow.js
//
// Workflow simple de RMA (Return Merchandise Authorization) / garantías.
// Tracking estructurado de qué vapes fallan, de qué marcas, y qué solución
// aplicaste.
//
// Estados:
//   reportado    → el cliente avisó que falló
//   en_revision  → estoy diagnosticando
//   resuelto     → se entregó solución (cambio, devolución, descuento)
//   rechazado    → no aplicaba garantía (uso indebido, mojado, etc.)
//
// Soluciones aplicables:
//   cambio_mismo_sabor    | cambio_otro_sabor | reembolso_total
//   reembolso_parcial     | credito_futura    | rechazado
//
// Funciones PURAS para crear/avanzar/cerrar tickets + stats.

const RMA_STATUSES = ["reportado", "en_revision", "resuelto", "rechazado"];

// Crea un ticket nuevo.
export function createRMATicket({
  saleId,
  productId,
  clientId,
  reason,        // "no enciende" | "filtra" | "sabor raro" | etc.
  reportedBy,    // currentUser.name
  costEstimateUSD = 0,
}) {
  return {
    id: `rma-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    saleId,
    productId,
    clientId,
    reason,
    reportedBy,
    reportedAt: new Date().toISOString(),
    status: "reportado",
    statusHistory: [{ status: "reportado", at: new Date().toISOString() }],
    solution: null,
    resolvedAt: null,
    notes: "",
    costEstimateUSD,
  };
}

// Avanza el estado del ticket.
export function advanceRMATicket(ticket, newStatus, { notes, solution } = {}) {
  if (!ticket || !RMA_STATUSES.includes(newStatus)) return ticket;
  const updated = {
    ...ticket,
    status: newStatus,
    statusHistory: [...(ticket.statusHistory || []), { status: newStatus, at: new Date().toISOString() }],
  };
  if (notes !== undefined) updated.notes = notes;
  if (solution !== undefined) updated.solution = solution;
  if (newStatus === "resuelto" || newStatus === "rechazado") {
    updated.resolvedAt = new Date().toISOString();
  }
  return updated;
}

// Estadísticas agregadas de RMA — útil para detectar marcas problemáticas.
// Devuelve {
//   totalTickets, openTickets, resolvedTickets, rejectedTickets,
//   avgResolutionDays, byBrand, byProduct
// }
export function calcRMAStats(tickets, products = []) {
  const productsById = new Map(products.map(p => [p.id, p]));
  const stats = {
    totalTickets: 0,
    openTickets: 0,
    resolvedTickets: 0,
    rejectedTickets: 0,
    byBrand: {},
    byProduct: {},
  };

  const resolutionDays = [];

  (tickets || []).forEach(t => {
    if (!t) return;
    stats.totalTickets += 1;
    if (t.status === "resuelto") stats.resolvedTickets += 1;
    else if (t.status === "rechazado") stats.rejectedTickets += 1;
    else stats.openTickets += 1;

    // Lead de resolución
    if (t.resolvedAt && t.reportedAt) {
      const days = (new Date(t.resolvedAt) - new Date(t.reportedAt)) / 86400000;
      if (Number.isFinite(days)) resolutionDays.push(days);
    }

    // Por marca
    const prod = productsById.get(t.productId);
    if (prod?.brand) {
      const key = prod.brand;
      if (!stats.byBrand[key]) stats.byBrand[key] = { tickets: 0, resolved: 0, rejected: 0 };
      stats.byBrand[key].tickets += 1;
      if (t.status === "resuelto") stats.byBrand[key].resolved += 1;
      if (t.status === "rechazado") stats.byBrand[key].rejected += 1;
    }

    // Por producto
    if (t.productId) {
      if (!stats.byProduct[t.productId]) stats.byProduct[t.productId] = { tickets: 0, product: prod };
      stats.byProduct[t.productId].tickets += 1;
    }
  });

  stats.avgResolutionDays = resolutionDays.length > 0
    ? Math.round(resolutionDays.reduce((s, d) => s + d, 0) / resolutionDays.length)
    : null;

  return stats;
}

export const RMA_STATUS_LABELS = {
  reportado: { label: "Reportado", emoji: "📝", color: "#CB912F" },
  en_revision: { label: "En revisión", emoji: "🔍", color: "#2383E2" },
  resuelto: { label: "Resuelto", emoji: "✅", color: "#0F6B5C" },
  rechazado: { label: "Rechazado", emoji: "❌", color: "#B83232" },
};

export const RMA_SOLUTIONS = [
  { id: "cambio_mismo_sabor", label: "Cambio (mismo sabor)" },
  { id: "cambio_otro_sabor", label: "Cambio (otro sabor)" },
  { id: "reembolso_total", label: "Reembolso total" },
  { id: "reembolso_parcial", label: "Reembolso parcial" },
  { id: "credito_futura", label: "Crédito para próxima compra" },
  { id: "rechazado", label: "Rechazado (uso indebido)" },
];
