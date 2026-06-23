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
 * Personas válidas para registrar consumo personal / ser socio del negocio.
 * Diego y Gustavo son socios 50/50 (Gustavo volvió el 2026-06-22). Esta lista
 * valida el campo `person` en withdrawals y partnerWithdrawals y evita typos.
 */
export const VALID_PARTNERS = ["Diego", "Gustavo"];

export function isValidPartner(person) {
  return VALID_PARTNERS.includes(person);
}

/**
 * Fecha de reincorporación de Gustavo como socio (formato YYYY-MM-DD).
 * La ganancia del POZO COMÚN se reparte así:
 *   - Transacciones ANTES de esta fecha → 100% Diego (era de dueño único).
 *   - Transacciones DESDE esta fecha (inclusive) → 50/50 Diego/Gustavo.
 * El consumo personal y los retiros de capital reducen el balance de cada
 * socio individualmente, sin importar la era.
 */
export const PARTNERSHIP_START = "2026-06-22";

/** Porcentaje del pozo común de la era-sociedad que le toca a cada socio. */
export const PARTNER_SPLIT = 0.5;

/**
 * ¿La transacción cae en la "era sociedad" (fecha >= corte)?
 * Los registros guardan `date` como string "YYYY-MM-DD…", así que comparar
 * los primeros 10 chars contra el corte es un orden lexicográfico correcto.
 * Registros sin fecha se tratan como pre-sociedad (100% Diego), que es el
 * default seguro para datos viejos.
 */
