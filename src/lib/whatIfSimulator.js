// src/lib/whatIfSimulator.js
//
// Simulador what-if para tomar decisiones financieras informadas:
//
//   - "Si subo precios X% → ¿cuánto neto?"
//   - "Si bajo costos Y% (negociando) → ¿cuánto neto?"
//   - "Para llegar a $X de neto/revenue → ¿cuánto necesito vender?"
//
// Asume estructura de costos similar al mes en curso. Funciones PURAS.

import { safeRate } from "../helpers.js";

const MS_PER_DAY = 86400000;

function totalARSOfSale(sale, fallbackRate) {
  const t = Number(sale.total) || 0;
  const cur = sale.currency || "ARS";
  if (cur === "USD" || cur === "USDT") return t * safeRate(sale.exchangeRate || fallbackRate);
  return t;
}

// Snapshot de los últimos N días: revenue, COGS, gastos, neto
// Es la BASE que después modificamos en el simulador.
export function lastNDaysSnapshot({ sales = [], expenses = [], products = [], exchangeRate = 1, days = 30, now = new Date() } = {}) {
  const rate = safeRate(exchangeRate) || 1;
  const cutoff = now.getTime() - days * MS_PER_DAY;

  const recent = (sales || []).filter(s => s && !s.isDeleted && s.date && new Date(s.date).getTime() >= cutoff);
  const revenueARS = recent.reduce((sum, s) => sum + totalARSOfSale(s, rate), 0);

  // COGS aproximado: sumar costUSDT × qty de cada item, convertido a ARS
  const productsById = new Map((products || []).map(p => [p.id, p]));
  let cogsARS = 0;
  recent.forEach(s => {
    const sRate = safeRate(s.exchangeRate || rate);
    (s.items || []).forEach(i => {
      const p = productsById.get(i.productId);
      if (!p) return;
      // Si está el snapshot costUSDTAtSale, lo usamos (más preciso); sino costUSDT actual
      const cost = Number(i.costUSDTAtSale) || Number(p.costUSDT) || 0;
      cogsARS += cost * sRate * (Number(i.qty) || 1);
    });
  });

  const recentExpenses = (expenses || []).filter(e => e && !e.isDeleted && e.date && new Date(e.date).getTime() >= cutoff);
  const expensesARS = recentExpenses.reduce((s, e) => s + (Number(e.amountARS) || 0), 0);

  const grossProfitARS = revenueARS - cogsARS;
  const netProfitARS = grossProfitARS - expensesARS;
  const grossMarginPct = revenueARS > 0 ? (grossProfitARS / revenueARS) * 100 : 0;
  const netMarginPct = revenueARS > 0 ? (netProfitARS / revenueARS) * 100 : 0;

  return {
    days,
    revenueARS: Math.round(revenueARS),
    cogsARS: Math.round(cogsARS),
    grossProfitARS: Math.round(grossProfitARS),
    expensesARS: Math.round(expensesARS),
    netProfitARS: Math.round(netProfitARS),
    grossMarginPct: Math.round(grossMarginPct * 10) / 10,
    netMarginPct: Math.round(netMarginPct * 10) / 10,
  };
}

// === SIMULADOR ===
//
// Aplica modificadores al snapshot base y devuelve el escenario:
//   priceDeltaPct  → ej. +5 sube todos los precios 5%
//   costDeltaPct   → ej. -10 baja costos 10% (negociar con proveedor)
//   volumeDeltaPct → ej. +20 vende 20% más unidades
//   expensesDeltaPct → ej. -15 baja gastos 15%
//
// Devuelve el escenario completo con neto y delta vs base.
export function simulateWhatIf(snapshot, modifiers = {}) {
  if (!snapshot) return null;
  const {
    priceDeltaPct = 0,
    costDeltaPct = 0,
    volumeDeltaPct = 0,
    expensesDeltaPct = 0,
  } = modifiers;

  const priceMult = 1 + priceDeltaPct / 100;
  const costMult = 1 + costDeltaPct / 100;
  const volumeMult = 1 + volumeDeltaPct / 100;
  const expMult = 1 + expensesDeltaPct / 100;

  // ASUNCIÓN simplificada: subir precios 5% NO cambia el volumen (elasticidad
  // baja en este mercado). Para modelar elasticidad real, el usuario ajusta
  // volumeDeltaPct manualmente.
  const newRevenue = snapshot.revenueARS * priceMult * volumeMult;
  const newCOGS = snapshot.cogsARS * costMult * volumeMult;
  const newGross = newRevenue - newCOGS;
  const newExpenses = snapshot.expensesARS * expMult;
  const newNet = newGross - newExpenses;

  return {
    revenueARS: Math.round(newRevenue),
    cogsARS: Math.round(newCOGS),
    grossProfitARS: Math.round(newGross),
    expensesARS: Math.round(newExpenses),
    netProfitARS: Math.round(newNet),
    grossMarginPct: newRevenue > 0 ? Math.round((newGross / newRevenue) * 1000) / 10 : 0,
    netMarginPct: newRevenue > 0 ? Math.round((newNet / newRevenue) * 1000) / 10 : 0,
    deltas: {
      revenueDeltaARS: Math.round(newRevenue - snapshot.revenueARS),
      netDeltaARS: Math.round(newNet - snapshot.netProfitARS),
      netDeltaPct: snapshot.netProfitARS !== 0
        ? Math.round(((newNet - snapshot.netProfitARS) / Math.abs(snapshot.netProfitARS)) * 100)
        : null,
    },
  };
}

// === META INVERSA ===
// "Para llegar a $X de neto, ¿cuánto revenue necesito al mes (asumiendo
// misma estructura de costos)?"
//
// Resuelve: targetNet = revenue × netMarginPct/100
//        → revenue = targetNet / (netMarginPct/100)
export function revenueNeededFor(targetNetARS, snapshot) {
  if (!snapshot || snapshot.netMarginPct <= 0) return null;
  const monthlyNet = snapshot.netProfitARS * (30 / snapshot.days);
  const monthlyRevenue = snapshot.revenueARS * (30 / snapshot.days);
  const marginPct = snapshot.netMarginPct / 100;
  if (marginPct <= 0) return null;
  const neededRevenue = targetNetARS / marginPct;
  const additionalRevenue = neededRevenue - monthlyRevenue;
  return {
    targetNetARS: Math.round(targetNetARS),
    currentMonthlyNetARS: Math.round(monthlyNet),
    currentMonthlyRevenueARS: Math.round(monthlyRevenue),
    neededMonthlyRevenueARS: Math.round(neededRevenue),
    additionalRevenueARS: Math.round(additionalRevenue),
    additionalPct: monthlyRevenue > 0
      ? Math.round((additionalRevenue / monthlyRevenue) * 100)
      : null,
    netMarginPct: snapshot.netMarginPct,
  };
}
