// src/components/purchases/purchaseHelpers.js
//
// Funciones PURAS de soporte para la vista de Compras.
// Calculan timeline, expected delivery, ROI proyectado, etc.
// Se reutilizan en PurchaseCard, KanbanBoard, ListView.

import { findProfileByName } from "../../lib/supplierProfiles.js";

export const PURCHASE_STATUSES = [
  { value: "pedido",      label: "Pedido",     emoji: "📋", color: "#5B3592" },
  { value: "en_camino",   label: "En camino",  emoji: "🚚", color: "#CB912F" },
  { value: "recibido",    label: "Recibido",   emoji: "📦", color: "#2383E2" },
  { value: "verificado",  label: "Verificado", emoji: "✅", color: "#0F6B5C" },
];

// Días que un pedido puede estar en un estado antes de alertar atraso.
// Si supera el límite, se muestra alerta amber/red.
export const STATUS_DELAY_DAYS = {
  pedido: 5,        // 5d para que cambie a "en camino" — más es preocupante
  en_camino: 21,    // 21d viajando
  recibido: 7,      // 7d sin verificar es mucho
};

// Returns the profile object for a given purchase (by matching supplier name).
// Si no encuentra perfil, devuelve null. Caller debería tener un fallback
// con color genérico.
export function resolvePurchaseProfile(purchase, supplierProfiles) {
  if (!purchase || !purchase.supplier) return null;
  return findProfileByName(supplierProfiles, purchase.supplier);
}

// Calcula la "fecha esperada de entrega" de un pedido basándose en:
//  - statusHistory[pedido].timestamp si existe, sino purchase.date
//  - leadDays del perfil del proveedor (fallback: 30)
//
// Devuelve { date: Date, daysLeft: number, isOverdue: boolean } o null.
export function expectedDelivery(purchase, profile) {
  if (!purchase || purchase.status === "verificado") return null;
  const leadDays = profile?.defaultLeadDays || 30;
  const hist = purchase.statusHistory || [];
  const ordered = hist.find(h => h.status === "pedido")?.timestamp || purchase.date;
  if (!ordered) return null;
  const orderedDate = new Date(ordered);
  if (!Number.isFinite(orderedDate.getTime())) return null;
  const eta = new Date(orderedDate.getTime() + leadDays * 86400000);
  const now = Date.now();
  const daysLeft = Math.ceil((eta.getTime() - now) / 86400000);
  return {
    date: eta,
    daysLeft,
    isOverdue: daysLeft < 0,
  };
}

// Días que el pedido está atascado en el estado actual.
// Si supera el límite (STATUS_DELAY_DAYS), devuelve { days, limit, severity }.
// severity: "warn" (1-2x del límite) | "danger" (>2x del límite)
// Si está dentro del límite o status no tiene límite definido, devuelve null.
export function statusDelayInfo(purchase) {
  if (!purchase || purchase.status === "verificado") return null;
  const limit = STATUS_DELAY_DAYS[purchase.status];
  if (!limit) return null;
  const hist = purchase.statusHistory || [];
  const lastChange = hist.slice().reverse().find(h => h.status === purchase.status);
  const since = lastChange?.timestamp || purchase.date;
  if (!since) return null;
  const days = Math.floor((Date.now() - new Date(since).getTime()) / 86400000);
  if (days <= limit) return null;
  return {
    days,
    limit,
    severity: days > limit * 2 ? "danger" : "warn",
  };
}

// Calcula ROI proyectado de un pedido (sin descontar stock todavía).
//   revenue = Σ (item.qty × product.priceUSD × rate)
//   profit  = revenue − totalCostARS
//   roi%    = profit / totalCostARS × 100
//
// Devuelve null si faltan datos (sin items, sin costs).
export function projectedROI(purchase, products = [], exchangeRate = 1) {
  if (!purchase || !purchase.items || purchase.items.length === 0) return null;
  const cost = Number(purchase.totalCostARS) || 0;
  if (cost === 0) return null;
  let revenueARS = 0;
  purchase.items.forEach(item => {
    const prod = products.find(p => p.id === item.productId);
    if (!prod) return;
    const priceARS = Number(prod.priceARS) || (Number(prod.priceUSD) || 0) * (exchangeRate || 1);
    revenueARS += priceARS * (Number(item.qty) || 0);
  });
  const profit = revenueARS - cost;
  const roiPct = (profit / cost) * 100;
  return {
    revenueARS,
    cost,
    profit,
    roiPct,
    marginPct: revenueARS > 0 ? (profit / revenueARS) * 100 : 0,
  };
}

