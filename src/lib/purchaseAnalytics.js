// src/lib/purchaseAnalytics.js
//
// Funciones PURAS de análisis de compras: gasto por proveedor, lead times,
// cumplimiento, productos más comprados, evolución de costos, y proyección
// de reposición. Consumidas por la sección Analytics del hub de Compras.

import { safeRate } from "../helpers.js";

const MS_PER_DAY = 86400000;

function activePurchases(purchases) {
  return (purchases || []).filter(p => p && !p.isDeleted);
}

// ============================================================================
// GASTO POR PROVEEDOR
// ============================================================================

// Devuelve gasto agregado por proveedor + serie mensual (últimos N meses).
//   [{ supplierId, name, color, totalARS, totalUSDT, orderCount, verifiedCount,
//      monthly: [{ month, totalARS }] }]
export function spendBySupplier(purchases, supplierProfiles = [], months = 6) {
  const profileByName = {};
  (supplierProfiles || []).forEach(p => { profileByName[(p.name || "").toLowerCase()] = p; });

  const now = new Date();
  const monthKeys = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const map = {};
  activePurchases(purchases).forEach(p => {
    const name = p.supplier || "Sin proveedor";
    const key = name.toLowerCase();
    if (!map[key]) {
      const profile = profileByName[key];
      map[key] = {
        supplierId: profile?.id || key,
        name,
        color: profile?.color || "#1E2B4A",
        totalARS: 0, totalUSDT: 0, orderCount: 0, verifiedCount: 0,
        monthly: monthKeys.map(m => ({ month: m, totalARS: 0 })),
      };
    }
    const entry = map[key];
    entry.totalARS += Number(p.totalCostARS) || 0;
    entry.totalUSDT += Number(p.totalUSDT) || 0;
    entry.orderCount += 1;
    if (p.status === "verificado") entry.verifiedCount += 1;
    const m = (p.date || "").slice(0, 7);
    const slot = entry.monthly.find(x => x.month === m);
    if (slot) slot.totalARS += Number(p.totalCostARS) || 0;
  });

  return Object.values(map).sort((a, b) => b.totalARS - a.totalARS);
}

// ============================================================================
// LEAD TIMES + CUMPLIMIENTO
// ============================================================================

// Lead time real promedio + cumplimiento por proveedor.
//   [{ supplierId, name, color, avgLeadTime, minLead, maxLead, samples,
//      orderCount, verifiedCount, fulfillmentPct }]
export function leadTimeStats(purchases, supplierProfiles = []) {
  const profileByName = {};
  (supplierProfiles || []).forEach(p => { profileByName[(p.name || "").toLowerCase()] = p; });

  const map = {};
  activePurchases(purchases).forEach(p => {
    const name = p.supplier || "Sin proveedor";
    const key = name.toLowerCase();
    if (!map[key]) {
      const profile = profileByName[key];
      map[key] = {
        supplierId: profile?.id || key, name, color: profile?.color || "#1E2B4A",
        leads: [], orderCount: 0, verifiedCount: 0,
      };
    }
    const entry = map[key];
    entry.orderCount += 1;
    if (p.status === "verificado") entry.verifiedCount += 1;
    const hist = p.statusHistory || [];
    const ordered = hist.find(h => h.status === "pedido")?.timestamp || p.date;
    const received = hist.find(h => h.status === "recibido")?.timestamp
      || hist.find(h => h.status === "verificado")?.timestamp;
    if (ordered && received) {
      const days = (new Date(received) - new Date(ordered)) / MS_PER_DAY;
      if (days >= 0 && days < 365) entry.leads.push(days);
    }
  });

  return Object.values(map).map(e => {
    const samples = e.leads.length;
    const avg = samples > 0 ? Math.round(e.leads.reduce((a, b) => a + b, 0) / samples) : null;
    return {
      supplierId: e.supplierId, name: e.name, color: e.color,
      avgLeadTime: avg,
      minLead: samples > 0 ? Math.round(Math.min(...e.leads)) : null,
      maxLead: samples > 0 ? Math.round(Math.max(...e.leads)) : null,
      samples,
      orderCount: e.orderCount,
      verifiedCount: e.verifiedCount,
      fulfillmentPct: e.orderCount > 0 ? Math.round((e.verifiedCount / e.orderCount) * 100) : 0,
    };
  }).sort((a, b) => (a.avgLeadTime ?? 999) - (b.avgLeadTime ?? 999));
}

// ============================================================================
// PRODUCTOS MÁS COMPRADOS
// ============================================================================

// Top productos por unidades compradas (en pedidos no borrados).
//   [{ productId, product, totalQty, totalUSDT, orderCount }]
export function topPurchasedProducts(purchases, products = [], limit = 10) {
  const productById = new Map(products.map(p => [p.id, p]));
  const map = {};
  activePurchases(purchases).forEach(p => {
    (p.items || []).forEach(it => {
      if (!it.productId) return;
      if (!map[it.productId]) map[it.productId] = { productId: it.productId, totalQty: 0, totalUSDT: 0, orderCount: 0 };
      map[it.productId].totalQty += Number(it.qty) || 0;
      map[it.productId].totalUSDT += (Number(it.qty) || 0) * (Number(it.unitCostUSDT) || 0);
      map[it.productId].orderCount += 1;
    });
  });
  return Object.values(map)
    .map(e => ({ ...e, product: productById.get(e.productId) || null }))
    .sort((a, b) => b.totalQty - a.totalQty)
    .slice(0, limit);
}

