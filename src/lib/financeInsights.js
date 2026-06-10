// src/lib/financeInsights.js
//
// Tres análisis adicionales para el módulo Análisis Financiero:
//
//   1. Distribución de tickets (mediana vs promedio, histograma)
//   2. Comparador de lotes Paraguay (qué viaje rindió más por USD invertido)
//   3. Estacionalidad mensual (qué meses son fuertes vs flojos)
//
// Funciones PURAS.

import { safeRate } from "../helpers.js";

const MS_PER_DAY = 86400000;

function totalARSOfSale(sale, fallbackRate) {
  const t = Number(sale.total) || 0;
  const cur = sale.currency || "ARS";
  if (cur === "USD" || cur === "USDT") {
    return t * safeRate(sale.exchangeRate || fallbackRate);
  }
  return t;
}

// =====================================================================
// 1. DISTRIBUCIÓN DE TICKETS
// =====================================================================
// Devuelve { count, avg, median, p25, p75, min, max, histogram: [{bucket, count, label}] }
// Muestra que la mediana cuenta más que el promedio (1 ticket grande
// infla el promedio pero no la mediana).
export function ticketDistribution(sales, exchangeRate, options = {}) {
  const { sinceDays = 90 } = options;
  const rate = safeRate(exchangeRate) || 1;
  const now = options.now || new Date();
  const cutoff = now.getTime() - sinceDays * MS_PER_DAY;

  const tickets = (sales || [])
    .filter(s => s && !s.isDeleted && s.date)
    .filter(s => new Date(s.date).getTime() >= cutoff)
    .map(s => totalARSOfSale(s, rate))
    .filter(t => t > 0)
    .sort((a, b) => a - b);

  if (tickets.length === 0) {
    return { count: 0, avg: 0, median: 0, p25: 0, p75: 0, min: 0, max: 0, histogram: [] };
  }

  const sum = tickets.reduce((s, t) => s + t, 0);
  const avg = sum / tickets.length;
  const median = tickets.length % 2 === 0
    ? (tickets[tickets.length / 2 - 1] + tickets[tickets.length / 2]) / 2
    : tickets[Math.floor(tickets.length / 2)];
  const p25 = tickets[Math.floor(tickets.length * 0.25)];
  const p75 = tickets[Math.floor(tickets.length * 0.75)];
  const min = tickets[0];
  const max = tickets[tickets.length - 1];

  // Histograma: 6 buckets en escala logarítmica o equal-width
  const histBuckets = [
    { upper: 10000,  label: "≤ $10k" },
    { upper: 25000,  label: "$10-25k" },
    { upper: 50000,  label: "$25-50k" },
    { upper: 100000, label: "$50-100k" },
    { upper: 200000, label: "$100-200k" },
    { upper: Infinity, label: "> $200k" },
  ];
  const histogram = histBuckets.map(b => ({ bucket: b.upper, label: b.label, count: 0 }));
  tickets.forEach(t => {
    for (let i = 0; i < histBuckets.length; i++) {
      if (t <= histBuckets[i].upper) {
        histogram[i].count += 1;
        break;
      }
    }
  });

  return {
    count: tickets.length,
    avg: Math.round(avg),
    median: Math.round(median),
    p25: Math.round(p25),
    p75: Math.round(p75),
    min: Math.round(min),
    max: Math.round(max),
    histogram,
  };
}

