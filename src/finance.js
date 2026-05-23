// src/finance.js
//
// Motor financiero PURO. Funciones de costeo real, COGS devengado, valuación
// de inventario, márgenes, P&L mensual, flujo de caja proyectado y KPIs.
//
// Conceptos clave:
//   - costo real por producto: usa `avgCostUSDT` (promedio ponderado calculado
//     al verificar pedidos). Fallback a `costUSDT` (manual) si no existe.
//   - COGS (Cost of Goods Sold): costo de lo VENDIDO, imputado al momento de
//     la venta. Las ventas nuevas snapshot el costo (`item.costUSDTAtSale`);
//     las viejas usan el costo actual del producto como aproximación.
//   - Todo se normaliza a ARS usando el rate histórico de cada transacción.

import { safeRate } from "./helpers.js";

// ============================================================================
// COSTO REAL POR PRODUCTO
// ============================================================================

// Costo unitario real de un producto en USDT. Prioridad:
//   avgCostUSDT (ponderado) > costUSDT (manual) > 0
export function getProductCostUSDT(product) {
  if (!product) return 0;
  const avg = Number(product.avgCostUSDT);
  if (Number.isFinite(avg) && avg > 0) return avg;
  const manual = Number(product.costUSDT);
  if (Number.isFinite(manual) && manual > 0) return manual;
  return 0;
}

// Promedio ponderado de costo al ingresar stock nuevo.
//   nuevoAvg = (stockViejo × avgViejo + qtyEntrante × costoEntrante) / (stockViejo + qtyEntrante)
// Si no hay stock viejo o avg viejo, el nuevo avg es el costo entrante.
export function weightedAvgCost(oldStock, oldAvgCost, incomingQty, incomingCost) {
  const os = Math.max(0, Number(oldStock) || 0);
  const oa = Math.max(0, Number(oldAvgCost) || 0);
  const iq = Math.max(0, Number(incomingQty) || 0);
  const ic = Math.max(0, Number(incomingCost) || 0);
  const totalQty = os + iq;
  if (totalQty === 0) return ic;
  // Si no teníamos avg previo, arranca del costo entrante para el stock viejo
  const effectiveOld = oa > 0 ? oa : ic;
  return Math.round(((os * effectiveOld + iq * ic) / totalQty) * 10000) / 10000;
}

// Aplica los items de un pedido verificado a los costos de los productos.
// Devuelve un NUEVO array de productos con avgCostUSDT actualizado.
// items: [{ productId, qty, unitCostUSDT }]
export function applyPurchaseCosts(products, items) {
  if (!Array.isArray(items) || items.length === 0) return products;
  const byProduct = {};
  items.forEach(it => {
    if (!it.productId) return;
    if (!byProduct[it.productId]) byProduct[it.productId] = { qty: 0, costSum: 0 };
    const qty = Number(it.qty) || 0;
    const cost = Number(it.unitCostUSDT) || 0;
    byProduct[it.productId].qty += qty;
    byProduct[it.productId].costSum += qty * cost;
  });
  return products.map(p => {
    const incoming = byProduct[p.id];
    if (!incoming || incoming.qty === 0) return p;
    const incomingAvgCost = incoming.costSum / incoming.qty;
    const newAvg = weightedAvgCost(p.stock || 0, p.avgCostUSDT, incoming.qty, incomingAvgCost);
    return { ...p, avgCostUSDT: newAvg };
  });
}

// ============================================================================
// VALUACIÓN DE INVENTARIO
// ============================================================================

// Valor del stock actual a costo y a precio de venta.
//   atCostUSDT/ARS: lo que costó el inventario que tenés
//   atSaleARS: lo que vale a precio de venta
//   potentialProfitARS: ganancia latente si vendés todo
export function valuateInventory(products, exchangeRate) {
  const rate = safeRate(exchangeRate) || 0;
  let units = 0, atCostUSDT = 0, atSaleARS = 0, withCostCount = 0, total = 0;
  (products || []).forEach(p => {
    if (!p || p.isDeleted) return;
    const stock = Number(p.stock) || 0;
    if (stock <= 0) return;
    total += 1;
    units += stock;
    const costUSDT = getProductCostUSDT(p);
    if (costUSDT > 0) withCostCount += 1;
    atCostUSDT += stock * costUSDT;
    const priceARS = Number(p.priceARS) || (Number(p.priceUSD) || 0) * rate;
    atSaleARS += stock * priceARS;
  });
  const atCostARS = atCostUSDT * rate;
  const potentialProfitARS = atSaleARS - atCostARS;
  return {
    units,
    productsWithStock: total,
    atCostUSDT: Math.round(atCostUSDT * 100) / 100,
    atCostARS: Math.round(atCostARS),
    atSaleARS: Math.round(atSaleARS),
    potentialProfitARS: Math.round(potentialProfitARS),
    potentialMarginPct: atSaleARS > 0 ? Math.round((potentialProfitARS / atSaleARS) * 1000) / 10 : 0,
    costCoverage: total > 0 ? Math.round((withCostCount / total) * 100) : 0, // % de productos con costo cargado
  };
}

