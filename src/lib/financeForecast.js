// src/lib/financeForecast.js
//
// Proyecciones financieras: cierre del mes actual + cash flow 30/60/90 días.
//
// Metodología:
//   - Proyección de cierre del mes: extrapola el ritmo actual de ventas
//     prorrateado por días transcurridos. Si querés "al ritmo actual cerrás
//     en $X", esto es. Más sofisticado que regla de tres simple: usa los
//     últimos 14 días (más representativo que mes-a-la-fecha si fue tranqui
//     al principio).
//
//   - Cash flow 30/60/90: estado proyectado de caja en T+30/60/90 días.
//     ingresos esperados = ventas diarias promedio últimos 30d × días
//     egresos esperados  = gastos mensuales recurrentes + compras pendientes
//                          verificadas (cuando salgan a entregar)
//     cash actual = (calculado externamente y pasado como prop) o estimado
//                   con saldos iniciales + sumatoria de movimientos
//
// Funciones PURAS.

import { safeRate } from "../helpers.js";

const MS_PER_DAY = 86400000;

function totalARSOfSale(sale, fallbackRate) {
  const t = Number(sale.total) || 0;
  const cur = sale.currency || "ARS";
  if (cur === "USD" || cur === "USDT") {
    const r = safeRate(sale.exchangeRate || fallbackRate);
    return t * r;
  }
  return t;
}

// === Forecast del cierre del mes actual ===
// Devuelve:
//   {
//     revenueSoFar, daysElapsed, daysInMonth, daysRemaining,
//     dailyAvgFull,      // promedio todo el mes a la fecha
//     dailyAvgLast14,    // promedio últimos 14 días (más representativo)
//     projectedClose,    // cierre proyectado al ritmo de los últimos 14 días
//     projectedCloseConservative, // cierre al ritmo full del mes (≤ projectedClose si subió ritmo)
//     vsLastMonth, lastMonthRevenue, growthPct,
//   }
export function forecastMonthClose(sales, exchangeRate, now = new Date()) {
  const rate = safeRate(exchangeRate) || 1;
  const yearMonth = now.toISOString().slice(0, 7);
  const prevMonth = (() => {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();

  const monthSales = (sales || []).filter(s =>
    s && !s.isDeleted && (s.date || "").slice(0, 7) === yearMonth
  );
  const prevMonthSales = (sales || []).filter(s =>
    s && !s.isDeleted && (s.date || "").slice(0, 7) === prevMonth
  );

  const revenueSoFar = monthSales.reduce((sum, s) => sum + totalARSOfSale(s, rate), 0);
  const lastMonthRevenue = prevMonthSales.reduce((sum, s) => sum + totalARSOfSale(s, rate), 0);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysElapsed = dayOfMonth;
  const daysRemaining = daysInMonth - dayOfMonth;

  const dailyAvgFull = daysElapsed > 0 ? revenueSoFar / daysElapsed : 0;

  // Promedio últimos 14 días — siempre sobre las ventas del mes actual,
  // descontando los días previos al mes corriente si hace falta
  const cutoffMs = now.getTime() - 14 * MS_PER_DAY;
  const recentSales = (sales || []).filter(s => {
    if (!s || s.isDeleted || !s.date) return false;
    return new Date(s.date).getTime() >= cutoffMs;
  });
  const recentRevenue = recentSales.reduce((sum, s) => sum + totalARSOfSale(s, rate), 0);
  const dailyAvgLast14 = recentRevenue / 14;

  const projectedClose = revenueSoFar + dailyAvgLast14 * daysRemaining;
  const projectedCloseConservative = revenueSoFar + dailyAvgFull * daysRemaining;

  const vsLastMonth = projectedClose - lastMonthRevenue;
  const growthPct = lastMonthRevenue > 0
    ? ((projectedClose - lastMonthRevenue) / lastMonthRevenue) * 100
    : null;

  return {
    revenueSoFar: Math.round(revenueSoFar),
    daysElapsed,
    daysInMonth,
    daysRemaining,
    dailyAvgFull: Math.round(dailyAvgFull),
    dailyAvgLast14: Math.round(dailyAvgLast14),
    projectedClose: Math.round(projectedClose),
    projectedCloseConservative: Math.round(projectedCloseConservative),
    lastMonthRevenue: Math.round(lastMonthRevenue),
    vsLastMonth: Math.round(vsLastMonth),
    growthPct: growthPct != null ? Math.round(growthPct) : null,
  };
}

// === Proyección de cash 30/60/90 días ===
// currentCashARS: liquidez actual estimada (la calcula Dashboard/Caja).
// Devuelve [{ days, label, projectedCash, inflows, outflows }]
export function forecastCashFlow({
  currentCashARS = 0,
  sales = [],
  expenses = [],
  purchases = [],
  exchangeRate = 1,
  now = new Date(),
} = {}) {
  const rate = safeRate(exchangeRate) || 1;

  // INGRESOS PROYECTADOS: promedio diario de los últimos 30 días × días a proyectar
  const cutoff30 = now.getTime() - 30 * MS_PER_DAY;
  const recentSales = (sales || []).filter(s => {
    if (!s || s.isDeleted || !s.date) return false;
    return new Date(s.date).getTime() >= cutoff30;
  });
  const recent30Revenue = recentSales.reduce((sum, s) => sum + totalARSOfSale(s, rate), 0);
  const dailyInflow = recent30Revenue / 30;

  // EGRESOS RECURRENTES: gastos mensuales promedio (último mes)
  const yearMonth = now.toISOString().slice(0, 7);
  const monthExpenses = (expenses || []).filter(e =>
    e && !e.isDeleted && (e.date || "").slice(0, 7) === yearMonth
  );
  const monthlyExpensesARS = monthExpenses.reduce((s, e) => s + (Number(e.amountARS) || 0), 0);
  const dailyOutflowExpenses = monthlyExpensesARS / 30;

  // COMPRAS PENDIENTES: pedidos en camino sin verificar todavía cuestan plata
  // cuando se entregan (en USD → ARS). Asumimos que se "pagan" cuando llegan.
  const pendingPurchases = (purchases || []).filter(p =>
    p && !p.isDeleted && p.status !== "verificado"
  );
  const pendingUSD = pendingPurchases.reduce((s, p) => s + (Number(p.totalUSDT) || 0), 0);
  const pendingARS = pendingUSD * rate;
  // Distribuimos las compras pendientes en los próximos 30 días (asumiendo
  // que se entregan dentro del mes). Es un proxy razonable.
  const dailyOutflowPurchases = pendingARS / 30;

  const dailyOutflow = dailyOutflowExpenses + dailyOutflowPurchases;
  const netDaily = dailyInflow - dailyOutflow;

  const horizons = [30, 60, 90];
  const result = horizons.map(days => {
    const inflows = Math.round(dailyInflow * days);
    const outflows = Math.round(dailyOutflow * days);
    const projectedCash = Math.round(currentCashARS + netDaily * days);
    return {
      days,
      label: `${days} días`,
      projectedCash,
      inflows,
      outflows,
      net: inflows - outflows,
    };
  });

  return {
    currentCashARS: Math.round(currentCashARS),
    dailyInflow: Math.round(dailyInflow),
    dailyOutflow: Math.round(dailyOutflow),
    netDaily: Math.round(netDaily),
    horizons: result,
    pendingPurchasesARS: Math.round(pendingARS),
    monthlyExpensesARS: Math.round(monthlyExpensesARS),
  };
}
