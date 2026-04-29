import { describe, it, expect } from "vitest";
import {
  normalizeCouponCode,
  findCouponByCode,
  validateCoupon,
  calcCouponDiscount,
  calcVolumeDiscountPct,
  calcTierDiscountPct,
  calcLoyaltyDiscountPct,
  resolveChannelPrice,
  hasChannelPriceOverride,
  calcMarginGuard,
  calcExpiryDiscountPct,
  calcLastUnitDiscount,
  findLowMarginProducts,
  findPromoCandidates,
  buildLiquidationScenarios,
  calcPriceSensitivityMatrix,
  analyzePromoHistory,
  DEFAULT_VOLUME_DISCOUNTS,
  DEFAULT_TIER_DISCOUNTS,
} from "./pricing.js";

const NOW = new Date("2026-04-29T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const daysAhead = (n) => new Date(NOW.getTime() + n * 86400000).toISOString();

// =====================================================================
// CUPONES (S16.1)
// =====================================================================

describe("normalizeCouponCode", () => {
  it("uppercase + trim", () => {
    expect(normalizeCouponCode("  bienvenido10  ")).toBe("BIENVENIDO10");
    expect(normalizeCouponCode("MartIn")).toBe("MARTIN");
  });
  it("vacío devuelve string vacío", () => {
    expect(normalizeCouponCode("")).toBe("");
    expect(normalizeCouponCode(null)).toBe("");
  });
});

describe("findCouponByCode", () => {
  const coupons = [
    { id: "c1", code: "BIENVENIDO10", discountType: "percent", discountValue: 10 },
    { id: "c2", code: "VIP20", discountType: "percent", discountValue: 20 },
    { id: "c3", code: "OLD", isDeleted: true },
  ];
  it("encuentra por código case-insensitive", () => {
    expect(findCouponByCode(coupons, "bienvenido10").id).toBe("c1");
    expect(findCouponByCode(coupons, "  VIP20  ").id).toBe("c2");
  });
  it("ignora eliminados", () => {
    expect(findCouponByCode(coupons, "OLD")).toBe(null);
  });
  it("retorna null si no existe", () => {
    expect(findCouponByCode(coupons, "NOEXISTE")).toBe(null);
  });
});

describe("validateCoupon", () => {
  it("acepta cupón válido sin restricciones", () => {
    expect(validateCoupon({ code: "X", discountValue: 10 }, {}).ok).toBe(true);
  });
  it("rechaza si está vencido", () => {
    const c = { code: "X", validTo: daysAgo(1) };
    expect(validateCoupon(c, { today: NOW.toISOString() }).ok).toBe(false);
  });
  it("rechaza si no llegó la fecha de inicio", () => {
    const c = { code: "X", validFrom: daysAhead(5) };
    expect(validateCoupon(c, { today: NOW.toISOString() }).ok).toBe(false);
  });
  it("rechaza si superó maxUses", () => {
    expect(validateCoupon({ code: "X", maxUses: 5, usedCount: 5 }, {}).ok).toBe(false);
  });
  it("rechaza si subtotal < min", () => {
    const c = { code: "X", minSubtotalARS: 10000 };
    expect(validateCoupon(c, { subtotalARS: 5000 }).ok).toBe(false);
    expect(validateCoupon(c, { subtotalARS: 15000 }).ok).toBe(true);
  });
  it("audience VIP rechaza no-VIP", () => {
    const c = { code: "X", audience: "vip" };
    expect(validateCoupon(c, { client: { tier: "regular" } }).ok).toBe(false);
    expect(validateCoupon(c, { client: { tier: "vip" } }).ok).toBe(true);
  });
  it("audience specific solo cliente listado", () => {
    const c = { code: "X", audience: "specific", audienceClientIds: ["c1"] };
    expect(validateCoupon(c, { client: { id: "c2" } }).ok).toBe(false);
    expect(validateCoupon(c, { client: { id: "c1" } }).ok).toBe(true);
  });
  it("onlyFirstPurchase rechaza recurrente", () => {
    const c = { code: "X", onlyFirstPurchase: true };
    expect(validateCoupon(c, { isFirstPurchase: false }).ok).toBe(false);
    expect(validateCoupon(c, { isFirstPurchase: true }).ok).toBe(true);
  });
});

describe("calcCouponDiscount", () => {
  it("percent discount", () => {
    expect(calcCouponDiscount({ discountType: "percent", discountValue: 10 }, 1000)).toBe(100);
  });
  it("fixed discount cap al subtotal", () => {
    expect(calcCouponDiscount({ discountType: "fixed", discountValue: 5000 }, 3000)).toBe(3000);
    expect(calcCouponDiscount({ discountType: "fixed", discountValue: 500 }, 3000)).toBe(500);
  });
  it("retorna 0 si subtotal <= 0", () => {
    expect(calcCouponDiscount({ discountType: "percent", discountValue: 10 }, 0)).toBe(0);
  });
});

// =====================================================================
// VOLUMEN (S16.3)
// =====================================================================

describe("calcVolumeDiscountPct", () => {
  it("aplica regla más generosa", () => {
    expect(calcVolumeDiscountPct(3)).toBe(0);
    expect(calcVolumeDiscountPct(5)).toBe(5);
    expect(calcVolumeDiscountPct(10)).toBe(10);
    expect(calcVolumeDiscountPct(25)).toBe(15);
  });
  it("0 uds = 0%", () => {
    expect(calcVolumeDiscountPct(0)).toBe(0);
  });
  it("acepta reglas custom", () => {
    const rules = [{ minQty: 100, discountPct: 30 }];
    expect(calcVolumeDiscountPct(150, rules)).toBe(30);
    expect(calcVolumeDiscountPct(50, rules)).toBe(0);
  });
});

// =====================================================================
// TIER (S16.9)
// =====================================================================

describe("calcTierDiscountPct", () => {
  it("aplica según tier", () => {
    expect(calcTierDiscountPct({ tier: "vip" })).toBe(5);
    expect(calcTierDiscountPct({ tier: "diamante" })).toBe(10);
    expect(calcTierDiscountPct({ tier: "regular" })).toBe(0);
  });
  it("client null = 0", () => {
    expect(calcTierDiscountPct(null)).toBe(0);
  });
  it("tier desconocido = 0", () => {
    expect(calcTierDiscountPct({ tier: "platinum" })).toBe(0);
  });
});

// =====================================================================
// FIDELIZACIÓN (S16.19)
// =====================================================================

describe("calcLoyaltyDiscountPct", () => {
  const month = new Date().toISOString().slice(0, 7);
  it("aplica si compras del mes >= threshold", () => {
    const sales = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`, clientId: "c1", date: `${month}-15`,
    }));
    expect(calcLoyaltyDiscountPct({ id: "c1" }, sales)).toBe(5);
  });
  it("no aplica si compras < threshold", () => {
    const sales = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`, clientId: "c1", date: `${month}-15`,
    }));
    expect(calcLoyaltyDiscountPct({ id: "c1" }, sales)).toBe(0);
  });
});

