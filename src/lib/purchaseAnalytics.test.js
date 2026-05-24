import { describe, it, expect } from "vitest";
import {
  spendBySupplier,
  leadTimeStats,
  topPurchasedProducts,
  costPriceHistory,
  costChangeSummary,
  topCostIncreases,
  replenishmentForecast,
  spendOverTime,
} from "./purchaseAnalytics.js";

const PROFILES = [
  { id: "sup1", name: "Paraguay 1", color: "#5B3592" },
  { id: "sup2", name: "Paraguay 2", color: "#0F6B5C" },
];

const PRODUCTS = [
  { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon", stock: 5 },
  { id: "p2", brand: "Lost Mary", model: "BM", flavor: "Cherry", stock: 0 },
];

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

describe("spendBySupplier", () => {
  it("aggregates spend by supplier", () => {
    const purchases = [
      { supplier: "Paraguay 1", totalCostARS: 100000, totalUSDT: 100, status: "verificado", date: new Date().toISOString().slice(0, 10) },
      { supplier: "Paraguay 1", totalCostARS: 50000, totalUSDT: 50, status: "pedido", date: new Date().toISOString().slice(0, 10) },
      { supplier: "Paraguay 2", totalCostARS: 80000, totalUSDT: 80, status: "verificado", date: new Date().toISOString().slice(0, 10) },
    ];
    const result = spendBySupplier(purchases, PROFILES);
    expect(result[0].name).toBe("Paraguay 1"); // más gasto primero
    expect(result[0].totalARS).toBe(150000);
    expect(result[0].orderCount).toBe(2);
    expect(result[0].verifiedCount).toBe(1);
    expect(result[0].color).toBe("#5B3592");
  });

  it("includes monthly series", () => {
    const purchases = [{ supplier: "Paraguay 1", totalCostARS: 100000, date: new Date().toISOString().slice(0, 10) }];
    const result = spendBySupplier(purchases, PROFILES, 6);
    expect(result[0].monthly).toHaveLength(6);
    expect(result[0].monthly[5].totalARS).toBe(100000); // current month
  });

  it("excludes deleted", () => {
    const purchases = [
      { supplier: "Paraguay 1", totalCostARS: 100000, isDeleted: true, date: "2026-01-01" },
    ];
    expect(spendBySupplier(purchases, PROFILES)).toEqual([]);
  });
});

describe("leadTimeStats", () => {
  it("computes avg lead time from status history", () => {
    const purchases = [
      {
        supplier: "Paraguay 1", status: "verificado", date: "2026-01-01",
        statusHistory: [
          { status: "pedido", timestamp: "2026-01-01T00:00:00Z" },
          { status: "recibido", timestamp: "2026-01-21T00:00:00Z" }, // 20d
        ],
      },
      {
        supplier: "Paraguay 1", status: "verificado", date: "2026-02-01",
        statusHistory: [
          { status: "pedido", timestamp: "2026-02-01T00:00:00Z" },
          { status: "recibido", timestamp: "2026-03-03T00:00:00Z" }, // 30d
        ],
      },
    ];
    const result = leadTimeStats(purchases, PROFILES);
    const p1 = result.find(r => r.name === "Paraguay 1");
    expect(p1.avgLeadTime).toBe(25);
    expect(p1.minLead).toBe(20);
    expect(p1.maxLead).toBe(30);
    expect(p1.samples).toBe(2);
  });

  it("computes fulfillment rate", () => {
    const purchases = [
      { supplier: "Paraguay 1", status: "verificado", date: "2026-01-01" },
      { supplier: "Paraguay 1", status: "pedido", date: "2026-01-01" },
    ];
    const result = leadTimeStats(purchases, PROFILES);
    expect(result.find(r => r.name === "Paraguay 1").fulfillmentPct).toBe(50);
  });
});

describe("topPurchasedProducts", () => {
  it("ranks products by total qty purchased", () => {
    const purchases = [
      { items: [{ productId: "p1", qty: 20, unitCostUSDT: 7 }, { productId: "p2", qty: 5, unitCostUSDT: 5 }] },
      { items: [{ productId: "p1", qty: 10, unitCostUSDT: 7 }] },
    ];
    const result = topPurchasedProducts(purchases, PRODUCTS);
    expect(result[0].productId).toBe("p1");
    expect(result[0].totalQty).toBe(30);
    expect(result[0].totalUSDT).toBe(210); // 30 × 7
    expect(result[0].product.brand).toBe("Elfbar");
  });

  it("respects limit", () => {
    const purchases = [{ items: [{ productId: "p1", qty: 1 }, { productId: "p2", qty: 1 }] }];
    expect(topPurchasedProducts(purchases, PRODUCTS, 1)).toHaveLength(1);
  });
});

describe("costPriceHistory", () => {
  it("merges purchases and lists chronologically", () => {
    const purchases = [
      { date: "2026-02-01", supplier: "P1", items: [{ productId: "p1", unitCostUSDT: 7.5 }] },
    ];
    const lists = [
      { processedAt: "2026-01-15T10:00:00Z", supplierName: "P1", items: [{ matchedProductId: "p1", priceUSD: 7 }] },
      { processedAt: "2026-03-01T10:00:00Z", supplierName: "P1", items: [{ matchedProductId: "p1", priceUSD: 8 }] },
    ];
    const history = costPriceHistory("p1", purchases, lists);
    expect(history).toHaveLength(3);
    expect(history.map(h => h.costUSDT)).toEqual([7, 7.5, 8]); // chronological
    expect(history[0].source).toBe("list");
    expect(history[1].source).toBe("purchase");
  });

  it("filters by product and positive cost", () => {
    const purchases = [{ date: "2026-01-01", items: [{ productId: "p2", unitCostUSDT: 5 }] }];
    expect(costPriceHistory("p1", purchases, [])).toEqual([]);
  });
});

describe("costChangeSummary", () => {
  it("computes change pct between first and last", () => {
    const history = [
      { date: "2026-01-01", costUSDT: 7 },
      { date: "2026-03-01", costUSDT: 8 },
    ];
    const s = costChangeSummary(history);
    expect(s.changePct).toBeCloseTo(14.3, 1);
    expect(s.direction).toBe("up");
    expect(s.firstCost).toBe(7);
    expect(s.lastCost).toBe(8);
  });

  it("returns null for insufficient data", () => {
    expect(costChangeSummary([{ date: "2026-01-01", costUSDT: 7 }])).toBeNull();
    expect(costChangeSummary([])).toBeNull();
  });
});

describe("topCostIncreases", () => {
  it("returns products with rising cost sorted desc", () => {
    const purchases = [
      { date: "2026-01-01", items: [{ productId: "p1", unitCostUSDT: 7 }] },
      { date: "2026-03-01", items: [{ productId: "p1", unitCostUSDT: 9 }] }, // +28%
    ];
    const result = topCostIncreases(PRODUCTS, purchases, []);
    expect(result[0].productId).toBe("p1");
    expect(result[0].changePct).toBeCloseTo(28.6, 1);
  });

  it("ignores products with no increase", () => {
    const purchases = [
      { date: "2026-01-01", items: [{ productId: "p1", unitCostUSDT: 9 }] },
      { date: "2026-03-01", items: [{ productId: "p1", unitCostUSDT: 7 }] }, // decrease
    ];
    expect(topCostIncreases(PRODUCTS, purchases, [])).toEqual([]);
  });
});

describe("replenishmentForecast", () => {
  it("estimates days until empty using velocity", () => {
    const statsMap = {
      p1: { velocity30dPerDay: 1 }, // 5 stock / 1 = 5 days
    };
    const result = replenishmentForecast(PRODUCTS, statsMap, []);
    const p1 = result.find(r => r.productId === "p1");
    expect(p1.daysUntilEmpty).toBe(5);
    expect(p1.velocity).toBe(1);
  });

  it("flags products with pending orders as covered", () => {
    const statsMap = { p1: { velocity30dPerDay: 1 } };
    const purchases = [{ status: "pedido", items: [{ productId: "p1", qty: 20 }] }];
    const result = replenishmentForecast(PRODUCTS, statsMap, purchases);
    expect(result.find(r => r.productId === "p1").covered).toBe(true);
    expect(result.find(r => r.productId === "p1").pendingQty).toBe(20);
  });

  it("excludes products with no velocity", () => {
    const statsMap = { p1: { velocity30dPerDay: 0 } };
    expect(replenishmentForecast(PRODUCTS, statsMap, [])).toEqual([]);
  });

  it("sorts by days until empty asc (most urgent first)", () => {
    const statsMap = {
      p1: { velocity30dPerDay: 0.5 }, // 5/0.5 = 10d
      p2: { velocity30dPerDay: 1 },   // 0 stock → 0d
    };
    const result = replenishmentForecast(PRODUCTS, statsMap, []);
    expect(result[0].productId).toBe("p2"); // 0 days, most urgent
  });
});

describe("spendOverTime", () => {
  it("returns monthly spend series", () => {
    const purchases = [
      { totalCostARS: 100000, totalUSDT: 100, date: new Date().toISOString().slice(0, 10) },
    ];
    const series = spendOverTime(purchases, 6);
    expect(series).toHaveLength(6);
    expect(series[5].totalARS).toBe(100000);
    expect(series[5].orderCount).toBe(1);
  });
});