// =====================================================================
// 2. COMPARADOR DE LOTES PARAGUAY
// =====================================================================
// Por cada compra verificada (lote), calcula:
//   - costo total USD invertido
//   - revenue acumulado de los productos de ese lote (ventas posteriores al lote)
//   - margen total y % rendimiento
// Útil para "el viaje del 15/05 rindió 38% vs el del 02/04 que rindió 22%"
export function purchaseBatchPerformance({ purchases = [], sales = [], exchangeRate = 1 } = {}) {
  const rate = safeRate(exchangeRate) || 1;
  const verifiedLotes = (purchases || []).filter(p =>
    p && !p.isDeleted && p.status === "verificado"
  );

  return verifiedLotes
    .map(lote => {
      const loteUnits = (lote.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
      const costUSD = Number(lote.totalUSDT) || 0;
      const costARS = costUSD * rate;
      const loteDate = lote.date ? new Date(lote.date).getTime() : 0;
      const productIds = (lote.items || []).map(i => i.productId).filter(Boolean);

      // Ventas DEL lote = ventas posteriores al lote, de productos del lote
      const loteSales = (sales || []).filter(s => {
        if (!s || s.isDeleted) return false;
        const sMs = new Date(s.date || 0).getTime();
        if (sMs < loteDate) return false;
        return (s.items || []).some(i => productIds.includes(i.productId));
      });

      let revenueARS = 0;
      let unitsSold = 0;
      loteSales.forEach(s => {
        (s.items || []).forEach(i => {
          if (productIds.includes(i.productId)) {
            const qty = Number(i.qty) || 1;
            unitsSold += qty;
            // Aproximación: usar el priceUSD del item × rate de la venta
            const itemPriceUSD = Number(i.priceUSD) || 0;
            const itemRate = safeRate(s.exchangeRate || rate);
            revenueARS += itemPriceUSD * itemRate * qty;
          }
        });
      });

      const profitARS = revenueARS - costARS;
      const roiPct = costARS > 0 ? (profitARS / costARS) * 100 : 0;
      const sellThroughPct = loteUnits > 0 ? (unitsSold / loteUnits) * 100 : 0;

      return {
        loteId: lote.id,
        supplier: lote.supplier || "—",
        loteNumber: lote.loteNumber || "",
        date: lote.date,
        loteUnits,
        unitsSold,
        sellThroughPct: Math.round(sellThroughPct),
        costUSD,
        costARS: Math.round(costARS),
        revenueARS: Math.round(revenueARS),
        profitARS: Math.round(profitARS),
        roiPct: Math.round(roiPct * 10) / 10,
      };
    })
    .sort((a, b) => b.roiPct - a.roiPct);
}

// =====================================================================
// 3. ESTACIONALIDAD MENSUAL
// =====================================================================
// Revenue agrupado por mes y promedio comparativo. Detecta meses fuertes vs flojos.
// Devuelve { months: [{month, year, label, revenue, salesCount, vsAvgPct}], avgMonthly }
export function monthlySeasonality(sales, exchangeRate, options = {}) {
  const { monthsBack = 12 } = options;
  const rate = safeRate(exchangeRate) || 1;
  const now = options.now || new Date();

  const byMonth = {};
  (sales || []).forEach(s => {
    if (!s || s.isDeleted || !s.date) return;
    const ym = s.date.slice(0, 7); // YYYY-MM
    if (!byMonth[ym]) byMonth[ym] = { revenue: 0, count: 0 };
    byMonth[ym].revenue += totalARSOfSale(s, rate);
    byMonth[ym].count += 1;
  });

  // Generar los últimos N meses (incluye los que tienen 0 ventas)
  const months = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const ym = d.toISOString().slice(0, 7);
    const data = byMonth[ym] || { revenue: 0, count: 0 };
    months.push({
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      key: ym,
      label: d.toLocaleString("es-AR", { month: "short", year: "2-digit" }),
      revenue: Math.round(data.revenue),
      salesCount: data.count,
    });
  }

  const monthsWithData = months.filter(m => m.revenue > 0);
  const avgMonthly = monthsWithData.length > 0
    ? monthsWithData.reduce((s, m) => s + m.revenue, 0) / monthsWithData.length
    : 0;

  // Marcar mes fuerte/flojo vs el promedio
  const enriched = months.map(m => ({
    ...m,
    vsAvgPct: avgMonthly > 0 ? Math.round(((m.revenue - avgMonthly) / avgMonthly) * 100) : 0,
    strength: m.revenue > avgMonthly * 1.2 ? "strong" :
              m.revenue < avgMonthly * 0.7 && m.revenue > 0 ? "weak" :
              m.revenue === 0 ? "empty" : "normal",
  }));

  return {
    months: enriched,
    avgMonthly: Math.round(avgMonthly),
    monthsWithData: monthsWithData.length,
  };
}
