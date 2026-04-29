// src/pricing.js
//
// Funciones PURAS de pricing y promos. Sin state. Reciben datos por
// argumento y devuelven estructuras predecibles. Testeables en aislamiento.
//
// Responsabilidades:
//   - Schema y operaciones de cupones (validación, aplicación)
//   - Descuentos automáticos por volumen
//   - Descuentos por tier de cliente
//   - Pricing dinámico por canal
//   - Calculadora de margen guard ("¿hasta cuánto puedo descontar?")
//   - Auto-clearance por expiry
//   - Detector de candidatos a promo
//   - Sugeridor de liquidación con escenarios
//
// Consumido por:
//   - Sales.jsx (auto-aplicar volumen/tier/canal/clearance + cupones)
//   - Products.jsx (margin guard preview + alerta margen)
//   - Reports.jsx (sensibilidad + analytics promos)
//   - Coupons.jsx (CRUD)

import { safeRate } from "./helpers.js";

const MS_PER_DAY = 86400000;

// =====================================================================
// CUPONES (S16.1)
// =====================================================================
//
// Schema de coupon:
//   {
//     id: string,
//     code: string (case-insensitive en lookup),
//     description: string,
//     discountType: "percent" | "fixed",
//     discountValue: number (% o $ ARS),
//     validFrom: ISO string (opcional, default=created),
//     validTo: ISO string (opcional, default=indefinido),
//     maxUses: number (opcional, default=Infinity),
//     usedCount: number (default=0),
//     audience: "all" | "vip" | "specific",
//     audienceClientIds: string[] (cuando audience=specific),
//     minSubtotalARS: number (opcional, default=0),
//     onlyFirstPurchase: boolean (opcional, default=false),
//     isDeleted: boolean,
//     createdAt: ISO,
//     createdBy: string,
//   }

export const COUPON_AUDIENCES = ["all", "vip", "specific"];

/**
 * Normaliza un código de cupón para lookup case-insensitive y sin espacios.
 */
export function normalizeCouponCode(code) {
  return String(code || "").trim().toUpperCase();
}

/**
 * Encuentra un cupón por código (case-insensitive). Filtra eliminados.
 */
export function findCouponByCode(coupons, code) {
  const norm = normalizeCouponCode(code);
  if (!norm) return null;
  return (coupons || []).find(
    c => c && !c.isDeleted && normalizeCouponCode(c.code) === norm
  ) || null;
}

/**
 * Valida si un cupón se puede aplicar a una venta dada.
 * Devuelve { ok: bool, reason?: string }.
 *
 * @param {object} coupon
 * @param {object} ctx — { subtotalARS, client?, isFirstPurchase?, today?: ISO }
 */
export function validateCoupon(coupon, ctx = {}) {
  if (!coupon) return { ok: false, reason: "Cupón no encontrado" };
  if (coupon.isDeleted) return { ok: false, reason: "Cupón eliminado" };
  const today = ctx.today ? new Date(ctx.today) : new Date();
  if (coupon.validFrom && new Date(coupon.validFrom) > today) {
    return { ok: false, reason: `Cupón válido desde ${String(coupon.validFrom).slice(0, 10)}` };
  }
  if (coupon.validTo && new Date(coupon.validTo) < today) {
    return { ok: false, reason: "Cupón vencido" };
  }
  if (coupon.maxUses && (coupon.usedCount || 0) >= coupon.maxUses) {
    return { ok: false, reason: "Cupón ya alcanzó el máximo de usos" };
  }
  if (coupon.minSubtotalARS && ctx.subtotalARS != null && ctx.subtotalARS < coupon.minSubtotalARS) {
    return { ok: false, reason: `Mínimo de compra: ${coupon.minSubtotalARS} ARS` };
  }
  if (coupon.onlyFirstPurchase && ctx.isFirstPurchase === false) {
    return { ok: false, reason: "Solo válido para primera compra" };
  }
  if (coupon.audience === "vip") {
    if (!ctx.client || ctx.client.tier !== "vip") {
      return { ok: false, reason: "Solo para clientes VIP" };
    }
  }
  if (coupon.audience === "specific") {
    if (!ctx.client || !(coupon.audienceClientIds || []).includes(ctx.client.id)) {
      return { ok: false, reason: "Cupón asignado a cliente específico" };
    }
  }
  return { ok: true };
}

/**
 * Calcula el descuento $ que aplica un cupón sobre un subtotal.
 * Devuelve 0 si el cupón no es válido o no aplica.
 */
