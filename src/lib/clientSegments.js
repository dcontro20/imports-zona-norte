// src/lib/clientSegments.js
//
// Clasifica clientes en segmentos para personalizar mensajes y priorización.
// El tier MANUAL ("vip", "diamante", "regular") sigue siendo la fuente
// principal, pero esta clasificación AUTOMÁTICA agrega capas de contexto:
//
// Segmentos posibles (un cliente puede tener varios):
//   "vip"           — tier manual vip/diamante
//   "high_ticket"   — ticket promedio > p75 del conjunto
//   "frequent"      — compra cada <=14 días en promedio
//   "occasional"    — compra cada 30-90d
//   "dormant"       — no compra hace >30d (estado, no segmento estable)
//   "new"           — primera compra hace <=30d
//   "fanatic"       — >=60% de sus compras son de la misma marca
//   "explorer"      — historial muy variado (>=5 marcas distintas)
//
// Devuelve { primarySegment, segments: [], favoriteBrand, recency }
// Funciones PURAS.

import { safeRate } from "../helpers.js";

const MS_PER_DAY = 86400000;

function calcClientStats(client, sales, exchangeRate, now) {
  if (!client) return null;
  const clientSales = (sales || [])
    .filter(s => s && !s.isDeleted && s.clientId === client.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (clientSales.length === 0) {
    return { orders: 0, totalARS: 0, avgTicket: 0, daysBetween: null, lastDays: null, brandCounts: {} };
  }

  const rate = safeRate(exchangeRate) || 1;
  let totalARS = 0;
  const dates = [];
  const brandCounts = {};

  clientSales.forEach(s => {
    const sRate = safeRate(s.exchangeRate || rate);
    const cur = s.currency || "ARS";
    const t = Number(s.total) || 0;
    totalARS += (cur === "USD" || cur === "USDT") ? t * sRate : t;
    dates.push(new Date(s.date).getTime());
    (s.items || []).forEach(i => {
      const name = i.name || "";
      // Inferir marca desde el item name (ya guardado en la venta)
      const brand = name.split(" ")[0] || "Otros";
      brandCounts[brand] = (brandCounts[brand] || 0) + (Number(i.qty) || 1);
    });
  });

  const orders = clientSales.length;
  const avgTicket = totalARS / orders;
  const lastDays = Math.floor((now.getTime() - dates[dates.length - 1]) / MS_PER_DAY);
  let daysBetween = null;
  if (orders >= 2) {
    const gaps = [];
    for (let i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i - 1]) / MS_PER_DAY);
    daysBetween = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }
  return { orders, totalARS, avgTicket, daysBetween, lastDays, brandCounts };
}

// Calcula el p75 del avgTicket de todos los clientes con >=2 compras.
// Lo usamos como umbral para "high ticket".
function calcTicketP75(clients, sales, exchangeRate, now) {
  const tickets = (clients || [])
    .filter(c => c && !c.isDeleted)
    .map(c => calcClientStats(c, sales, exchangeRate, now))
    .filter(s => s && s.orders >= 2)
    .map(s => s.avgTicket)
    .sort((a, b) => a - b);
  if (tickets.length === 0) return Infinity;
  const idx = Math.floor(tickets.length * 0.75);
  return tickets[idx] || tickets[tickets.length - 1];
}

// Segmentos para un cliente puntual, dado el contexto de todos los clientes.
export function segmentClient(client, sales, options = {}) {
  const { exchangeRate = 1, now = new Date(), ticketP75 } = options;
  if (!client) return { primarySegment: "unknown", segments: [], favoriteBrand: null, recency: null };

  const stats = calcClientStats(client, sales, exchangeRate, now);
  if (stats.orders === 0) {
    return {
      primarySegment: "new_lead",
      segments: ["new_lead"],
      favoriteBrand: null,
      recency: null,
      stats,
    };
  }

  const segments = [];

  // Tier manual = fuente primaria
  if (client.tier === "vip" || client.tier === "diamante") segments.push("vip");

  // High ticket
  if (ticketP75 && stats.avgTicket >= ticketP75) segments.push("high_ticket");

  // Frequency
  if (stats.daysBetween != null) {
    if (stats.daysBetween <= 14) segments.push("frequent");
    else if (stats.daysBetween <= 90) segments.push("occasional");
  }

  // Recency
  if (stats.lastDays != null && stats.lastDays > 30) segments.push("dormant");

  // New: primera compra reciente
  if (stats.orders === 1 && stats.lastDays != null && stats.lastDays <= 30) segments.push("new");

  // Fanatic vs explorer (por brandCounts)
  const brandEntries = Object.entries(stats.brandCounts || {}).sort((a, b) => b[1] - a[1]);
  const totalUnits = brandEntries.reduce((s, [, n]) => s + n, 0);
  const favoriteBrand = brandEntries[0]?.[0] || null;
  const favoriteShare = totalUnits > 0 && brandEntries[0] ? brandEntries[0][1] / totalUnits : 0;
  if (favoriteShare >= 0.6 && totalUnits >= 3) segments.push("fanatic");
  if (brandEntries.length >= 5) segments.push("explorer");

  const primarySegment = segments[0] || "regular";

  return {
    primarySegment,
    segments,
    favoriteBrand,
    favoriteShare: Math.round(favoriteShare * 100),
    recency: stats.lastDays,
    stats,
  };
}

// Helper: segmenta TODOS los clientes y devuelve mapa cliente.id → segmento.
// Hace 1 cálculo de p75 (eficiente).
export function segmentAllClients(clients, sales, options = {}) {
  const { exchangeRate = 1, now = new Date() } = options;
  const ticketP75 = calcTicketP75(clients, sales, exchangeRate, now);
  const result = {};
  (clients || []).forEach(c => {
    if (!c || c.isDeleted) return;
    result[c.id] = segmentClient(c, sales, { exchangeRate, now, ticketP75 });
  });
  return result;
}

// Pequeño helper para UI: descripción humana del segmento.
export const SEGMENT_LABELS = {
  vip: { label: "VIP", color: "#5B3592", emoji: "💎" },
  high_ticket: { label: "Alto ticket", color: "#0F6B5C", emoji: "💰" },
  frequent: { label: "Frecuente", color: "#2383E2", emoji: "🔁" },
  occasional: { label: "Ocasional", color: "#6B7794", emoji: "🌙" },
  dormant: { label: "Dormido", color: "#CB912F", emoji: "😴" },
  new: { label: "Nuevo", color: "#0F7B6C", emoji: "🌱" },
  fanatic: { label: "Fanático de marca", color: "#D4691C", emoji: "🎯" },
  explorer: { label: "Probador", color: "#8B5CF6", emoji: "🧪" },
  new_lead: { label: "Sin compras aún", color: "#9AA2B3", emoji: "👋" },
  regular: { label: "Regular", color: "#6B7794", emoji: "👤" },
  unknown: { label: "—", color: "#9AA2B3", emoji: "" },
};