// Genera un timeline visual de un pedido. Retorna array ordenado de eventos:
//   [{ status, label, timestamp, isCurrent, isFuture, note, user, daysAgo }]
//
// Si statusHistory no tiene un step pero el current status lo implica, se
// reconstruye (ej: si status="recibido", asumimos que pedido y en_camino
// ocurrieron antes — los marcamos como done sin fecha si no están).
export function buildTimeline(purchase) {
  if (!purchase) return [];
  const hist = purchase.statusHistory || [];
  const currentIdx = PURCHASE_STATUSES.findIndex(s => s.value === purchase.status);

  return PURCHASE_STATUSES.map((stage, idx) => {
    const entry = hist.find(h => h.status === stage.value);
    const isPast = idx < currentIdx;
    const isCurrent = idx === currentIdx;
    const isFuture = idx > currentIdx;
    const timestamp = entry?.timestamp || (isPast || isCurrent ? purchase.date : null);
    const daysAgo = timestamp
      ? Math.floor((Date.now() - new Date(timestamp).getTime()) / 86400000)
      : null;
    return {
      status: stage.value,
      label: stage.label,
      emoji: stage.emoji,
      color: stage.color,
      timestamp,
      daysAgo,
      isPast,
      isCurrent,
      isFuture,
      note: entry?.note || "",
      user: entry?.user || "",
    };
  });
}

// Detecta si un pedido vino del Monitor (busca pista en notes).
export function isFromMonitor(purchase) {
  if (!purchase || !purchase.notes) return false;
  return /monitor/i.test(purchase.notes);
}

// Agrupa pedidos por status para vista Kanban.
export function groupByStatus(purchases) {
  const groups = {};
  PURCHASE_STATUSES.forEach(s => { groups[s.value] = []; });
  (purchases || []).forEach(p => {
    if (!p || p.isDeleted) return;
    if (groups[p.status]) groups[p.status].push(p);
    else groups[p.status === "verificado" ? "verificado" : "pedido"].push(p);
  });
  // Ordenar cada grupo por fecha desc (más reciente primero)
  Object.keys(groups).forEach(k => {
    groups[k].sort((a, b) => new Date(b.date) - new Date(a.date));
  });
  return groups;
}

// Para una compra ya guardada, retorna el "siguiente status" para los botones
// de "Avanzar". null si ya está en verificado.
export function getNextStatus(currentStatus) {
  const idx = PURCHASE_STATUSES.findIndex(s => s.value === currentStatus);
  if (idx < 0 || idx >= PURCHASE_STATUSES.length - 1) return null;
  return PURCHASE_STATUSES[idx + 1];
}

// Stats agregadas globales para el header (KPIs).
//   - byStatus: count por cada status
//   - totalPending: count de no-verificados
//   - totalUSDTinTransit: USDT total de pedidos no verificados
//   - overdueCount: count de pedidos con delay severity = "danger"
export function aggregatePurchaseStats(purchases) {
  const byStatus = {};
  PURCHASE_STATUSES.forEach(s => { byStatus[s.value] = 0; });
  let totalPending = 0;
  let totalUSDTinTransit = 0;
  let overdueCount = 0;
  (purchases || []).filter(p => p && !p.isDeleted).forEach(p => {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    if (p.status !== "verificado") {
      totalPending += 1;
      totalUSDTinTransit += Number(p.totalUSDT) || 0;
      const delay = statusDelayInfo(p);
      if (delay?.severity === "danger") overdueCount += 1;
    }
  });
  return { byStatus, totalPending, totalUSDTinTransit, overdueCount };
}
