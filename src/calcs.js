// Pure calculation functions extracted for testability
// Used by Partners, CashBox, Reports, Dashboard

import { CURRENCIES } from "./constants.js";

/**
 * Calculate total revenue from sales, normalizing all currencies to ARS.
 * Uses each sale's own exchangeRate if available, falls back to provided rate.
 */
export function calcTotalRevenue(sales, exchangeRate) {
  return sales.reduce((sum, sale) => {
    const cur = sale.currency || "ARS";
    const amount = sale.total || 0;
    const rate = sale.exchangeRate || exchangeRate;
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
    const rate = sale.exchangeRate || exchangeRate;
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
 * Calculate total withdrawal (consumo) value in ARS
 */
export function calcConsumoValue(withdrawals, exchangeRate) {
  return withdrawals.reduce((sum, w) => sum + (w.costEstimateUSD || 0), 0) * exchangeRate;
}

/**
 * Calculate net profit (revenue - costs - expenses - consumo)
 */
export function calcNetProfit(sales, purchases, expenses, withdrawals, exchangeRate) {
  const revenue = calcTotalRevenue(sales, exchangeRate);
  const costs = calcTotalCosts(purchases);
  const expensesTotal = calcTotalExpenses(expenses);
  const consumo = calcConsumoValue(withdrawals, exchangeRate);
  return revenue - costs - expensesTotal - consumo;
}

/**
 * Calculate partner balances (50/50 split)
 * Returns { halfProfit, diegoTotal, gustavoTotal, diegoBalance, gustavoBalance, profitRemaining }
 */
export function calcPartnerBalances(sales, purchases, expenses, withdrawals, partnerWithdrawals, exchangeRate) {
  const netProfit = calcNetProfit(sales, purchases, expenses, withdrawals, exchangeRate);

  const calcWithdrawalTotal = (person) =>
    partnerWithdrawals
      .filter(w => !w.isDeleted && w.person === person)
      .reduce((sum, w) => {
        if (w.currency === "USD" || w.currency === "USDT") return sum + w.amount * exchangeRate;
        return sum + w.amount;
      }, 0);

  const diegoTotal = calcWithdrawalTotal("Diego");
  const gustavoTotal = calcWithdrawalTotal("Gustavo");
  const totalWithdrawn = diegoTotal + gustavoTotal;
  const halfProfit = netProfit / 2;

  return {
    netProfit,
    halfProfit,
    diegoTotal,
    gustavoTotal,
    totalWithdrawn,
    profitRemaining: netProfit - totalWithdrawn,
    diegoBalance: halfProfit - diegoTotal,
    gustavoBalance: halfProfit - gustavoTotal,
  };
}

/**
 * Format money with currency symbol
 */
export function formatMoney(n, cur = "ARS") {
  return `${CURRENCIES[cur] || "$"}${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
