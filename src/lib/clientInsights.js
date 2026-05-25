// src/lib/clientInsights.js
//
// Inteligencia del cliente para mostrar en el momento de la venta.
// Funciones PURAS: historial, frecuencia de compra, productos favoritos,
// deuda/crédito, y si "está para comprar" según su patrón.

import { safeRate } from "../helpers.js";

const MS_PER_DAY = 86400000;

// Analiza el historial de un cliente y devuelve insights accionables.
//   { orderCount, totalSpentARS, avgTicketARS, lastPurchaseDate, daysSinceLast,
//     avgDaysBetween, isDue, topProducts:[{product,qty}], tier }
export function getClientInsights(client, sales, products, { now = new Date(), exchangeRate = 1 } = {}) {
  if (!client) return null;
  const clientSales = (sales || [])
    .filter(s => s && !s.isDeleted && s.clientId === client.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (clientSales.length === 0) {
    return {
      orderCount: 0, totalSpentARS: 0, avgTicketARS: 0,
      lastPurchaseDate: null, daysSinceLast: null,
      avgDaysBetween: null, isDue: false,
      topProducts: [], tier: client.tier || "regular",
      isNew: true,
    };
  }

  const productById = new Map((products || []).map(p => [p.id, p]));
  let totalARS = 0;
  const qtyByProduct = {};
  const dates = [];

  clientSales.forEach(s => {
    const rate = safeRate(s.exchangeRate || exchangeRate);
    const cur = s.currency || "ARS";
    totalARS += (cur === "USD" || cur === "USDT") ? (Number(s.total) || 0) * rate : (Number(s.total) || 0);
    dates.push(new Date(s.date).getTime());
    (s.items || []).forEach(it => {
      if (!it.productId) return;
      qtyByProduct[it.productId] = (qtyByProduct[it.productId] || 0) + (Number(it.qty) || 0);
    });
  });

  const lastMs = dates[dates.length - 1];
  const daysSinceLast = Math.floor((now.getTime() - lastMs) / MS_PER_DAY);

  // Frecuencia: promedio de días entre compras
  let avgDaysBetween = null;
  if (dates.length >= 2) {
    const gaps = [];
    for (let i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i - 1]) / MS_PER_DAY);
    avgDaysBetween = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }
  // "Está para comprar" si pasó más que su frecuencia típica (con 20% margen)
  const isDue = avgDaysBetween != null && daysSinceLast > avgDaysBetween * 1.2;

  const topProducts = Object.entries(qtyByProduct)
    .map(([id, qty]) => ({ product: productById.get(id), qty }))
    .filter(x => x.product)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 3);

  return {
    orderCount: clientSales.length,
    totalSpentARS: Math.round(totalARS),
    avgTicketARS: Math.round(totalARS / clientSales.length),
    lastPurchaseDate: new Date(lastMs).toISOString().slice(0, 10),
    daysSinceLast,
    avgDaysBetween,
    isDue,
    topProducts,
    tier: client.tier || "regular",
    isNew: false,
  };
}
