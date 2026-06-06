import { describe, it, expect } from "vitest";
import {
  dormantClients,
  maxDiscountForMargin,
  offerProfitImpact,
  crossSellPairs,
  suggestSmartOffers,
} from "./smartOffers.js";

const RATE = 1000;
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const PRODUCTS = [
  { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon", puffs: "30000", priceUSD: 20, priceARS: 20000, avgCostUSDT: 7, stock: 10 },
  { id: "p2", brand: "Lost Mary", model: "BM", flavor: "Cherry", puffs: "6000", priceUSD: 14, priceARS: 14000, avgCostUSDT: 5, stock: 8 },
  { id: "p3", brand: "Geek", model: "Pulse", flavor: "Mango", puffs: "15000", priceUSD: 18, priceARS: 18000, avgCostUSDT: 6, stock: 12 },
];

const CLIENTS = [
  { id: "c1", name: "Mariano", phone: "+5491111" },
  { id: "c2", name: "Lucía" },
  { id: "c3", name: "Nuevo" },
];

describe("dormantClients", () => {
  const sales = [
    { clientId: "c1", date: daysAgo(45), currency: "ARS", total: 30000, items: [] },
    { clientId: "c1", date: daysAgo(60), currency: "ARS", total: 20000, items: [] },
    { clientId: "c2", date: daysAgo(5), currency: "ARS", total: 10000, items: [] }, // activo
  ];
  it("finds clients inactive beyond threshold", () => {
    const result = dormantClients(CLIENTS, sales, { daysThreshold: 30, exchangeRate: RATE });
    expect(result.map(r => r.client.id)).toContain("c1");
    expect(result.map(r => r.client.id)).not.toContain("c2"); // activo
    expect(result.map(r => r.client.id)).not.toContain("c3"); // nunca compró
  });
  it("computes historical spend and avg ticket", () => {
    const result = dormantClients(CLIENTS, sales, { daysThreshold: 30, exchangeRate: RATE });
    const c1 = result.find(r => r.client.id === "c1");
    expect(c1.totalSpentARS).toBe(50000);
    expect(c1.orderCount).toBe(2);
    expect(c1.avgTicketARS).toBe(25000);
  });
  it("sorts by historical value desc", () => {
    const sales2 = [
      { clientId: "c1", date: daysAgo(45), currency: "ARS", total: 10000, items: [] },
      { clientId: "c2", date: daysAgo(45), currency: "ARS", total: 90000, items: [] },
    ];
    const result = dormantClients(CLIENTS, sales2, { daysThreshold: 30, exchangeRate: RATE });
    expect(result[0].client.id).toBe("c2");
  });
});

describe("maxDiscountForMargin", () => {
  it("computes max discount keeping target margin", () => {
    // p1: price 20, cost 7. Para margen 30%: minPrice = 7/0.7 = 10. maxDisc = (20-10)/20 = 50%
    const r = maxDiscountForMargin(PRODUCTS[0], 30);
    expect(r.maxDiscountPct).toBe(50);
    expect(r.currentMarginPct).toBe(65); // (20-7)/20
  });
  it("returns null without cost", () => {
    expect(maxDiscountForMargin({ priceUSD: 20 }, 30)).toBeNull();
  });
});

describe("offerProfitImpact", () => {
  it("computes profit after discount", () => {
    // p1: priceARS 20000, -10% → 18000. cost 7×1000=7000. unitProfit 11000
    const r = offerProfitImpact(PRODUCTS[0], 10, 5, RATE);
    expect(r.discountedPriceARS).toBe(18000);
    expect(r.unitProfitARS).toBe(11000);
    expect(r.totalProfitARS).toBe(55000); // ×5
    expect(r.marginPct).toBeCloseTo(61.1, 0);
  });
});

describe("crossSellPairs", () => {
  it("counts products bought together", () => {
    const sales = [
      { items: [{ productId: "p1" }, { productId: "p2" }] },
      { items: [{ productId: "p1" }, { productId: "p2" }] },
      { items: [{ productId: "p1" }, { productId: "p3" }] },
    ];
    const pairs = crossSellPairs(sales, { minTogether: 2 });
    expect(pairs[0].count).toBe(2);
    expect([pairs[0].a, pairs[0].b].sort()).toEqual(["p1", "p2"]);
  });
  it("ignores single-item sales and rare pairs", () => {
    const sales = [
      { items: [{ productId: "p1" }] },
      { items: [{ productId: "p1" }, { productId: "p2" }] },
    ];
    expect(crossSellPairs(sales, { minTogether: 2 })).toEqual([]);
  });
});

describe("suggestSmartOffers", () => {
  const statsMap = {
    p1: { product: PRODUCTS[0], velocity30dPerDay: 2 },   // top seller
    p2: { product: PRODUCTS[1], velocity30dPerDay: 0 },   // parado → liquidar
    p3: { product: PRODUCTS[2], velocity30dPerDay: 0.05 }, // lento → liquidar
  };
  const sales = [
    { clientId: "c1", date: daysAgo(45), currency: "ARS", total: 30000, items: [{ productId: "p1" }, { productId: "p2" }] },
    { clientId: "c1", date: daysAgo(50), currency: "ARS", total: 20000, items: [{ productId: "p1" }, { productId: "p2" }] },
  ];

  it("generates liquidation ideas for stuck stock", () => {
    const ideas = suggestSmartOffers({ products: PRODUCTS, statsMap, sales, clients: CLIENTS, exchangeRate: RATE });
    const liq = ideas.filter(i => i.category === "liquidar");
    expect(liq.length).toBeGreaterThan(0);
    expect(liq[0].impact.marginPct).toBeGreaterThanOrEqual(0); // nunca a pérdida
  });

  it("generates reactivation ideas for dormant clients", () => {
    const ideas = suggestSmartOffers({ products: PRODUCTS, statsMap, sales, clients: CLIENTS, exchangeRate: RATE });
    const react = ideas.filter(i => i.category === "reactivar");
    expect(react.length).toBeGreaterThan(0);
    expect(react[0].clientId).toBe("c1");
  });

  it("generates cross-sell combos", () => {
    const ideas = suggestSmartOffers({ products: PRODUCTS, statsMap, sales, clients: CLIENTS, exchangeRate: RATE });
    const cross = ideas.filter(i => i.category === "crosssell");
    expect(cross.length).toBeGreaterThan(0);
    expect(cross[0].products).toHaveLength(2);
    expect(cross[0].impact.savingARS).toBeGreaterThan(0);
  });

  it("generates top-seller push as multi-product idea", () => {
    const ideas = suggestSmartOffers({ products: PRODUCTS, statsMap, sales, clients: CLIENTS, exchangeRate: RATE });
    const top = ideas.filter(i => i.category === "topseller");
    // Ahora topseller es UNA idea multi-sabor (no varias 1-sabor)
    expect(top.length).toBeLessThanOrEqual(1);
    if (top.length > 0) {
      expect(top[0].offerType).toBe("topsemana");
      expect(top[0].products.length).toBeGreaterThanOrEqual(2);
      // p1 (Watermelon, top seller) debería estar
      const ids = top[0].products.map(x => x.product.id);
      expect(ids).toContain("p1");
    }
  });

  it("handles empty inputs", () => {
    expect(suggestSmartOffers({})).toEqual([]);
  });
});

describe("nuevas categorías de ideas", () => {
  // Re-construyo data para los nuevos tests
  const productsForNew = [
    { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon Ice", priceUSD: 30, costUSDT: 18, stock: 5, createdAt: "2026-01-01" },
    { id: "p2", brand: "Lost Mary", model: "BM", flavor: "Cherry Cola", priceUSD: 28, costUSDT: 17, stock: 4, createdAt: "2026-01-01" },
    { id: "p3", brand: "Geek", model: "Pulse", flavor: "Mango", priceUSD: 32, costUSDT: 20, stock: 6, createdAt: "2026-01-01" },
    // Producto nuevo (drop)
    { id: "p4", brand: "Ignite", model: "V300", flavor: "Banana", priceUSD: 25, costUSDT: 15, stock: 3, createdAt: new Date().toISOString() },
  ];
  const RATE = 1000;
  const statsForNew = {
    p1: { product: productsForNew[0], velocity30dPerDay: 0.5, soldLast30d: 15 },
    p2: { product: productsForNew[1], velocity30dPerDay: 0.4, soldLast30d: 12 },
    p3: { product: productsForNew[2], velocity30dPerDay: 0.3, soldLast30d: 9 },
    p4: { product: productsForNew[3], velocity30dPerDay: 0.1, soldLast30d: 3 },
  };

  it("genera idea de stocklist con productos en stock", () => {
    const ideas = suggestSmartOffers({ products: productsForNew, statsMap: statsForNew, sales: [], clients: [], exchangeRate: RATE });
    const stocklist = ideas.find(i => i.category === "stocklist");
    expect(stocklist).toBeTruthy();
    expect(stocklist.impact.productsListed).toBeGreaterThan(0);
    expect(stocklist.impact.totalUnits).toBeGreaterThan(0);
  });

  it("genera pack fiesta si hay 3+ marcas con stock", () => {
    const ideas = suggestSmartOffers({ products: productsForNew, statsMap: statsForNew, sales: [], clients: [], exchangeRate: RATE });
    const pack = ideas.find(i => i.category === "packfiesta");
    expect(pack).toBeTruthy();
    expect(pack.comboQty).toBeGreaterThanOrEqual(3);
    expect(pack.impact.savingARS).toBeGreaterThan(0);
  });

  it("genera recordatorio con top 3 productos", () => {
    const ideas = suggestSmartOffers({ products: productsForNew, statsMap: statsForNew, sales: [], clients: [], exchangeRate: RATE });
    const rec = ideas.find(i => i.category === "recordatorio");
    expect(rec).toBeTruthy();
    expect(rec.products.length).toBeGreaterThan(0);
    expect(rec.products.length).toBeLessThanOrEqual(3);
  });

  it("genera idea de drop si hay productos creados en últimos 14d", () => {
    const ideas = suggestSmartOffers({ products: productsForNew, statsMap: statsForNew, sales: [], clients: [], exchangeRate: RATE });
    const drop = ideas.find(i => i.category === "drop");
    expect(drop).toBeTruthy();
    expect(drop.products.length).toBeGreaterThan(0);
    expect(drop.products[0].product.id).toBe("p4");
  });

  it("no genera drop si no hay productos recientes", () => {
    const oldProducts = productsForNew.map(p => ({ ...p, createdAt: "2025-01-01" }));
    const oldStats = Object.fromEntries(
      Object.entries(statsForNew).map(([k, v]) => [k, { ...v, product: oldProducts.find(p => p.id === k) }])
    );
    const ideas = suggestSmartOffers({ products: oldProducts, statsMap: oldStats, sales: [], clients: [], exchangeRate: RATE });
    expect(ideas.find(i => i.category === "drop")).toBeFalsy();
  });
});
