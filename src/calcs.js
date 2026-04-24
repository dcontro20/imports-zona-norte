// Pure calculation functions extracted for testability
// Used by Partners, CashBox, Reports, Dashboard

import { CURRENCIES } from "./constants.js";
import { safeRate } from "./helpers.js";

/**
 * Calculate total revenue from sales, normalizing all currencies to ARS.
 * Uses each sale's own exchangeRate if available, falls back to provided rate.
 */
export function calcTotalRevenue(sales, exchangeRate) {
  return sales.reduce((sum, sale) => {
    const cur = sale.currency || "ARS";
    const amount = sale.total || 0;
    const rate = safeRate(sale.exchangeRate || exchangeRate);
    if (cur === "USD" || cur === "USDT") return sum + amount * rate;
    return sum + amount;
  }, 0);
}

/**
 * Calculate total revenue in USD from sales.
 */
export function calcTotalRevenueUSD(sales, exchangeRate) {
  return sales.reduce((sum, sale) => {
    const cur = sale.currency || "ARS";
    const amount = sale.total || 0;
    const rate = safeRate(sale.exchangeRate || exchangeRate);
    if (cur === "ARS") return sum + (rate > 0 ? amount / rate : 0);
    return sum + amount;
  }, 0);
}

/**
 * Calculate total purchase costs in ARS
 */
export function calcTotalCosts(purchases) {
  return purchases.reduce((sum, p) => sum + (p.totalCostARS || 0), 0);
}

/**
 * Calculate total expenses in ARS
 */
export function calcTotalExpenses(expenses) {
  return expenses.reduce((sum, e) => sum + (e.amountARS || 0), 0);
}

/**
 * Tipo de merma marcado como "consumo personal del socio".
 * El resto de tipos se consideran mermas operativas comunes (Garantía, Regalo/Canje, etc).
 */
export const CONSUMO_PERSONAL_TYPE = "Consumo propio";

/**
 * Helper interno: extrae el costo unitario USD de un withdrawal.
 * Datos nuevos guardan `costRealUSD` (costo de importación real, lo que perdés).
 * Datos viejos solo tenían `costEstimateUSD` (originalmente basado en priceUSD,
 * después corregido a costUSDT). El fallback mantiene compatibilidad.
 */
function withdrawalCostUSD(w) {
  return Number(w.costRealUSD || w.costEstimateUSD || 0);
}

/**
 * Calculate total withdrawal (consumo) value in ARS — todos los tipos.
 * Suma el costo REAL perdido, en ARS al rate dado.
 */
export function calcConsumoValue(withdrawals, exchangeRate) {
  return withdrawals
    .filter(w => !w.isDeleted)
    .reduce((sum, w) => sum + withdrawalCostUSD(w), 0) * safeRate(exchangeRate);
}

/**
 * Suma del costo de mermas COMUNES (todo lo que NO es consumo personal del socio).
 * Garantías, regalos, canjes, devoluciones — gastos del negocio compartidos 50/50.
 * Devuelve ARS.
 */
export function calcMermasComunesARS(withdrawals, exchangeRate) {
  return withdrawals
    .filter(w => !w.isDeleted && w.withdrawType !== CONSUMO_PERSONAL_TYPE)
    .reduce((sum, w) => sum + withdrawalCostUSD(w), 0) * safeRate(exchangeRate);
}

/**
 * Suma del costo de consumo PERSONAL de un socio (Diego o Gustavo).
 * Lo que ese socio se fumó/usó individualmente. Devuelve ARS.
 */
export function calcConsumoPersonalARS(withdrawals, person, exchangeRate) {
  return withdrawals
    .filter(w => !w.isDeleted && w.withdrawType === CONSUMO_PERSONAL_TYPE && w.person === person)
    .reduce((sum, w) => sum + withdrawalCostUSD(w), 0) * safeRate(exchangeRate);
}

/**
 * Calculate net profit (revenue - costs - expenses - TODAS las mermas).
 * Esta es la ganancia neta total del negocio antes de splits, e incluye
 * tanto mermas comunes como consumo personal de los socios.
 */
export function calcNetProfit(sales, purchases, expenses, withdrawals, exchangeRate) {
  const revenue = calcTotalRevenue(sales, exchangeRate);
  const costs = calcTotalCosts(purchases);
  const expensesTotal = calcTotalExpenses(expenses);
  const consumo = calcConsumoValue(withdrawals, exchangeRate);
  return revenue - costs - expensesTotal - consumo;
}

/**
 * Calculate partner balances con reparto JUSTO entre socios.
 *
 * El consumo personal de cada socio se imputa 100% a su saldo individual,
 * no al pozo común. Las mermas comunes (garantías, regalos) sí afectan al
 * pozo común y se reparten 50/50.
 *
 * Pozo común:
 *   netProfitComun = revenue - costs - expenses - mermasComunes
 *   halfProfit = netProfitComun / 2  (lo que le toca a cada socio)
 *
 * Por socio:
 *   diegoBalance   = halfProfit - consumoPersonalDiego   - retirosDiego
 *   gustavoBalance = halfProfit - consumoPersonalGustavo - retirosGustavo
 *
 * Devuelve también `netProfit` (incluye consumo personal) por compat con
 * Dashboard/Reports que muestran la ganancia total del negocio.
 */
export function calcPartnerBalances(sales, purchases, expenses, withdrawals, partnerWithdrawals, exchangeRate) {
  const revenue = calcTotalRevenue(sales, exchangeRate);
  const costs = calcTotalCosts(purchases);
  const expensesTotal = calcTotalExpenses(expenses);
  const mermasComunes = calcMermasComunesARS(withdrawals, exchangeRate);
  const consumoDiego = calcConsumoPersonalARS(withdrawals, "Diego", exchangeRate);
  const consumoGustavo = calcConsumoPersonalARS(withdrawals, "Gustavo", exchangeRate);

  const netProfitComun = revenue - costs - expensesTotal - mermasComunes;
  const netProfit = netProfitComun - consumoDiego - consumoGustavo; // ganancia neta TOTAL
  const halfProfit = netProfitComun / 2;

  const rateForWithdrawals = safeRate(exchangeRate);
  const calcWithdrawalTotal = (person) =>
    partnerWithdrawals
      .filter(w => !w.isDeleted && w.person === person)
      .reduce((sum, w) => {
        if (w.currency === "USD" || w.currency === "USDT") return sum + w.amount * rateForWithdrawals;
        return sum + w.amount;
      }, 0);

  const diegoTotal = calcWithdrawalTotal("Diego");
  const gustavoTotal = calcWithdrawalTotal("Gustavo");
  const totalWithdrawn = diegoTotal + gustavoTotal;

  return {
    // Pozo común
    revenue,
    costs,
    expensesTotal,
    mermasComunes,
    netProfitComun,
    halfProfit,

    // Por socio
    consumoDiego,
    consumoGustavo,
    diegoTotal,           // retiros en plata
    gustavoTotal,
    totalWithdrawn,

    // Saldos: lo que le toca a cada uno - su consumo personal - sus retiros
    diegoBalance: halfProfit - consumoDiego - diegoTotal,
    gustavoBalance: halfProfit - consumoGustavo - gustavoTotal,

    // Compat con código existente
    netProfit,
    profitRemaining: netProfitComun - totalWithdrawn,
  };
}

/**
 * Format money with currency symbol
 */
export function formatMoney(n, cur = "ARS") {
  return `${CURRENCIES[cur] || "$"}${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