export function isPartnershipEra(record, startDate = PARTNERSHIP_START) {
  return String(record?.date || "").slice(0, 10) >= startDate;
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
 * Suma del costo de consumo PERSONAL de Diego (único dueño).
 * Lo que él se fumó/usó individualmente. Devuelve ARS.
 *
 * Si person no es válido (typo, ej "Diegoo"), retorna 0.
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
 * Calcula el balance de cada socio (Diego + Gustavo, 50/50 desde PARTNERSHIP_START).
 *
 * El pozo común (revenue - costs - expenses - mermasComunes) se parte en dos eras:
 *   - era SOLO (transacciones antes del corte) → 100% Diego.
 *   - era SOCIEDAD (transacciones desde el corte) → 50/50.
 * Reparto del pozo:
 *   diegoPoolShare   = poolSolo + poolSociedad * 0.5
 *   gustavoPoolShare = poolSociedad * 0.5
 * Cada socio resta su propio consumo personal y sus retiros de capital:
 *   diegoBalance   = diegoPoolShare   - consumoDiego   - retirosDiego
 *   gustavoBalance = gustavoPoolShare - consumoGustavo - retirosGustavo
 *
 * @param {string} partnershipStart — corte YYYY-MM-DD (default PARTNERSHIP_START).
 *   Permite override en tests y futura configurabilidad.
 */
export function calcPartnerBalances(sales, purchases, expenses, withdrawals, partnerWithdrawals, exchangeRate, partnershipStart = PARTNERSHIP_START) {
  const inEra = (r) => isPartnershipEra(r, partnershipStart);

  // Pozo común por era. Reusa los helpers puros sobre los subconjuntos filtrados.
  const poolFor = (s, p, e, w) =>
    calcTotalRevenue(s, exchangeRate)
    - calcTotalCosts(p)
    - calcTotalExpenses(e)
    - calcMermasComunesARS(w, exchangeRate);

  const poolSolo = poolFor(
    (sales || []).filter(s => !inEra(s)),
    (purchases || []).filter(p => !inEra(p)),
    (expenses || []).filter(e => !inEra(e)),
    (withdrawals || []).filter(w => !inEra(w)),
  );
  const poolSociedad = poolFor(
    (sales || []).filter(s => inEra(s)),
    (purchases || []).filter(p => inEra(p)),
    (expenses || []).filter(e => inEra(e)),
    (withdrawals || []).filter(w => inEra(w)),
  );

  // Totales del período (sin partir) — para compat con consumers existentes.
  const revenue = calcTotalRevenue(sales, exchangeRate);
  const costs = calcTotalCosts(purchases);
  const expensesTotal = calcTotalExpenses(expenses);
  const mermasComunes = calcMermasComunesARS(withdrawals, exchangeRate);
  const netProfitComun = poolSolo + poolSociedad; // == revenue - costs - expenses - mermasComunes

  const consumoDiego = calcConsumoPersonalARS(withdrawals, "Diego", exchangeRate);
  const consumoGustavo = calcConsumoPersonalARS(withdrawals, "Gustavo", exchangeRate);

  // Retiros de capital (partnerWithdrawals) por socio, normalizados a ARS.
  const rateForWithdrawals = safeRate(exchangeRate);
  const sumWithdrawals = (person) => (partnerWithdrawals || [])
    .filter(w => !w.isDeleted && w.person === person)
    .reduce((sum, w) => {
      if (w.currency === "USD" || w.currency === "USDT") return sum + w.amount * rateForWithdrawals;
      return sum + w.amount;
    }, 0);
  const diegoTotal = sumWithdrawals("Diego");
  const gustavoTotal = sumWithdrawals("Gustavo");

  // Reparto del pozo: Diego se lleva todo lo de la era solo + su mitad de la sociedad.
  const diegoPoolShare = poolSolo + poolSociedad * PARTNER_SPLIT;
  const gustavoPoolShare = poolSociedad * (1 - PARTNER_SPLIT);

  return {
    // Pozo común
    revenue,
    costs,
    expensesTotal,
    mermasComunes,
    netProfitComun,
    poolSolo,        // ganancia pre-sociedad (100% Diego)
    poolSociedad,    // ganancia era-sociedad (se reparte 50/50)
    halfProfit: gustavoPoolShare, // la "mitad" repartible que le toca a cada socio en la sociedad

    // Diego
    consumoDiego,
    diegoTotal,
    diegoPoolShare,
    diegoBalance: diegoPoolShare - consumoDiego - diegoTotal,

    // Gustavo
    consumoGustavo,
    gustavoTotal,
    gustavoPoolShare,
    gustavoBalance: gustavoPoolShare - consumoGustavo - gustavoTotal,

    totalWithdrawn: diegoTotal + gustavoTotal,

    // Compat con código existente
    netProfit: netProfitComun - consumoDiego - consumoGustavo,
    profitRemaining: netProfitComun - diegoTotal - gustavoTotal,
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
  if (!form.person) return "Indicá quién consumió (Diego)";
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
 * S14.12 — Rate efectivo USDT → ARS para un cashMovement crypto.
 *
 * Cuando hay spread real entre USD blue y USDT (ej: Lemon cobra fee al comprar
 * USDT), un crypto_buy registrado podría tener su propio rate distinto del blue
 * general. Este helper devuelve el rate efectivo:
 *   - Si el movement tiene `rateUSDT` explícito (campo nuevo opcional), úsalo.
 *   - Sino, deriva el rate del propio movement: amount ARS / amountUSDT.
 *   - Sino, fallback al rate global (que es blue, ARS/USD).
 *
 * Pure function — no muta state.
 */
export function getEffectiveUSDTRate(movement, fallbackRate) {
  if (!movement) return safeRate(fallbackRate);
  if (movement.rateUSDT && Number(movement.rateUSDT) > 0) {
    return Number(movement.rateUSDT);
  }
  // Derivar del propio movement crypto: si compré 100 USDT por 140000 ARS,
  // el rate efectivo fue 1400 ARS/USDT.
  const a = Number(movement.amount) || 0;
  const u = Number(movement.amountUSDT) || 0;
  if (a > 0 && u > 0 && (movement.type === "crypto_buy" || movement.type === "crypto_sell")) {
    return a / u;
  }
  return safeRate(fallbackRate);
}

/**
 * S14.14 — Migration de ventas legacy sin campo exchangeRate.
 *
 * Devuelve un NUEVO array de ventas donde a las que les falta exchangeRate
 * se les asigna `fallbackRate` para que no se revalúen al rate actual.
 * Útil para correr UNA VEZ desde consola del navegador:
 *
 *   import { migrateLegacySales } from "./calcs.js";
 *   const fixed = migrateLegacySales(sales, 1200); // rate de cuando se hicieron
 *   setSales(fixed); // o pegar el resultado vía Firestore admin
 *
 * No muta el array original. No persiste — el caller decide qué hacer con el output.
 */
export function migrateLegacySales(sales, fallbackRate) {
  if (!Array.isArray(sales)) return [];
  const rate = safeRate(fallbackRate);
  if (rate <= 0) {
    console.warn("[migrateLegacySales] fallbackRate inválido, no se migrarán ventas USD/USDT");
  }
  let count = 0;
  const result = sales.map(sale => {
    if (!sale) return sale;
    if (sale.exchangeRate) return sale; // ya tiene rate
    const cur = sale.currency || "ARS";
    if (cur === "ARS") return sale; // no necesita rate
    count++;
    return { ...sale, exchangeRate: rate, _migrated: true };
  });
  if (typeof console !== "undefined") {
    console.log(`[migrateLegacySales] Marcadas ${count} ventas legacy con rate=${rate}`);
  }
  return result;
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
 *   - consumoPersonalDiego = lo que Diego se fumó, NO afecta el pozo operativo
 *   - netProfitOperativo = revenue - costs - expenses - mermasComunes
 *       (ganancia operativa, alineada con netProfitComun de calcPartnerBalances)
 *   - netProfitTotal = netProfitOperativo - consumoPersonal (Diego + Gustavo)
 *       (ganancia total descontando lo que cada socio consumió personalmente)
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

  // ---- Ganancia ----
  // OPERATIVO: revenue - costs - expenses - mermas comunes. No incluye consumo personal.
  const netProfitOperativo = totalRevenue - totalCostARS - totalExpensesARS - mermasComunesARS;
  // TOTAL: descontando además el consumo personal de Diego.
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
    netProfitOperativo,    // alineado con calcPartnerBalances.netProfitComun
    netProfitTotal,        // ganancia descontando consumo personal de Diego
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
