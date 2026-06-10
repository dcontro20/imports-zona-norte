// src/lib/financialStatements.js
//
// Estados financieros formales generados a partir del plan de cuentas:
//
//   1. Estado de Resultados (P&L)
//      Ingresos - COGS = Margen bruto
//      - OpEx - Mermas = Resultado operativo
//      = Resultado neto del período
//
//   2. Balance General (snapshot)
//      Activo = Caja (multi-moneda) + Cuentas a cobrar + Stock a costo
//      Pasivo = Créditos a clientes
//      Patrimonio = Activo - Pasivo
//
//   3. Cash Flow Statement (operativo)
//      Cobros de ventas - Pagos a proveedores - Gastos = Flujo neto
//
// Funciones PURAS. Todo en ARS.

import { safeRate } from "../helpers.js";
import { ACCOUNTS, aggregateByAccount } from "./chartOfAccounts.js";
import { getProductCostUSDT } from "../finance.js";

function totalARSOfSale(sale, fallbackRate) {
  const t = Number(sale.total) || 0;
  const cur = sale.currency || "ARS";
  if (cur === "USD" || cur === "USDT") return t * safeRate(sale.exchangeRate || fallbackRate);
  return t;
}

function filterByPeriod(items, { from, to }) {
  return (items || []).filter(it => {
    if (!it || it.isDeleted || !it.date) return false;
    const d = it.date.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

// ============================================================================
// 1. ESTADO DE RESULTADOS (P&L)
// ============================================================================
// Devuelve un objeto con totales agregados + breakdown por cuenta para
// poder mostrarlo en una tabla tipo libro mayor.
export function generateIncomeStatement({ sales = [], expenses = [], withdrawals = [], products = [], from, to, exchangeRate = 1 } = {}) {
  const periodSales = filterByPeriod(sales, { from, to });
  const periodExpenses = filterByPeriod(expenses, { from, to });
  const periodWithdrawals = filterByPeriod(withdrawals, { from, to });

  // INGRESOS
  const revenueARS = periodSales.reduce((s, sale) => s + totalARSOfSale(sale, exchangeRate), 0);

  // COGS (calculado desde items + costUSDT de cada producto)
  const productsById = new Map((products || []).map(p => [p.id, p]));
  let cogsARS = 0;
  periodSales.forEach(s => {
    const rate = safeRate(s.exchangeRate || exchangeRate);
    (s.items || []).forEach(i => {
      const p = productsById.get(i.productId);
      if (!p) return;
      const cost = Number(i.costUSDTAtSale) || getProductCostUSDT(p);
      cogsARS += cost * rate * (Number(i.qty) || 1);
    });
  });

  const grossProfit = revenueARS - cogsARS;

  // OPEX detallado por cuenta
  const byAccount = aggregateByAccount({
    sales: periodSales,
    expenses: periodExpenses,
    withdrawals: periodWithdrawals,
    exchangeRate,
  });

  // Sumas por grupo
  let opexTotal = 0;
  let shrinkageTotal = 0;
  const opexLines = [];
  const shrinkageLines = [];
  Object.entries(byAccount).forEach(([code, amount]) => {
    const acc = ACCOUNTS[code];
    if (!acc) return;
    if (acc.type === "opex") {
      opexTotal += amount;
      opexLines.push({ code, name: acc.name, amount: Math.round(amount) });
    } else if (acc.type === "shrinkage") {
      shrinkageTotal += amount;
      shrinkageLines.push({ code, name: acc.name, amount: Math.round(amount) });
    }
  });

  opexLines.sort((a, b) => b.amount - a.amount);
  shrinkageLines.sort((a, b) => b.amount - a.amount);

  const operatingResult = grossProfit - opexTotal - shrinkageTotal;
  const netResult = operatingResult; // (sin financieros ni impuestos en este negocio)

  return {
    period: { from, to },
    income: {
      revenue: Math.round(revenueARS),
    },
    cogs: Math.round(cogsARS),
    grossProfit: Math.round(grossProfit),
    grossMarginPct: revenueARS > 0 ? Math.round((grossProfit / revenueARS) * 1000) / 10 : 0,
    opex: {
      total: Math.round(opexTotal),
      lines: opexLines,
    },
    shrinkage: {
      total: Math.round(shrinkageTotal),
      lines: shrinkageLines,
    },
    operatingResult: Math.round(operatingResult),
    netResult: Math.round(netResult),
    netMarginPct: revenueARS > 0 ? Math.round((netResult / revenueARS) * 1000) / 10 : 0,
  };
}

// ============================================================================
// 2. BALANCE GENERAL (snapshot a una fecha)
// ============================================================================
export function generateBalanceSheet({
  products = [],
  clients = [],
  cashARS = 0,
  cashUSD = 0,
  cashUSDT = 0,
  exchangeRate = 1,
  asOf = new Date(),
} = {}) {
  const rate = safeRate(exchangeRate) || 1;

  // ACTIVO
  // Caja convertida a ARS
  const totalCashARS = cashARS + (cashUSD * rate) + (cashUSDT * rate);

  // Cuentas a cobrar = balances NEGATIVOS de clientes (le deben a Diego)
  const accountsReceivable = (clients || [])
    .filter(c => !c.isDeleted && (c.balance || 0) < 0)
    .reduce((sum, c) => sum + Math.abs(c.balance), 0);

  // Stock a costo
  const stockAtCost = (products || []).reduce((sum, p) => {
    if (p.isDeleted) return sum;
    const cost = getProductCostUSDT(p) * rate;
    return sum + cost * (Number(p.stock) || 0);
  }, 0);

  // Total Activo
  const totalAssets = totalCashARS + accountsReceivable + stockAtCost;

  // PASIVO
  // Créditos a clientes (vuelto-crédito que les debe Diego)
  const clientCreditsOwed = (clients || [])
    .filter(c => !c.isDeleted && (c.balance || 0) > 0)
    .reduce((sum, c) => sum + c.balance, 0);

  const totalLiabilities = clientCreditsOwed;

  // PATRIMONIO = ACTIVO - PASIVO
  const equity = totalAssets - totalLiabilities;

  return {
    asOf: asOf.toISOString().slice(0, 10),
    assets: {
      current: {
        cash: Math.round(totalCashARS),
        cashBreakdown: { ars: Math.round(cashARS), usd: Math.round(cashUSD), usdt: Math.round(cashUSDT) },
        accountsReceivable: Math.round(accountsReceivable),
        inventory: Math.round(stockAtCost),
      },
      total: Math.round(totalAssets),
    },
    liabilities: {
      current: {
        clientCreditsOwed: Math.round(clientCreditsOwed),
      },
      total: Math.round(totalLiabilities),
    },
    equity: Math.round(equity),
  };
}

// ============================================================================
// 3. ESTADO DE FLUJO DE EFECTIVO (operativo)
// ============================================================================
export function generateCashFlow({ sales = [], expenses = [], purchases = [], from, to, exchangeRate = 1 } = {}) {
  const periodSales = filterByPeriod(sales, { from, to });
  const periodExpenses = filterByPeriod(expenses, { from, to });
  const periodPurchases = filterByPeriod(purchases, { from, to })
    .filter(p => p.status === "verificado"); // solo las que se pagaron

  const inflows = periodSales.reduce((s, sale) => s + totalARSOfSale(sale, exchangeRate), 0);
  const outflowsPurchases = periodPurchases.reduce((s, p) => s + (Number(p.totalUSDT) || 0) * safeRate(exchangeRate), 0);
  const outflowsExpenses = periodExpenses.reduce((s, e) => s + (Number(e.amountARS) || 0), 0);

  const netCashFlow = inflows - outflowsPurchases - outflowsExpenses;

  return {
    period: { from, to },
    operating: {
      inflows: {
        salesCollections: Math.round(inflows),
      },
      outflows: {
        toSuppliers: Math.round(outflowsPurchases),
        operatingExpenses: Math.round(outflowsExpenses),
      },
      net: Math.round(netCashFlow),
    },
    netCashFlow: Math.round(netCashFlow),
  };
}
