import { describe, it, expect } from "vitest";
import { rankSkuProfitability, profitabilitySummary, SKU_LABELS } from "./skuProfitability.js";

const NOW = new Date("2026-06-15T12:00:00");
const daysAgoISO = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

// Catálogo de prueba con casos variados
const PRODUCTS = [
  // Star: margen 50%, vende 10/mes → ROI alto
  { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon", priceUSD: 20, costUSDT: 10, stock: 8 },
  // Trap: margen 40% pero stock 30 sin venderse hace meses
  { id: "p2", brand: "Lost Mary", model: "BM", flavor: "Vainilla", priceUSD: 20, costUSDT: 12, stock: 30 },
  // Drain: margen 10% y vende poco
  { id: "p3", brand: "Geek", model: "X", flavor: "Tabaco", priceUSD: 15, costUSDT: 13.5, stock: 5 },
  // Sin datos: sin costo
  { id: "p4", brand: "Nikbar", model: "Y", flavor: "Mango", priceUSD: 18, stock: 4 },
];

const PURCHASES = [
  { status: "verificado", items: [
    { productId: "p1" }, { productId: "p2" }, { productId: "p3" }, { productId: "p4" },
  ]},
];

// Solo p1 tiene ventas — los demás son "trap" o "drain" o "needs_data"
const SALES = [
  ...Array.from({ length: 10 }, (_, i) => ({
    date: daysAgoISO(i + 1), isDeleted: false,
    items: [{ productId: "p1", qty: 1 }],
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    date: daysAgoISO(i + 5), isDeleted: false,
    items: [{ productId: "p3", qty: 1 }],
  })),
];

describe("rankSkuProfitability", () => {
  it("clasifica p1 como star (margen 50% + 10/mes vende)", () => {
    const ranked = rankSkuProfitability({ products: PRODUCTS, sales: SALES, purchases: PURCHASES, exchangeRate: 1000, now: NOW });
    const p1 = ranked.find(r => r.product.id === "p1");
    expect(p1.classification).toBe("star");
    expect(p1.marginPct).toBeCloseTo(50, 1);
  });

  it("clasifica p2 como trap (margen alto sin venderse)", () => {
    const ranked = rankSkuProfitability({ products: PRODUCTS, sales: SALES, purchases: PURCHASES, exchangeRate: 1000, now: NOW });
    const p2 = ranked.find(r => r.product.id === "p2");
    expect(p2.classification).toBe("trap");
    expect(p2.velocity).toBe(0);
  });

  it("clasifica p3 como drain (margen 10% + vende poco)", () => {
    const ranked = rankSkuProfitability({ products: PRODUCTS, sales: SALES, purchases: PURCHASES, exchangeRate: 1000, now: NOW });
    const p3 = ranked.find(r => r.product.id === "p3");
    expect(p3.classification).toBe("drain");
  });

  it("clasifica p4 como needs_data (sin costo)", () => {
    const ranked = rankSkuProfitability({ products: PRODUCTS, sales: SALES, purchases: PURCHASES, exchangeRate: 1000, now: NOW });
    const p4 = ranked.find(r => r.product.id === "p4");
    expect(p4.classification).toBe("needs_data");
  });

  it("ordena por monthlyROI desc, null al final", () => {
    const ranked = rankSkuProfitability({ products: PRODUCTS, sales: SALES, purchases: PURCHASES, exchangeRate: 1000, now: NOW });
    expect(ranked[0].classification).toBe("star"); // p1
    // Los con ROI null (needs_data, sin stock) van al final
    const withROI = ranked.filter(r => r.monthlyROI != null);
    for (let i = 1; i < withROI.length; i++) {
      expect(withROI[i].monthlyROI).toBeLessThanOrEqual(withROI[i - 1].monthlyROI);
    }
  });

  it("excluye productos fantasma del catálogo", () => {
    const productsWithFantasma = [
      ...PRODUCTS,
      { id: "fantasma", brand: "Z", model: "Z", flavor: "Z", stock: 0 },
    ];
    const ranked = rankSkuProfitability({ products: productsWithFantasma, sales: SALES, purchases: PURCHASES, exchangeRate: 1000, now: NOW });
    expect(ranked.find(r => r.product.id === "fantasma")).toBeFalsy();
  });
});

describe("profitabilitySummary", () => {
  it("agrega counts por clasificación", () => {
    const ranked = rankSkuProfitability({ products: PRODUCTS, sales: SALES, purchases: PURCHASES, exchangeRate: 1000, now: NOW });
    const s = profitabilitySummary(ranked);
    expect(s.counts.star).toBe(1);
    expect(s.counts.trap).toBe(1);
    expect(s.counts.drain).toBe(1);
    expect(s.counts.needs_data).toBe(1);
  });

  it("calcula portfolioROIMonthly", () => {
    const ranked = rankSkuProfitability({ products: PRODUCTS, sales: SALES, purchases: PURCHASES, exchangeRate: 1000, now: NOW });
    const s = profitabilitySummary(ranked);
    expect(typeof s.portfolioROIMonthly).toBe("number");
    expect(s.totalInvestedUSD).toBeGreaterThan(0);
  });
});

describe("SKU_LABELS", () => {
  it("hay label para todas las clasificaciones", () => {
    ["star", "promising", "cashcow", "trap", "drain", "needs_data"].forEach(c => {
      expect(SKU_LABELS[c]).toBeTruthy();
      expect(SKU_LABELS[c].label).toBeTruthy();
    });
  });
});
