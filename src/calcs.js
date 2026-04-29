// Pure calculation functions extracted for testability
// Used by Partners, CashBox, Reports, Dashboard

import { CURRENCIES, isGarantia } from "./constants.js";
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
 * Socios válidos del negocio. Se usa para validar withdrawals de consumo personal
 * y evitar que se pierdan silenciosamente por typos en el campo person.
 */
export const VALID_PARTNERS = ["Diego", "Gustavo"];

export function isValidPartner(person) {
  return VALID_PARTNERS.includes(person);
}

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
 *
 * Si person no es un socio válido (typo, ej "Diegoo"), retorna 0.
 * Adicionalmente, si hay withdrawals con person inválido en consumo personal,
 * se loguea warning para que se detecte y arregle el dato.
 */
export function calcConsumoPersonalARS(withdrawals, person, exchangeRate) {
  if (!isValidPartner(person)) {
    return 0;
  }
  // Detectar withdrawals huérfanos: consumo personal con person no válido
  const orphans = withdrawals.filter(w =>
    !w.isDeleted &&
    w.withdrawType === CONSUMO_PERSONAL_TYPE &&
    !isValidPartner(w.person)
  );
  if (orphans.length > 0 && typeof console !== "undefined") {
    console.warn(
      `[calcConsumoPersonalARS] ${orphans.length} withdrawal(s) de consumo personal con person inválido:`,
      orphans.map(w => ({ id: w.id, person: w.person, date: w.date }))
    );
  }
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

/**
 * Delta para revertir el impacto de una venta sobre el balance del cliente.
 *
 * Una venta puede afectar el balance del cliente de 3 formas:
 *   - debtAmount (clientOwes): el cliente quedó debiendo → se restó del balance
 *   - creditUsed: el cliente usó crédito previo → se restó del balance
 *   - changeAmount (changeMethod=credit): se le dio crédito como vuelto → se sumó al balance
 *
 * Para REVERTIR (delete/edit), devuelvo el delta que debería SUMARSE al balance actual
 * para volver al estado pre-venta.
 *
 * Uso:
 *   newBalance = currentBalance + reverseSaleBalanceDelta(originalSale)
 *
 * Importante: esta función es pura. No muta state. El caller es quien aplica el delta.
 */
export function reverseSaleBalanceDelta(sale) {
  if (!sale) return 0;
  let delta = 0;
  if (sale.debtAmount > 0 && sale.debtDirection === "clientOwes") delta += sale.debtAmount;
  if (sale.creditUsed > 0) delta += sale.creditUsed;
  if (sale.changeAmount > 0 && sale.changeMethod === "credit") delta -= sale.changeAmount;
  return delta;
}

/**
 * Valida los datos de un withdrawal (merma) antes de persistir.
 * Devuelve null si es válido, o un string con el mensaje de error.
 *
 * Cubre las mismas reglas que Withdrawals.jsx:validate() pero pura
 * (recibe todos los inputs explícitamente). El caller pasa:
 *   - form: objeto con productId, qty, person, withdrawType, failedProductId, etc.
 *   - products: array de productos activos (para validar existencia y stock)
 *   - sales: array de ventas (para validar linkedSaleId en garantías)
 *   - clients: array de clientes (para validar linkedClientId)
 *   - today: opcional, string YYYY-MM-DD (default: hoy). Testing lo pasa fijo.
 */
/**
 * Calcula el saldo de una cuenta de caja a partir de las ventas, compras y
 * movimientos de caja. Pura, testeable, extraída de CashBox.jsx:calcBalance.
 *
 * Inputs:
 *   accountId: string — id de la cuenta (mpDiego, lemonPesos, etc.)
 *   ctx: {
 *     sales, purchases, cashMovements: arrays raw (puede incluir isDeleted, se filtran)
 *     initialBalances: { [accountId]: number }
 *     accountMethodMap: { [accountId]: (payment) => boolean }
 *     payMethodToAccountId: (method, mpAccount) => accountId
 *     normalizeType: (t) => string  (deposit→income, withdrawal→expense)
 *   }
 *
 * Devuelve el balance numérico (puede ser negativo).
 *
 * El tipo de cada movimiento se tiene en cuenta: transfer, income, expense,
 * crypto_buy (pesos→USDT), crypto_sell (USDT→pesos), conciliation_adjust.
 */
export function calcAccountBalance(accountId, ctx) {
  const {
    sales = [], purchases = [], cashMovements = [],
    initialBalances = {}, accountMethodMap = {},
    payMethodToAccountId: toAcc = () => "",
    normalizeType: normType = (t) => t,
  } = ctx || {};

  let bal = initialBalances[accountId] || 0;
  const activeSales = sales.filter(s => !s.isDeleted);
  const activePurchases = purchases.filter(p => !p.isDeleted);

  const matchFn = accountMethodMap[accountId];
  if (matchFn) {
    activeSales.forEach(sale => {
      if (sale.payments && sale.payments.length > 0) {
        sale.payments.filter(matchFn).forEach(p => { bal += Number(p.amount) || 0; });
      } else {
        const legacyPay = { method: sale.paymentMethod, mpAccount: sale.mpAccount, amount: sale.total };
        if (matchFn(legacyPay)) bal += Number(sale.total) || 0;
      }
    });

    // Vueltos: si changeMethod no es credit, descontar
    activeSales.forEach(sale => {
      if (sale.changeAmount > 0 && sale.changeMethod && sale.changeMethod !== "credit") {
        const changeAccountId = toAcc(sale.changeMethod, sale.changeMpAccount);
        if (changeAccountId && changeAccountId === accountId) bal -= Number(sale.changeAmount) || 0;
      }
    });
  }

  if (accountId === "lemonUSDT") {
    bal -= activePurchases
      .filter(p => p.status === "verificado" || !p.status)
      .reduce((s, p) => s + (p.totalUSDT || 0), 0);
  }

  const activeMovs = cashMovements.filter(m => !m.isDeleted && m.type !== "daily_close" && m.type !== "conciliation_adjust");
  activeMovs.forEach(m => {
    const t = normType(m.type);
    if (m.from === accountId) bal -= Number(m.amount) || 0;
    if (m.to === accountId) {
      if ((t === "crypto_buy" && accountId === "lemonUSDT") || (t === "crypto_sell" && accountId !== "lemonUSDT" && m.amountUSDT)) {
        bal += Number(m.amount) || 0;
      } else if (t === "crypto_buy" && accountId === "lemonUSDT") {
        bal += Number(m.amountUSDT) || 0;
      } else {
        bal += Number(m.amount) || 0;
      }
    }
  });
  // Fix: crypto_buy increases USDT on 'to' side with amountUSDT (not amount)
  cashMovements.filter(m => !m.isDeleted && normType(m.type) === "crypto_buy" && m.to === "lemonUSDT" && accountId === "lemonUSDT").forEach(m => {
    bal -= Number(m.amount) || 0;
    bal += Number(m.amountUSDT) || 0;
  });
  // Fix: crypto_sell decreases USDT on 'from' side
  cashMovements.filter(m => !m.isDeleted && normType(m.type) === "crypto_sell" && m.from === "lemonUSDT" && accountId === "lemonUSDT").forEach(m => {
    bal += Number(m.amount) || 0;
    bal -= Number(m.amountUSDT) || 0;
  });

  // Conciliation adjustments
  cashMovements.filter(m => !m.isDeleted && m.type === "conciliation_adjust" && m.account === accountId).forEach(m => {
    bal += Number(m.delta) || 0;
  });
  return bal;
}

export function validateWithdrawalForm(form, products = [], sales = [], clients = [], today = null) {
  if (!form) return "Formulario vacío";
  if (!form.productId) return "Seleccioná un producto";
  const prod = products.find(p => p.id === form.productId);
  if (!prod) return "El producto seleccionado no existe";
  if (!form.person) return "Indicá quién (Diego o Gustavo)";
  if (!form.withdrawType) return "Indicá el tipo de merma";
  const qty = Number(form.qty);
  if (!qty || qty <= 0) return "La cantidad debe ser mayor a 0";
  if (qty > (prod.stock || 0)) {
    return `Stock insuficiente: ${prod.brand} ${prod.model} - ${prod.flavor}. Disponible: ${prod.stock}`;
  }
  if (isGarantia(form.withdrawType) && form.linkedSaleId) {
    const linkedSale = (sales || []).find(s => s.id === form.linkedSaleId && !s.isDeleted);
    if (!linkedSale) return "La venta vinculada no existe o fue eliminada";
    // B6: si se eligió un failedProductId, verificar que la venta linkeada lo contenga.
    // Previene garantías sobre productos que el cliente nunca compró en esa venta.
    if (form.failedProductId) {
      const hasProduct = (linkedSale.items || []).some(it => it.productId === form.failedProductId);
      if (!hasProduct) return "El producto fallido no aparece en la venta linkeada";
    }
  }
  if (isGarantia(form.withdrawType)) {
    if (!form.failedProductId) return "Indicá qué producto falló (el que trajo el cliente)";
    const failedProd = products.find(p => p.id === form.failedProductId);
    if (!failedProd) return "El producto fallido indicado no existe";
    if (!form.failureReason) return "Indicá la razón del fallo";
    if (form.failureReason === "Otro" && (form.failureNotes || "").trim().length < 5) {
      return "Describí brevemente qué pasó (mín. 5 caracteres)";
    }
  }
  if (form.linkedClientId) {
    const linkedClient = (clients || []).find(c => c.id === form.linkedClientId);
    if (!linkedClient) return "El cliente vinculado no existe";
  }
  if (form.date) {
    const ref = today || new Date().toISOString().slice(0, 10);
    if (form.date > ref) return "No se permiten fechas futuras";
  }
  return null;
}

/**
 * Devuelve true si el mes (YYYY-MM) ya tiene un closure registrado.
 * Usado por Sales/Purchases/Expenses para advertir/bloquear ediciones de meses
 * cerrados, así los snapshots de cierres se mantienen consistentes con el dato.
 */
export function isMonthClosed(monthlyClosures, month) {
  if (!month || !Array.isArray(monthlyClosures)) return false;
  return monthlyClosures.some(c => c && !c.isDeleted && c.month === month);
}

/**
 * Devuelve true si la fecha (string YYYY-MM-DD o ISO) cae en un mes con closure.
 * Wrapper de isMonthClosed que acepta el `date` directamente.
 */
export function isDateInClosedMonth(monthlyClosures, date) {
  if (!date) return false;
  const month = String(date).slice(0, 7);
  return isMonthClosed(monthlyClosures, month);
}

/**
 * Filtra una colección por mes en formato "YYYY-MM" sobre el campo `date`.
 * Función helper interna usada por calcMonthSummary.
 */
function filterByMonth(items, month, dateField = "date") {
  if (!Array.isArray(items)) return [];
  return items.filter(item => {
    if (!item || item.isDeleted) return false;
    const d = item[dateField];
    if (!d) return false;
    return String(d).slice(0, 7) === month;
  });
}

/**
 * calcMonthSummary — fuente única de verdad para los totales mensuales del negocio.
 *
 * Calcula TODOS los métricos relevantes de un mes (revenue, costos, gastos, mermas
 * separadas por tipo, ganancia operativa vs total) usando la lógica oficial.
 *
 * IMPORTANTE: esta función reemplaza los cálculos duplicados que existían en:
 *   - Closures.jsx:calcMonthData (resta TODAS las mermas, inflando "pérdida")
 *   - Reports.jsx (varias secciones con filter inline)
 *   - Dashboard.jsx (monthRevenue, monthExpenses, etc)
 *
 * Definiciones contables (alineadas con calcPartnerBalances):
 *   - mermasComunes  = consumo NO personal (garantías, regalos, canjes, etc)
 *   - consumoPersonal = sumado por socio, NO afecta el pozo común
 *   - netProfitOperativo = revenue - costs - expenses - mermasComunes
 *       (es lo que se reparte 50/50 — coincide con netProfitComun de Partners)
 *   - netProfitTotal = netProfitOperativo - consumoPersonalDiego - consumoPersonalGustavo
 *       (ganancia total del negocio descontando incluso lo que los socios
 *        consumieron personalmente — útil para reportes de eficiencia)
 *
 * @param {string} month — "YYYY-MM"
 * @param {object} ctx — { sales, purchases, expenses, withdrawals, products, exchangeRate }
 * @returns {object} todos los totales (ver shape al final de la función)
 */
export function calcMonthSummary(month, ctx) {
  const {
    sales = [], purchases = [], expenses = [], withdrawals = [],
    products = [], exchangeRate = 1,
  } = ctx || {};

  const monthSales = filterByMonth(sales, month);
  const monthPurchases = filterByMonth(purchases, month);
  const monthExpenses = filterByMonth(expenses, month);
  const monthWithdrawals = filterByMonth(withdrawals, month);

  // ---- Ventas ----
  const totalSalesCount = monthSales.length;
  const totalUnits = monthSales.reduce(
    (s, sale) => s + (sale.items || []).reduce((s2, i) => s2 + (Number(i.qty) || 0), 0),
    0
  );
  const totalRevenue = calcTotalRevenue(monthSales, exchangeRate);
  const totalDiscounts = monthSales.reduce((s, sale) => s + (sale.discountAmount || 0), 0);
  const totalExtras = monthSales.reduce((s, sale) => s + (sale.extrasTotal || 0), 0);

  // ---- Compras ----
  const totalCostUSDT = monthPurchases.reduce((s, p) => s + (p.totalUSDT || 0), 0);
  const totalPasero = monthPurchases.reduce((s, p) => s + (p.paseroCostARS || 0), 0);
  const totalEnvio = monthPurchases.reduce((s, p) => s + (p.envioCostARS || 0), 0);
  // Costo total ARS: usa totalCostARS si está poblado (datos nuevos), sino calcula
  const totalCostARS = monthPurchases.reduce((s, p) => {
    if (p.totalCostARS) return s + p.totalCostARS;
    return s + Math.round((p.totalUSDT || 0) * safeRate(exchangeRate)) + (p.paseroCostARS || 0) + (p.envioCostARS || 0);
  }, 0);

  // ---- Gastos ----
  const totalExpensesARS = calcTotalExpenses(monthExpenses);

  // ---- Mermas (separadas) ----
  const mermasComunesUSD = monthWithdrawals
    .filter(w => w.withdrawType !== CONSUMO_PERSONAL_TYPE)
    .reduce((s, w) => s + Number(w.costRealUSD || w.costEstimateUSD || 0), 0);
  const consumoDiegoUSD = monthWithdrawals
    .filter(w => w.withdrawType === CONSUMO_PERSONAL_TYPE && w.person === "Diego")
    .reduce((s, w) => s + Number(w.costRealUSD || w.costEstimateUSD || 0), 0);
  const consumoGustavoUSD = monthWithdrawals
    .filter(w => w.withdrawType === CONSUMO_PERSONAL_TYPE && w.person === "Gustavo")
    .reduce((s, w) => s + Number(w.costRealUSD || w.costEstimateUSD || 0), 0);

  const rate = safeRate(exchangeRate);
  const mermasComunesARS = Math.round(mermasComunesUSD * rate);
  const consumoDiegoARS = Math.round(consumoDiegoUSD * rate);
  const consumoGustavoARS = Math.round(consumoGustavoUSD * rate);
  const consumoPersonalARS = consumoDiegoARS + consumoGustavoARS;
  const totalConsumoUSD = mermasComunesUSD + consumoDiegoUSD + consumoGustavoUSD;
  const totalConsumoARS = mermasComunesARS + consumoPersonalARS;
  const totalConsumoUnits = monthWithdrawals.reduce((s, w) => s + (Number(w.qty) || 0), 0);

  // ---- Ganancia (definiciones consistentes con Partners) ----
  // OPERATIVO: lo que va al pozo común (50/50). NO incluye consumo personal.
  const netProfitOperativo = totalRevenue - totalCostARS - totalExpensesARS - mermasComunesARS;
  // TOTAL: ganancia neta del negocio descontando todo (incluyendo consumo personal).
  const netProfitTotal = netProfitOperativo - consumoPersonalARS;
  const marginPctOperativo = totalRevenue > 0
    ? Math.round((netProfitOperativo / totalRevenue) * 100)
    : 0;
  const marginPctTotal = totalRevenue > 0
    ? Math.round((netProfitTotal / totalRevenue) * 100)
    : 0;

  // ---- Stock (snapshot) ----
  const stockTotal = (products || []).reduce((s, p) => s + (p.stock || 0), 0);
  const stockValue = (products || []).reduce((s, p) => s + (p.stock || 0) * (p.priceUSD || 0), 0);

  return {
    // Identificación
    month,

    // Ventas
    totalSalesCount,
    totalUnits,
    totalRevenue,
    totalDiscounts,
    totalExtras,

    // Compras y costos
    totalCostUSDT,
    totalCostARS,
    totalPasero,
    totalEnvio,
    purchasesCount: monthPurchases.length,

    // Gastos operativos
    totalExpensesARS,
    expensesCount: monthExpenses.length,

    // Mermas (separadas)
    mermasComunesUSD,
    mermasComunesARS,
    consumoDiegoUSD,
    consumoDiegoARS,
    consumoGustavoUSD,
    consumoGustavoARS,
    consumoPersonalARS,
    totalConsumoUSD,
    totalConsumoARS,
    totalConsumoUnits,

    // Ganancia (dos vistas)
    netProfitOperativo,    // lo que se reparte 50/50 — alineado con Partners.netProfitComun
    netProfitTotal,        // ganancia descontando consumo personal
    marginPctOperativo,
    marginPctTotal,

    // Compat: campos con nombres antiguos (Closures legacy)
    netProfitARS: netProfitOperativo,  // ⚠️ antes restaba TODAS las mermas; ahora alineado
    marginPct: marginPctOperativo,
    totalConsumo: totalConsumoUnits,

    // Stock snapshot
    stockTotal,
    stockValue,
  };
}