// =====================================================================
// CANAL (S16.2)
// =====================================================================

describe("resolveChannelPrice + hasChannelPriceOverride", () => {
  // priceByChannel keys son canales de venta (channel del sale), NO métodos de pago.
  // Channels válidos: WhatsApp, Instagram, Delivery, Presencial, MercadoLibre.
  const product = {
    priceUSD: 10, priceARS: 14000,
    priceByChannel: { whatsapp: 11, presencial: 9, mercadolibre: 13 },
  };
  it("usa precio de canal si existe", () => {
    expect(resolveChannelPrice(product, "WhatsApp", "USD")).toBe(11);
    expect(resolveChannelPrice(product, "Presencial", "USD")).toBe(9);
    expect(resolveChannelPrice(product, "MercadoLibre", "USD")).toBe(13);
  });
  it("acepta aliases", () => {
    expect(resolveChannelPrice(product, "ml", "USD")).toBe(13);
    expect(resolveChannelPrice(product, "wa", "USD")).toBe(11);
    expect(resolveChannelPrice(product, "ig", "USD")).toBe(10); // sin override → fallback
  });
  it("fallback a priceUSD si no hay canal override", () => {
    expect(resolveChannelPrice(product, "Instagram", "USD")).toBe(10);
    expect(resolveChannelPrice(product, "Delivery", "USD")).toBe(10);
  });
  it("ARS fallback", () => {
    expect(resolveChannelPrice(product, "Instagram", "ARS")).toBe(14000);
  });
  it("hasChannelPriceOverride", () => {
    expect(hasChannelPriceOverride(product, "WhatsApp")).toBe(true);
    expect(hasChannelPriceOverride(product, "MercadoLibre")).toBe(true);
    expect(hasChannelPriceOverride(product, "Instagram")).toBe(false);
  });
});