export function calcCouponDiscount(coupon, subtotalARS) {
  if (!coupon || subtotalARS <= 0) return 0;
  if (coupon.discountType === "percent") {
    return Math.round(subtotalARS * (Number(coupon.discountValue) || 0) / 100);
  }
  if (coupon.discountType === "fixed") {
    return Math.min(Math.round(Number(coupon.discountValue) || 0), subtotalARS);
  }
  return 0;
}

// =====================================================================
// DESCUENTOS POR VOLUMEN (S16.3)
// =====================================================================

/**
 * Reglas default de descuento por volumen.
 * Configurable vía settings (S14: settings.js puede sobrescribir).
 */
export const DEFAULT_VOLUME_DISCOUNTS = [
  { minQty: 5, discountPct: 5 },
  { minQty: 10, discountPct: 10 },
  { minQty: 20, discountPct: 15 },
];

/**
 * Calcula descuento % que aplica por volumen total de items.
 * Devuelve la regla más generosa que aplica.
 *
 * @param {number} totalQty — suma de qty de todos los items
 * @param {Array} rules — array de { minQty, discountPct } (default DEFAULT_VOLUME_DISCOUNTS)
 */
export function calcVolumeDiscountPct(totalQty, rules = DEFAULT_VOLUME_DISCOUNTS) {
  if (!totalQty || totalQty <= 0) return 0;
  const sorted = [...(rules || [])].sort((a, b) => b.minQty - a.minQty);
  for (const r of sorted) {
    if (totalQty >= r.minQty) return r.discountPct;
  }
  return 0;
}

// =====================================================================
// DESCUENTOS POR TIER DE CLIENTE (S16.9)
// =====================================================================

/**
 * Default tier discounts. Cliente.tier puede ser "regular", "vip", "diamante".
 * El tier "regular" no tiene descuento.
 */
export const DEFAULT_TIER_DISCOUNTS = {
  regular: 0,
  vip: 5,
  diamante: 10,
};

export function calcTierDiscountPct(client, tierMap = DEFAULT_TIER_DISCOUNTS) {
  if (!client) return 0;
  const tier = (client.tier || "regular").toLowerCase();
  return Number(tierMap[tier]) || 0;
}

// =====================================================================
// DESCUENTO FIDELIZACIÓN (S16.19)
// =====================================================================

/**
 * Si el cliente compró ≥N veces este mes, aplicar descuento fidelización.
 * Devuelve % de descuento.
 *
 * @param {object} client
 * @param {Array} sales — todas las ventas (para contar las del mes)
 * @param {object} options — { minPurchasesThisMonth=10, discountPct=5 }
 */
export function calcLoyaltyDiscountPct(client, sales, options = {}) {
  const { minPurchasesThisMonth = 10, discountPct = 5 } = options;
  if (!client || !client.id) return 0;
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const count = (sales || []).filter(s =>
    s && !s.isDeleted &&
    s.clientId === client.id &&
    String(s.date || "").slice(0, 7) === thisMonth
  ).length;
  return count >= minPurchasesThisMonth ? discountPct : 0;
}

// =====================================================================
// PRICING POR CANAL (S16.2)
// =====================================================================

/**
 * Resuelve el precio efectivo de un producto según el canal de venta.
 * Si el producto tiene priceByChannel.{channel}, lo usa. Sino, fallback a priceUSD/priceARS.
 *
 * Schema de producto:
 *   product.priceByChannel = { mp: 12, presencial: 10, ml: 13, instagram: 11, whatsapp: 11 }
 *
 * @param {object} product
 * @param {string} channel — uno de: WhatsApp, Instagram, Delivery, Presencial, MercadoLibre
 * @param {string} currency — "ARS" o "USD"
 */
export function resolveChannelPrice(product, channel, currency = "USD") {
  if (!product) return 0;
  const channelKey = String(channel || "").toLowerCase().replace(/\s+/g, "");
  const map = product.priceByChannel || {};
  // Mapear nombres de canal a claves comunes
  const aliases = {
    whatsapp: ["whatsapp", "wa"],
    instagram: ["instagram", "ig"],
    presencial: ["presencial"],
    delivery: ["delivery"],
    mercadolibre: ["mercadolibre", "ml"],
  };
  // Si el channel matchea algún alias, busca en map por la clave canónica
  for (const [canonical, list] of Object.entries(aliases)) {
    if (list.includes(channelKey)) {
      const v = map[canonical];
      if (v && Number(v) > 0) return Number(v);
    }
  }
  // Fallback: precio default
  if (currency === "ARS") return Number(product.priceARS) || 0;
  return Number(product.priceUSD) || 0;
}

