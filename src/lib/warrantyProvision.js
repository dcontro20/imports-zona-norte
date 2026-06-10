// src/lib/warrantyProvision.js
//
// Provisión para garantías y devoluciones. Reserva un % del revenue mensual
// para cubrir los vapes que fallen (típica garantía 48hs).
//
// Lógica:
//   1. Calcular tasa histórica de garantías = (mermas por garantía $) / (revenue $)
//      sobre los últimos N meses.
//   2. Aplicar esa tasa al revenue del período actual para obtener la provisión
//      teórica (cuánto deberías estar reservando).
//   3. Comparar con las garantías reales del período. Si reservaste de menos
//      → ajuste; si reservaste de más → te sobra.
//
// Funciones PURAS.

import { safeRate } from "../helpers.js";

const MS_PER_DAY = 86400000;

function totalARSOfSale(sale, fallbackRate) {
  const t = Number(sale.total) || 0;
  const cur = sale.currency || "ARS";
  if (cur === "USD" || cur === "USDT") return t * safeRate(sale.exchangeRate || fallbackRate);
  return t;
}

// Tasa histórica de garantías = costo total de garantías / revenue total
// del período de calibración (últimos N meses, default 6).
export function calcWarrantyRate({ sales = [], withdrawals = [], exchangeRate = 1, monthsBack = 6, now = new Date() } = {}) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const cutoffMs = cutoff.getTime();

  const periodSales = (sales || []).filter(s =>
    s && !s.isDeleted && s.date && new Date(s.date).getTime() >= cutoffMs
  );
  const periodWithdrawals = (withdrawals || []).filter(w =>
    w && !w.isDeleted && w.date && new Date(w.date).getTime() >= cutoffMs
  );

  const revenueARS = periodSales.reduce((sum, s) => sum + totalARSOfSale(s, exchangeRate), 0);
  const warrantyCostARS = periodWithdrawals
    .filter(w => (w.withdrawType || "").toLowerCase().includes("garant"))
    .reduce((sum, w) => sum + (Number(w.costEstimateARS) || 0), 0);

  return {
    monthsBack,
    revenueARS: Math.round(revenueARS),
    warrantyCostARS: Math.round(warrantyCostARS),
    ratePct: revenueARS > 0 ? Math.round((warrantyCostARS / revenueARS) * 10000) / 100 : 0,
  };
}

// Provisión para un período: usa la tasa histórica × revenue actual.
// Compara con las garantías REALES del período → te dice si reservaste de
// menos (déficit) o de más (sobra).
export function warrantyProvisionForPeriod({
  sales = [],
  withdrawals = [],
  from,
  to,
  exchangeRate = 1,
  ratePct = null, // si no se pasa, lo calculamos con últimos 6 meses
  fallbackRate = 3, // 3% default si no hay historia
  now = new Date(),
} = {}) {
  // Si no se pasa ratePct, calcularlo
  let effectiveRate = ratePct;
  if (effectiveRate == null) {
    const calc = calcWarrantyRate({ sales, withdrawals, exchangeRate, now });
    effectiveRate = calc.ratePct > 0 ? calc.ratePct : fallbackRate;
  }

  const filterDate = (it) => {
    if (!it || it.isDeleted || !it.date) return false;
    const d = it.date.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const periodSales = (sales || []).filter(filterDate);
  const periodWithdrawals = (withdrawals || []).filter(filterDate);

  const revenueARS = periodSales.reduce((sum, s) => sum + totalARSOfSale(s, exchangeRate), 0);
  const provisionARS = revenueARS * (effectiveRate / 100);
  const actualWarrantyARS = periodWithdrawals
    .filter(w => (w.withdrawType || "").toLowerCase().includes("garant"))
    .reduce((sum, w) => sum + (Number(w.costEstimateARS) || 0), 0);

  const diff = provisionARS - actualWarrantyARS;

  return {
    period: { from, to },
    ratePct: effectiveRate,
    revenueARS: Math.round(revenueARS),
    provisionARS: Math.round(provisionARS),
    actualWarrantyARS: Math.round(actualWarrantyARS),
    diff: Math.round(diff),
    status: diff > 0 ? "sobra" : diff < 0 ? "deficit" : "exacto",
  };
}