// =====================================================================
// MARGIN GUARD (S16.4)
// =====================================================================

describe("calcMarginGuard", () => {
  it("calcula precio mínimo para mantener target margen", () => {
    const r = calcMarginGuard({ priceUSD: 10, costUSDT: 5 }, 30);
    // minPrice = 5 / (1 - 0.3) = 7.14
    expect(r.minPrice).toBeCloseTo(7.14, 1);
    expect(r.currentMarginPct).toBe(50);
    // maxDiscount = (10 - 7.14) / 10 ≈ 28.6%
    expect(r.maxDiscountPct).toBeCloseTo(28.6, 0);
  });
  it("retorna null si no hay precio", () => {
    expect(calcMarginGuard({ priceUSD: 0, costUSDT: 5 }, 30)).toBe(null);
  });
  it("retorna null si target >= 100%", () => {
    expect(calcMarginGuard({ priceUSD: 10, costUSDT: 5 }, 100)).toBe(null);
  });
});

// =====================================================================
// EXPIRY (S16.7)
// =====================================================================

describe("calcExpiryDiscountPct", () => {
  it("vencido", () => {
    const r = calcExpiryDiscountPct({ expiryDate: daysAgo(5) }, NOW);
    expect(r.discountPct).toBe(40);
    expect(r.daysLeft).toBeLessThan(0);
  });
  it("< 7 días", () => {
    expect(calcExpiryDiscountPct({ expiryDate: daysAhead(3) }, NOW).discountPct).toBe(25);
  });
  it("< 14 días", () => {
    expect(calcExpiryDiscountPct({ expiryDate: daysAhead(10) }, NOW).discountPct).toBe(15);
  });
  it("< 30 días", () => {
    expect(calcExpiryDiscountPct({ expiryDate: daysAhead(20) }, NOW).discountPct).toBe(5);
  });
  it("> 30 días = null", () => {
    expect(calcExpiryDiscountPct({ expiryDate: daysAhead(60) }, NOW)).toBe(null);
  });
  it("sin expiryDate = null", () => {
    expect(calcExpiryDiscountPct({})).toBe(null);
  });
});

// =====================================================================
// LAST UNIT (S16.11)
// =====================================================================

describe("calcLastUnitDiscount", () => {
  it("stock 1 = sugiere 10%", () => {
    expect(calcLastUnitDiscount({ stock: 1 }).discountPct).toBe(10);
  });
  it("stock != 1 = null", () => {
    expect(calcLastUnitDiscount({ stock: 2 })).toBe(null);
    expect(calcLastUnitDiscount({ stock: 0 })).toBe(null);
  });
});

// =====================================================================
// LOW MARGIN (S16.8)
// =====================================================================

describe("findLowMarginProducts", () => {
  const products = [
    { id: "p1", priceUSD: 10, costUSDT: 9 }, // margen 10% — danger
    { id: "p2", priceUSD: 10, costUSDT: 8 }, // margen 20% — warning
    { id: "p3", priceUSD: 10, costUSDT: 5 }, // margen 50% — OK
    { id: "p4", priceUSD: 10, costUSDT: 0 }, // sin costo, ignorar
  ];
  it("lista bajos márgenes con severity", () => {
    const r = findLowMarginProducts(products);
    expect(r).toHaveLength(2);
    expect(r[0].severity).toBe("danger"); // primero el peor
    expect(r[0].marginPct).toBe(10);
    expect(r[1].severity).toBe("warning");
  });
});

// =====================================================================
// PROMO CANDIDATES (S16.5)
// =====================================================================