/**
 * Determina si el canal tiene override de precio configurado para un producto.
 * Útil para mostrar badge "Precio canal: $X" en UI.
 */
export function hasChannelPriceOverride(product, channel) {
  if (!product || !channel) return false;
  const channelKey = String(channel).toLowerCase().replace(/\s+/g, "");
  const map = product.priceByChannel || {};
  const aliases = {
    whatsapp: ["whatsapp", "wa"],
    instagram: ["instagram", "ig"],
    presencial: ["presencial"],
    delivery: ["delivery"],
    mercadolibre: ["mercadolibre", "ml"],
  };
  for (const [canonical, list] of Object.entries(aliases)) {
    if (list.includes(channelKey)) {
      const v = map[canonical];
      return v != null && Number(v) > 0;
    }
  }
  return false;
}

// =====================================================================
// MARGIN GUARD CALCULATOR (S16.4)
// =====================================================================

/**
 * Calcula el precio mínimo (en USD) para mantener un margen objetivo.
 *
 *   minPrice = costUSDT / (1 - targetMarginPct/100)
 *
 * Devuelve { minPrice, maxDiscountPct, currentMarginPct } o null si no hay datos.
 *
 * @param {object} product
 * @param {number} targetMarginPct — margen mínimo deseado (ej: 30 = 30%)
 */
export function calcMarginGuard(product, targetMarginPct) {
  if (!product) return null;
  const price = Number(product.priceUSD) || 0;
  const cost = Number(product.costUSDT) || 0;
  if (price <= 0 || cost <= 0) return null;
  const target = Number(targetMarginPct) || 0;
  if (target >= 100) return null; // imposible
  const minPrice = cost / (1 - target / 100);
  const currentMarginPct = ((price - cost) / price) * 100;
  // Descuento máximo que puedo aplicar manteniendo el target
  const maxDiscountPct = price > 0 ? Math.max(0, ((price - minPrice) / price) * 100) : 0;
  return {
    minPrice: Math.round(minPrice * 100) / 100,
    maxDiscountPct: Math.round(maxDiscountPct * 10) / 10,
    currentMarginPct: Math.round(currentMarginPct * 10) / 10,
    currentPrice: price,
    cost,
  };
}

// =====================================================================
// AUTO-CLEARANCE POR EXPIRY (S16.7)
// =====================================================================

/**
 * Calcula descuento sugerido por proximidad de vencimiento.
 *
 *   < 30 días → 5%
 *   < 14 días → 15%
 *   <  7 días → 25%
 *   vencido  → 40% o liquidar
 *
 * Devuelve { discountPct, reason, daysLeft } o null si no aplica.
 */
export function calcExpiryDiscountPct(product, today = new Date()) {
  if (!product || !product.expiryDate) return null;
  const expiry = new Date(product.expiryDate);
  if (isNaN(expiry.getTime())) return null;
  const daysLeft = Math.floor((expiry.getTime() - today.getTime()) / MS_PER_DAY);
  if (daysLeft < 0) {
    return { discountPct: 40, reason: `Vencido hace ${Math.abs(daysLeft)} días — liquidar urgente`, daysLeft };
  }
  if (daysLeft < 7) return { discountPct: 25, reason: `Vence en ${daysLeft}d`, daysLeft };
  if (daysLeft < 14) return { discountPct: 15, reason: `Vence en ${daysLeft}d`, daysLeft };
  if (daysLeft < 30) return { discountPct: 5, reason: `Vence en ${daysLeft}d`, daysLeft };
  return null;
}

// =====================================================================
// ÚLTIMA UNIDAD (S16.11)
// =====================================================================

/**
 * Si el stock es exactamente 1, sugerir descuento "última unidad".
 * Devuelve { discountPct, reason } o null.
 */
export function calcLastUnitDiscount(product, options = {}) {
  const { discountPct = 10 } = options;
  if (!product) return null;
  if (Number(product.stock) === 1) {
    return { discountPct, reason: "Última unidad — empuje final" };
  }
  return null;
}

// =====================================================================
// ALERTA MARGEN BAJO (S16.8)
// =====================================================================