// ============================================================================
// COGS (COSTO DE LO VENDIDO) + MÁRGENES
// ============================================================================

// Costo unitario de un item vendido. Prioriza el snapshot al momento de la venta.
export function getSaleItemCostUSDT(item, product) {
  const snap = Number(item?.costUSDTAtSale);
  if (Number.isFinite(snap) && snap > 0) return snap;
  return getProductCostUSDT(product);
}

// COGS total de un conjunto de ventas (en ARS), usando el rate histórico de cada venta.
export function calcCOGS(sales, products, exchangeRate) {
  const productById = new Map((products || []).map(p => [p.id, p]));
  let cogs = 0;
  (sales || []).forEach(sale => {
    if (!sale || sale.isDeleted) return;
    const rate = safeRate(sale.exchangeRate || exchangeRate) || 0;
    (sale.items || []).forEach(it => {
      const product = productById.get(it.productId);
      const costUSDT = getSaleItemCostUSDT(it, product);
      const qty = Number(it.qty) || 0;
      cogs += costUSDT * qty * rate;
    });
  });
  return Math.round(cogs);
}

// Margen de una venta individual: revenue, cogs, profit, marginPct.
export function calcSaleMargin(sale, products, exchangeRate) {
  if (!sale) return null;
  const productById = new Map((products || []).map(p => [p.id, p]));
  const rate = safeRate(sale.exchangeRate || exchangeRate) || 0;
  const cur = sale.currency || "ARS";
  const revenueARS = (cur === "USD" || cur === "USDT")
    ? (Number(sale.total) || 0) * rate
    : (Number(sale.total) || 0);
  let cogs = 0;
  (sale.items || []).forEach(it => {
    const product = productById.get(it.productId);
    const costUSDT = getSaleItemCostUSDT(it, product);
    cogs += costUSDT * (Number(it.qty) || 0) * rate;
  });
  const profit = revenueARS - cogs;
  return {
    revenueARS: Math.round(revenueARS),
    cogsARS: Math.round(cogs),
    profitARS: Math.round(profit),
    marginPct: revenueARS > 0 ? Math.round((profit / revenueARS) * 1000) / 10 : 0,
  };
}

// ============================================================================
// P&L MENSUAL (ESTADO DE RESULTADOS, DEVENGADO)
// ============================================================================

// Filtra registros por mes (YYYY-MM) usando su campo date.
function inMonth(dateStr, month) {
  if (!month) return true;
  return (dateStr || "").slice(0, 7) === month;
}

// Estado de resultados devengado para un mes (o todo si month = null).
//   Ingresos − COGS = Margen bruto
//   Margen bruto − Gastos − Mermas = Resultado neto (operativo)
//
// A diferencia de calcNetProfit (caja: resta TODO lo comprado), acá el costo
// es el COGS de lo efectivamente vendido en el período.
export function buildPnL({ sales = [], expenses = [], withdrawals = [], products = [], exchangeRate = 1, month = null } = {}) {
  const monthSales = sales.filter(s => !s.isDeleted && inMonth(s.date, month));
  const monthExpenses = expenses.filter(e => !e.isDeleted && inMonth(e.date, month));
  const monthWithdrawals = withdrawals.filter(w => !w.isDeleted && inMonth(w.date, month));

  const rate = safeRate(exchangeRate) || 0;
  const productById = new Map(products.map(p => [p.id, p]));

  // Ingresos
  let revenue = 0;
  monthSales.forEach(s => {
    const r = safeRate(s.exchangeRate || exchangeRate) || 0;
    const cur = s.currency || "ARS";
    revenue += (cur === "USD" || cur === "USDT") ? (Number(s.total) || 0) * r : (Number(s.total) || 0);
  });

  // COGS
  const cogs = calcCOGS(monthSales, products, exchangeRate);

  const grossProfit = revenue - cogs;

  // Gastos
  const expensesTotal = monthExpenses.reduce((s, e) => s + (Number(e.amountARS) || 0), 0);

  // Mermas operativas (no consumo personal) — valor a costo
  let mermasARS = 0;
  monthWithdrawals.forEach(w => {
    if (w.type === "Consumo propio") return; // consumo personal va aparte
    const product = productById.get(w.productId);
    const costUSDT = getProductCostUSDT(product);
    mermasARS += costUSDT * (Number(w.qty) || 0) * rate;
  });

  const netProfit = grossProfit - expensesTotal - mermasARS;

  return {
    month,
    revenue: Math.round(revenue),
    cogs: Math.round(cogs),
    grossProfit: Math.round(grossProfit),
    grossMarginPct: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
    expensesTotal: Math.round(expensesTotal),
    mermasARS: Math.round(mermasARS),
    netProfit: Math.round(netProfit),
    netMarginPct: revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0,
    salesCount: monthSales.length,
  };
}