describe("findPromoCandidates", () => {
  it("detecta stock alto + lento", () => {
    const products = [{ id: "p1", priceUSD: 10, stock: 50 }];
    const stats = {
      p1: { velocity30dPerDay: 0.1, daysSinceLastSale: 20 }
    };
    const r = findPromoCandidates(products, stats);
    expect(r).toHaveLength(1);
    expect(r[0].suggestedPct).toBeGreaterThanOrEqual(15);
  });

  it("detecta producto sin venta hace ≥45d", () => {
    const products = [{ id: "p1", priceUSD: 10, stock: 5 }];
    const stats = { p1: { velocity30dPerDay: 0, daysSinceLastSale: 60 } };
    const r = findPromoCandidates(products, stats);
    expect(r[0].suggestedPct).toBeGreaterThanOrEqual(20);
  });

  it("ignora productos sin stock", () => {
    const products = [{ id: "p1", priceUSD: 10, stock: 0 }];
    const stats = { p1: { velocity30dPerDay: 0, daysSinceLastSale: 60 } };
    expect(findPromoCandidates(products, stats)).toHaveLength(0);
  });
});

// =====================================================================
// LIQUIDATION SCENARIOS (S16.6)
// =====================================================================

describe("buildLiquidationScenarios", () => {
  const product = { priceUSD: 10, costUSDT: 5, stock: 30 };
  const stat = { velocity30dPerDay: 1 };
  it("3 escenarios con descuento creciente", () => {
    const r = buildLiquidationScenarios(product, stat);
    expect(r.conservative.discountPct).toBe(15);
    expect(r.moderate.discountPct).toBe(25);
    expect(r.aggressive.discountPct).toBe(40);
    // aggressive vende más rápido
    expect(r.aggressive.daysToSellOut).toBeLessThan(r.conservative.daysToSellOut);
  });
  it("calcula margen post-descuento", () => {
    const r = buildLiquidationScenarios(product, stat);
    // conservative: precio = 10×0.85 = 8.5, margen = (8.5-5)/8.5 ≈ 41%
    expect(r.conservative.newMarginPct).toBeCloseTo(41.2, 0);
  });
});

// =====================================================================
// SENSIBILIDAD MATRIX (S16.18)
// =====================================================================

describe("calcPriceSensitivityMatrix", () => {
  it("simula impacto en revenue por cambio de precio", () => {
    const product = { priceUSD: 10, costUSDT: 5 };
    const m = calcPriceSensitivityMatrix(product, -2); // muy elástico
    // Bajar precio 10% con elasticidad -2 → demanda sube 20% → revenue ≈ +8%
    const minus10 = m.find(x => x.pricePct === -10);
    expect(minus10.demandPct).toBe(20);
    expect(minus10.revenuePct).toBeGreaterThan(0);
  });
  it("inelástico: bajar precio reduce revenue", () => {
    const product = { priceUSD: 10, costUSDT: 5 };
    const m = calcPriceSensitivityMatrix(product, -0.5); // inelástico
    const minus10 = m.find(x => x.pricePct === -10);
    expect(minus10.revenuePct).toBeLessThan(0);
  });
});

// =====================================================================
// PROMO HISTORY (S16.13)
// =====================================================================

describe("analyzePromoHistory", () => {
  it("agrega usos de cupones desde sales", () => {
    const sales = [
      { id: "s1", couponCode: "BIENVENIDO10", couponDiscount: 100, total: 1000 },
      { id: "s2", couponCode: "bienvenido10", couponDiscount: 50, total: 500 },
      { id: "s3", couponCode: "VIP20", couponDiscount: 200, total: 1000 },
    ];
    const coupons = [
      { code: "BIENVENIDO10" }, { code: "VIP20" }, { code: "NEW" },
    ];
    const r = analyzePromoHistory(sales, coupons);
    const bienvenido = r.find(x => x.code === "BIENVENIDO10");
    expect(bienvenido.usedCount).toBe(2);
    expect(bienvenido.totalDiscountARS).toBe(150);
    const newCoupon = r.find(x => x.code === "NEW");
    expect(newCoupon.usedCount).toBe(0);
  });
});