/**
 * Identifica productos con margen bajo respecto a thresholds.
 * Devuelve array de { product, marginPct, severity }.
 *
 *   severity "danger" si margen < dangerPct (default 15)
 *   severity "warning" si margen < warningPct (default 25)
 */
export function findLowMarginProducts(products, options = {}) {
  const { dangerPct = 15, warningPct = 25 } = options;
  return (products || [])
    .filter(p => p && !p.isDeleted)
    .map(p => {
      const price = Number(p.priceUSD) || 0;
      const cost = Number(p.costUSDT) || 0;
      if (price <= 0 || cost <= 0) return null;
      const marginPct = ((price - cost) / price) * 100;
      let severity = null;
      if (marginPct < dangerPct) severity = "danger";
      else if (marginPct < warningPct) severity = "warning";
      if (!severity) return null;
      return {
        product: p,
        marginPct: Math.round(marginPct * 10) / 10,
        severity,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.marginPct - b.marginPct);
}

// =====================================================================
// DETECTOR DE CANDIDATOS A PROMO (S16.5)
// =====================================================================

/**
 * Detecta productos que cumplen criterios para promocionar:
 *   - Stock alto + bajo movimiento (slow mover de S15.4)
 *   - Vencimiento próximo (<30 días)
 *   - Última unidad
 *   - Margen alto + baja velocidad (oportunidad de bajar precio)
 *
 * Recibe productStats del módulo productIntelligence (S15) y devuelve
 * sugerencias con razón y descuento recomendado.
 */
export function findPromoCandidates(products, productStats, options = {}) {
  const { highStockThreshold = 10, lowVelocityThreshold = 0.3 } = options;
  const candidates = [];
  (products || []).forEach(p => {
    if (!p || p.isDeleted) return;
    const stock = Number(p.stock) || 0;
    if (stock <= 0) return;
    const stat = productStats[p.id];
    const reasons = [];
    let suggestedPct = 0;

    // Por expiry (siempre prioritario)
    const expiry = calcExpiryDiscountPct(p);
    if (expiry) {
      reasons.push(expiry.reason);
      suggestedPct = Math.max(suggestedPct, expiry.discountPct);
    }

    // Stock alto + lento
    if (stat && stock >= highStockThreshold && stat.velocity30dPerDay < lowVelocityThreshold) {
      reasons.push(`Stock alto (${stock} uds) + velocity baja (${stat.velocity30dPerDay.toFixed(2)}/día)`);
      suggestedPct = Math.max(suggestedPct, 15);
    }

    // Última unidad
    const lastUnit = calcLastUnitDiscount(p);
    if (lastUnit) {
      reasons.push(lastUnit.reason);
      suggestedPct = Math.max(suggestedPct, lastUnit.discountPct);
    }

    // Sin venta hace ≥45 días (si tiene stat)
    if (stat && stat.daysSinceLastSale >= 45 && stat.daysSinceLastSale !== Infinity) {
      reasons.push(`${stat.daysSinceLastSale} días sin venta`);
      suggestedPct = Math.max(suggestedPct, 20);
    }

    if (reasons.length > 0 && suggestedPct > 0) {
      candidates.push({
        product: p,
        stock,
        velocity30dPerDay: stat ? stat.velocity30dPerDay : 0,
        daysSinceLastSale: stat ? stat.daysSinceLastSale : Infinity,
        reasons,
        suggestedPct,
      });
    }
  });
  // Ordenar por descuento sugerido descendente (los más urgentes primero)
  return candidates.sort((a, b) => b.suggestedPct - a.suggestedPct);
}

// =====================================================================
// SUGERIDOR DE LIQUIDACIÓN CON ESCENARIOS (S16.6)
// =====================================================================

/**
 * Para un producto a liquidar, calcula 3 escenarios de descuento y su
 * impacto estimado.
 *
 * Devuelve { conservative, moderate, aggressive } cada uno con:
 *   - discountPct
 *   - newPrice
 *   - newMarginPct (puede ser negativo si conviene perder algo)
 *   - estimatedDaysToSellOut (basado en velocity actual × multiplier)
 *   - profitPerUnit
 */
export function buildLiquidationScenarios(product, productStat, options = {}) {
  if (!product) return null;
  const price = Number(product.priceUSD) || 0;
  const cost = Number(product.costUSDT) || 0;
  if (price <= 0) return null;
  const stock = Number(product.stock) || 0;
  const velocity = productStat ? productStat.velocity30dPerDay : 0;

  const buildScenario = (discountPct, demandMultiplier) => {
    const newPrice = price * (1 - discountPct / 100);
    const newMarginPct = newPrice > 0 ? ((newPrice - cost) / newPrice) * 100 : -100;
    const projectedVelocity = velocity * demandMultiplier;
    const daysToSellOut = projectedVelocity > 0 ? Math.ceil(stock / projectedVelocity) : Infinity;
    return {
      discountPct,
      newPrice: Math.round(newPrice * 100) / 100,
      newMarginPct: Math.round(newMarginPct * 10) / 10,
      profitPerUnit: Math.round((newPrice - cost) * 100) / 100,
      projectedVelocity: Math.round(projectedVelocity * 100) / 100,
      daysToSellOut: daysToSellOut === Infinity ? null : daysToSellOut,
      totalProfit: Math.round((newPrice - cost) * stock * 100) / 100,
    };
  };

  return {
    stock,
    currentPrice: price,
    cost,
    currentVelocity: velocity,
    conservative: buildScenario(15, 1.5),
    moderate: buildScenario(25, 2.5),
    aggressive: buildScenario(40, 4),
  };
}

// =====================================================================
// MATRIZ DE SENSIBILIDAD PRECIO (S16.18)
// =====================================================================

/**
 * Para cada cambio de precio % posible, simula el impacto en revenue y profit
 * usando la elasticidad del producto.
 *
 * @param {object} product
 * @param {number} elasticity — coef de elasticidad (de S15.12). Si null, asume -1.
 * @param {Array<number>} priceChanges — % cambios a simular (default [-20, -10, -5, 5, 10, 20])
 */
export function calcPriceSensitivityMatrix(product, elasticity, priceChanges = [-20, -10, -5, 5, 10, 20]) {
  if (!product) return [];
  const price = Number(product.priceUSD) || 0;
  const cost = Number(product.costUSDT) || 0;
  if (price <= 0) return [];
  const e = Number.isFinite(elasticity) ? elasticity : -1;
  return priceChanges.map(pricePct => {
    const newPrice = price * (1 + pricePct / 100);
    // demanda% = elasticity × precio%
    const demandPct = e * pricePct;
    const newMarginPct = newPrice > 0 ? ((newPrice - cost) / newPrice) * 100 : -100;
    // revenue% ≈ (1 + precio%) × (1 + demanda%) - 1
    const revenuePct = ((1 + pricePct / 100) * (1 + demandPct / 100) - 1) * 100;
    return {
      pricePct,
      newPrice: Math.round(newPrice * 100) / 100,
      newMarginPct: Math.round(newMarginPct * 10) / 10,
      demandPct: Math.round(demandPct * 10) / 10,
      revenuePct: Math.round(revenuePct * 10) / 10,
    };
  });
}

// =====================================================================
// HISTÓRICO DE PROMOS / ANALYTICS (S16.13)
// =====================================================================

/**
 * Agrega métricas de uso de cupones a partir del log de ventas.
 * Cada sale puede tener sale.couponCode/couponDiscount registrado.
 *
 * Devuelve por cupón:
 *   - usedCount, totalDiscountARS, totalRevenueARS, conversionRate
 */
export function analyzePromoHistory(sales, coupons) {
  const byCode = {};
  (sales || []).forEach(sale => {
    if (!sale || sale.isDeleted) return;
    if (!sale.couponCode) return;
    const code = normalizeCouponCode(sale.couponCode);
    if (!byCode[code]) byCode[code] = { code, usedCount: 0, totalDiscountARS: 0, totalRevenueARS: 0, sales: [] };
    byCode[code].usedCount += 1;
    byCode[code].totalDiscountARS += Number(sale.couponDiscount) || 0;
    byCode[code].totalRevenueARS += Number(sale.total) || 0;
    byCode[code].sales.push(sale.id);
  });
  // Asociar metadata del cupón
  (coupons || []).forEach(c => {
    if (!c || c.isDeleted) return;
    const code = normalizeCouponCode(c.code);
    if (byCode[code]) {
      byCode[code].coupon = c;
    } else {
      // Cupón no usado todavía
      byCode[code] = {
        code, usedCount: 0, totalDiscountARS: 0, totalRevenueARS: 0, sales: [], coupon: c,
      };
    }
  });
  return Object.values(byCode).sort((a, b) => b.usedCount - a.usedCount);
}
