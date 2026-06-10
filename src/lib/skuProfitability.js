// src/lib/skuProfitability.js
//
// Rentabilidad REAL por SKU = no es solo el margen unitario, es cuánto
// rinde ese capital invertido por mes. Un producto con 40% de margen pero
// que tarda 6 meses en venderse rinde MENOS que uno con 25% que se vende
// en 1 mes.
//
// Métrica principal: ROI mensual = (margen_unitario × velocidad_diaria × 30) / costo_unitario
//
// Devuelve clasificación:
//   "star"      → margen alto + vende rápido
//   "cashcow"   → margen medio pero vende constante
//   "trap"      → margen alto en papel pero capital muerto (no rota)
//   "drain"     → margen bajo Y vende poco — sangrar
//   "promising" → vende OK con margen razonable
//   "needs_data"→ sin info suficiente (sin costo cargado o sin ventas)
//
// Funciones PURAS.

import { safeRate } from "../helpers.js";
import { getProductCostUSDT } from "../finance.js";
import { buildProductSalesStats } from "../productIntelligence.js";
import { filterRealProducts } from "./realProducts.js";

const MS_PER_DAY = 86400000;

// Calcula ROI mensual y clasifica cada producto real.
// Devuelve array [{ product, marginPct, costUSD, priceUSD, velocity, daysOfStock,
//                   monthlyROI, classification, monthlyProfit }]
// Ordenado por monthlyROI descendente.
export function rankSkuProfitability({ products, sales, purchases, exchangeRate = 1, now = new Date() } = {}) {
  const real = filterRealProducts(products, sales, purchases);
  const stats = buildProductSalesStats(real, sales, exchangeRate);

  const result = real.map(p => {
    const stat = stats[p.id] || {};
    const priceUSD = Number(p.priceUSD) || 0;
    const costUSD = getProductCostUSDT(p);
    const stock = Number(p.stock) || 0;
    const velocity = stat.velocity30dPerDay || 0;

    // Sin costo o sin precio → needs_data
    if (priceUSD <= 0 || costUSD <= 0) {
      return {
        product: p,
        marginPct: null,
        costUSD,
        priceUSD,
        velocity,
        stock,
        daysOfStock: velocity > 0 ? Math.ceil(stock / velocity) : null,
        monthlyROI: null,
        monthlyProfit: null,
        classification: "needs_data",
      };
    }

    const marginPerUnit = priceUSD - costUSD;
    const marginPct = (marginPerUnit / priceUSD) * 100;
    const daysOfStock = velocity > 0 ? Math.ceil(stock / velocity) : Infinity;
    const monthlyUnits = velocity * 30;
    const monthlyProfit = marginPerUnit * monthlyUnits;
    // ROI mensual = beneficio mensual / inversión en stock actual
    // (si stock es 0, no podemos calcular ROI estable)
    const invested = costUSD * stock;
    const monthlyROI = invested > 0 ? (monthlyProfit / invested) * 100 : null;

    // Clasificación
    let classification;
    if (velocity === 0) {
      // No se mueve. Si tiene margen alto en papel, es trap. Si no, drain.
      classification = marginPct >= 30 ? "trap" : "drain";
    } else if (marginPct >= 35 && velocity >= 0.3) {
      classification = "star"; // margen muy alto + se mueve
    } else if (marginPct < 20 && velocity < 0.2) {
      classification = "drain"; // margen bajo + se mueve poco
    } else if (marginPct >= 25) {
      classification = "promising";
    } else {
      classification = "cashcow"; // margen medio pero vende
    }

    return {
      product: p,
      marginPct: Math.round(marginPct * 10) / 10,
      costUSD,
      priceUSD,
      velocity: Math.round(velocity * 100) / 100,
      stock,
      daysOfStock: daysOfStock === Infinity ? null : daysOfStock,
      monthlyUnits: Math.round(monthlyUnits * 10) / 10,
      monthlyProfit: Math.round(monthlyProfit * 100) / 100, // USD
      monthlyROI: monthlyROI != null ? Math.round(monthlyROI * 10) / 10 : null, // %
      classification,
    };
  });

  // Ordenar por monthlyROI desc (los con null al final)
  return result.sort((a, b) => {
    if (a.monthlyROI == null && b.monthlyROI == null) return 0;
    if (a.monthlyROI == null) return 1;
    if (b.monthlyROI == null) return -1;
    return b.monthlyROI - a.monthlyROI;
  });
}

export const SKU_LABELS = {
  star:        { label: "Estrella",      emoji: "⭐", color: "#0F6B5C", desc: "Margen alto + vende rápido" },
  promising:   { label: "Prometedor",    emoji: "📈", color: "#2383E2", desc: "Margen razonable, rotación buena" },
  cashcow:     { label: "Vaca lechera",  emoji: "💵", color: "#1E2B4A", desc: "Margen medio, vende constante" },
  trap:        { label: "Trampa",        emoji: "⚠️", color: "#CB912F", desc: "Margen alto en papel pero no rota — capital muerto" },
  drain:       { label: "Drenaje",       emoji: "🩸", color: "#B83232", desc: "Margen bajo Y no se mueve — considerar liquidar" },
  needs_data:  { label: "Sin datos",     emoji: "❔", color: "#9AA2B3", desc: "Falta costo o precio para calcular" },
};

// Resumen agregado para Dashboard / Analisis
export function profitabilitySummary(ranked) {
  const counts = { star: 0, promising: 0, cashcow: 0, trap: 0, drain: 0, needs_data: 0 };
  let totalMonthlyProfitUSD = 0;
  let totalInvestedUSD = 0;
  ranked.forEach(r => {
    counts[r.classification] = (counts[r.classification] || 0) + 1;
    if (r.monthlyProfit != null) totalMonthlyProfitUSD += r.monthlyProfit;
    totalInvestedUSD += (r.costUSD || 0) * (r.stock || 0);
  });
  return {
    counts,
    totalMonthlyProfitUSD: Math.round(totalMonthlyProfitUSD * 100) / 100,
    totalInvestedUSD: Math.round(totalInvestedUSD * 100) / 100,
    portfolioROIMonthly: totalInvestedUSD > 0
      ? Math.round((totalMonthlyProfitUSD / totalInvestedUSD) * 1000) / 10
      : 0,
  };
}