// ============================================================================
// EVOLUCIÓN DE COSTO POR PRODUCTO
// ============================================================================

// Serie temporal del costo de un producto a partir de pedidos (unitCostUSDT)
// y listas de proveedor (priceUSD). Ordenada por fecha asc.
//   [{ date, costUSDT, source: "purchase"|"list", supplier }]
export function costPriceHistory(productId, purchases = [], supplierLists = []) {
  if (!productId) return [];
  const points = [];
  activePurchases(purchases).forEach(p => {
    (p.items || []).forEach(it => {
      if (it.productId === productId && Number(it.unitCostUSDT) > 0) {
        points.push({ date: p.date, costUSDT: Number(it.unitCostUSDT), source: "purchase", supplier: p.supplier || "" });
      }
    });
  });
  (supplierLists || []).forEach(l => {
    if (l.isDeleted) return;
    (l.items || []).forEach(it => {
      if (it.matchedProductId === productId && Number(it.priceUSD) > 0) {
        points.push({ date: (l.processedAt || "").slice(0, 10), costUSDT: Number(it.priceUSD), source: "list", supplier: l.supplierName || "" });
      }
    });
  });
  return points
    .filter(pt => pt.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Resumen de cambio de costo de un producto: primer vs último, % cambio.
export function costChangeSummary(history) {
  if (!history || history.length < 2) return null;
  const first = history[0];
  const last = history[history.length - 1];
  if (!first.costUSDT || !last.costUSDT) return null;
  const changePct = ((last.costUSDT - first.costUSDT) / first.costUSDT) * 100;
  return {
    firstCost: first.costUSDT,
    lastCost: last.costUSDT,
    firstDate: first.date,
    lastDate: last.date,
    changePct: Math.round(changePct * 10) / 10,
    direction: changePct > 0 ? "up" : changePct < 0 ? "down" : "flat",
    points: history.length,
  };
}

// Productos cuyo costo subió más en el período (alerta de inflación de proveedor).
//   [{ productId, product, changePct, firstCost, lastCost }]
export function topCostIncreases(products, purchases, supplierLists, limit = 8) {
  const result = [];
  (products || []).forEach(p => {
    if (p.isDeleted) return;
    const history = costPriceHistory(p.id, purchases, supplierLists);
    const summary = costChangeSummary(history);
    if (summary && summary.changePct > 0) {
      result.push({ productId: p.id, product: p, ...summary });
    }
  });
  return result.sort((a, b) => b.changePct - a.changePct).slice(0, limit);
}

// ============================================================================
// PROYECCIÓN DE REPOSICIÓN (CALENDARIO)
// ============================================================================

// Para cada producto con velocity > 0, estima la fecha de quiebre de stock.
// Considera pedidos pendientes (suma qty en camino al stock disponible).
//   [{ productId, product, stock, pendingQty, velocity, daysUntilEmpty, emptyDate }]
export function replenishmentForecast(products, statsMap, purchases = [], now = new Date()) {
  // Pendiente por producto
  const pendingByProduct = {};
  activePurchases(purchases).forEach(p => {
    if (p.status === "verificado") return;
    (p.items || []).forEach(it => {
      if (!it.productId) return;
      pendingByProduct[it.productId] = (pendingByProduct[it.productId] || 0) + (Number(it.qty) || 0);
    });
  });

  const nowMs = now.getTime();
  return (products || [])
    .filter(p => !p.isDeleted)
    .map(p => {
      const stat = statsMap[p.id];
      const velocity = stat?.velocity30dPerDay || 0;
      if (velocity <= 0) return null;
      const stock = Number(p.stock) || 0;
      const pendingQty = pendingByProduct[p.id] || 0;
      const daysUntilEmpty = Math.floor(stock / velocity);
      const emptyDate = new Date(nowMs + daysUntilEmpty * MS_PER_DAY);
      return {
        productId: p.id,
        product: p,
        stock,
        pendingQty,
        velocity: Math.round(velocity * 100) / 100,
        daysUntilEmpty,
        emptyDate: emptyDate.toISOString().slice(0, 10),
        covered: pendingQty > 0, // hay pedido en camino
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.daysUntilEmpty - b.daysUntilEmpty);
}

// ============================================================================
// GASTO TOTAL EN EL TIEMPO
// ============================================================================

// Serie mensual del gasto total en compras (últimos N meses).
//   [{ month, totalARS, totalUSDT, orderCount }]
export function spendOverTime(purchases, months = 6, now = new Date()) {
  const monthKeys = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const series = monthKeys.map(m => ({ month: m, totalARS: 0, totalUSDT: 0, orderCount: 0 }));
  activePurchases(purchases).forEach(p => {
    const m = (p.date || "").slice(0, 7);
    const slot = series.find(x => x.month === m);
    if (slot) {
      slot.totalARS += Number(p.totalCostARS) || 0;
      slot.totalUSDT += Number(p.totalUSDT) || 0;
      slot.orderCount += 1;
    }
  });
  return series;
}