// ============================================================================
// FLUJO DE CAJA PROYECTADO
// ============================================================================

// Proyecta el flujo de caja para los próximos N días.
//   Entradas: ventas proyectadas = velocity diaria × precio promedio × días
//   Salidas: pedidos pendientes (no verificados) + gastos fijos prorrateados
//
// statsMap: salida de buildProductSalesStats (productIntelligence)
// purchases: para sumar pedidos pendientes
// monthlyFixedExpensesARS: gastos fijos mensuales estimados
export function projectCashFlow({
  statsMap = {},
  products = [],
  purchases = [],
  exchangeRate = 1,
  horizonDays = 30,
  monthlyFixedExpensesARS = 0,
} = {}) {
  const rate = safeRate(exchangeRate) || 0;
  const productById = new Map(products.map(p => [p.id, p]));

  // Entradas proyectadas: por cada producto, velocity × precio × días (capped al stock)
  let projectedRevenueARS = 0;
  let projectedCOGSARS = 0;
  Object.values(statsMap).forEach(stat => {
    if (!stat.product) return;
    const velocity = stat.velocity30dPerDay || 0;
    if (velocity <= 0) return;
    const stock = Number(stat.product.stock) || 0;
    const projectedUnits = Math.min(stock, velocity * horizonDays);
    const priceARS = Number(stat.product.priceARS) || (Number(stat.product.priceUSD) || 0) * rate;
    const costARS = getProductCostUSDT(stat.product) * rate;
    projectedRevenueARS += projectedUnits * priceARS;
    projectedCOGSARS += projectedUnits * costARS;
  });

  // Salidas: pedidos pendientes (no verificados)
  let pendingPurchasesARS = 0;
  (purchases || []).forEach(p => {
    if (!p || p.isDeleted || p.status === "verificado") return;
    pendingPurchasesARS += Number(p.totalCostARS) || 0;
  });

  // Gastos fijos prorrateados al horizonte
  const fixedExpensesARS = (Number(monthlyFixedExpensesARS) || 0) * (horizonDays / 30);

  const inflows = projectedRevenueARS;
  const outflows = pendingPurchasesARS + fixedExpensesARS;
  const net = inflows - outflows;

  return {
    horizonDays,
    projectedRevenueARS: Math.round(projectedRevenueARS),
    projectedCOGSARS: Math.round(projectedCOGSARS),
    projectedGrossProfitARS: Math.round(projectedRevenueARS - projectedCOGSARS),
    pendingPurchasesARS: Math.round(pendingPurchasesARS),
    fixedExpensesARS: Math.round(fixedExpensesARS),
    inflows: Math.round(inflows),
    outflows: Math.round(outflows),
    net: Math.round(net),
  };
}

// ============================================================================
// KPIs FINANCIEROS EJECUTIVOS
// ============================================================================

// Calcula KPIs clave para el dashboard financiero, sobre un set de ventas
// (típicamente el mes actual) + inventario + gastos.
export function financeKPIs({
  sales = [], expenses = [], withdrawals = [], products = [], purchases = [],
  exchangeRate = 1, month = null,
} = {}) {
  const pnl = buildPnL({ sales, expenses, withdrawals, products, exchangeRate, month });
  const inventory = valuateInventory(products, exchangeRate);

  const monthSales = sales.filter(s => !s.isDeleted && inMonth(s.date, month));
  const avgTicket = monthSales.length > 0 ? Math.round(pnl.revenue / monthSales.length) : 0;

  // Rotación de inventario (anualizada aprox): COGS período / valor inventario a costo
  const turnover = inventory.atCostARS > 0
    ? Math.round((pnl.cogs / inventory.atCostARS) * 100) / 100
    : 0;

  // ROI del período: ganancia neta / capital invertido (inventario a costo)
  const roiPct = inventory.atCostARS > 0
    ? Math.round((pnl.netProfit / inventory.atCostARS) * 1000) / 10
    : 0;

  return {
    revenue: pnl.revenue,
    cogs: pnl.cogs,
    grossProfit: pnl.grossProfit,
    grossMarginPct: pnl.grossMarginPct,
    netProfit: pnl.netProfit,
    netMarginPct: pnl.netMarginPct,
    avgTicket,
    inventoryValueCostARS: inventory.atCostARS,
    inventoryValueSaleARS: inventory.atSaleARS,
    inventoryPotentialProfitARS: inventory.potentialProfitARS,
    turnover,
    roiPct,
    salesCount: monthSales.length,
  };
}
