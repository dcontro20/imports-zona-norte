import { describe, it, expect } from "vitest";
import {
  getProductCostUSDT,
  weightedAvgCost,
  applyPurchaseCosts,
  valuateInventory,
  getSaleItemCostUSDT,
  calcCOGS,
  calcSaleMargin,
  buildPnL,
  projectCashFlow,
  financeKPIs,
} from "./finance.js";

const RATE = 1000;

const PRODUCTS = [
  { id: "p1", brand: "Elfbar", flavor: "Watermelon", stock: 10, priceUSD: 20, priceARS: 20000, avgCostUSDT: 7 },
  { id: "p2", brand: "Lost Mary", flavor: "Cherry", stock: 5, priceUSD: 14, priceARS: 14000, costUSDT: 5 }, // sin avgCost, usa costUSDT
  { id: "p3", brand: "Geek", flavor: "Mango", stock: 0, priceUSD: 18, priceARS: 18000 }, // sin costo, sin stock
];

describe("getProductCostUSDT", () => {
  it("prioritizes avgCostUSDT", () => {
    expect(getProductCostUSDT({ avgCostUSDT: 7, costUSDT: 5 })).toBe(7);
  });
  it("falls back to costUSDT", () => {
    expect(getProductCostUSDT({ costUSDT: 5 })).toBe(5);
  });
  it("returns 0 when no cost", () => {
    expect(getProductCostUSDT({})).toBe(0);
    expect(getProductCostUSDT(null)).toBe(0);
  });
});

describe("weightedAvgCost", () => {
  it("computes weighted average", () => {
    // 10 units @ 7 + 10 units @ 9 = 200/20 = 8
    expect(weightedAvgCost(10, 7, 10, 9)).toBe(8);
  });
  it("returns incoming cost when no old stock", () => {
    expect(weightedAvgCost(0, 0, 10, 9)).toBe(9);
  });
  it("uses incoming cost as base when no old avg", () => {
    // old stock 10 but no avg → treat old as incoming cost → all at 9
    expect(weightedAvgCost(10, 0, 10, 9)).toBe(9);
  });
  it("handles fractional results", () => {
    // 5 @ 7 + 3 @ 10 = 35+30 = 65/8 = 8.125
    expect(weightedAvgCost(5, 7, 3, 10)).toBeCloseTo(8.125, 3);
  });
});

describe("applyPurchaseCosts", () => {
  it("updates avgCostUSDT for purchased products", () => {
    const items = [{ productId: "p1", qty: 10, unitCostUSDT: 9 }]; // p1 had 10@7
    const result = applyPurchaseCosts(PRODUCTS, items);
    const p1 = result.find(p => p.id === "p1");
    expect(p1.avgCostUSDT).toBe(8); // (10*7 + 10*9)/20
  });
  it("does not touch products not in the purchase", () => {
    const items = [{ productId: "p1", qty: 5, unitCostUSDT: 7 }];
    const result = applyPurchaseCosts(PRODUCTS, items);
    expect(result.find(p => p.id === "p2")).toEqual(PRODUCTS[1]);
  });
  it("aggregates multiple items of same product", () => {
    const items = [
      { productId: "p3", qty: 10, unitCostUSDT: 6 },
      { productId: "p3", qty: 10, unitCostUSDT: 8 },
    ];
    const result = applyPurchaseCosts(PRODUCTS, items);
    const p3 = result.find(p => p.id === "p3");
    // p3 had 0 stock → avg = weighted of incoming = (10*6+10*8)/20 = 7
    expect(p3.avgCostUSDT).toBe(7);
  });
  it("returns same array reference content for empty items", () => {
    expect(applyPurchaseCosts(PRODUCTS, [])).toBe(PRODUCTS);
  });
});

describe("valuateInventory", () => {
  it("computes inventory value at cost and sale price", () => {
    const v = valuateInventory(PRODUCTS, RATE);
    // p1: 10 units @ cost 7 = 70 USDT; p2: 5 @ 5 = 25 USDT; p3: 0 stock
    expect(v.atCostUSDT).toBe(95);
    expect(v.atCostARS).toBe(95000);
    expect(v.units).toBe(15);
    // sale: p1 10*20000 + p2 5*14000 = 200000 + 70000 = 270000
    expect(v.atSaleARS).toBe(270000);
    expect(v.potentialProfitARS).toBe(175000);
  });
  it("reports cost coverage", () => {
    const v = valuateInventory(PRODUCTS, RATE);
    // p1 and p2 have cost, both in-stock → 100%
    expect(v.costCoverage).toBe(100);
  });
  it("excludes deleted and zero-stock", () => {
    const v = valuateInventory([
      { id: "x", stock: 0, priceARS: 1000, costUSDT: 5 },
      { id: "y", stock: 5, priceARS: 1000, costUSDT: 5, isDeleted: true },
    ], RATE);
    expect(v.units).toBe(0);
  });
});

describe("getSaleItemCostUSDT", () => {
  it("prioritizes snapshot cost", () => {
    expect(getSaleItemCostUSDT({ costUSDTAtSale: 6 }, { avgCostUSDT: 9 })).toBe(6);
  });
  it("falls back to product cost", () => {
    expect(getSaleItemCostUSDT({}, { avgCostUSDT: 9 })).toBe(9);
  });
});

describe("calcCOGS", () => {
  it("computes cost of goods sold using historical rate", () => {
    const sales = [
      { date: "2026-05-01", currency: "ARS", exchangeRate: 1000, items: [{ productId: "p1", qty: 2 }] },
    ];
    // p1 cost 7 USDT × 2 × 1000 = 14000
    expect(calcCOGS(sales, PRODUCTS, RATE)).toBe(14000);
  });
  it("uses snapshot cost when available", () => {
    const sales = [
      { date: "2026-05-01", currency: "ARS", exchangeRate: 1000, items: [{ productId: "p1", qty: 2, costUSDTAtSale: 6 }] },
    ];
    expect(calcCOGS(sales, PRODUCTS, RATE)).toBe(12000); // 6 × 2 × 1000
  });
  it("excludes deleted sales", () => {
    const sales = [
      { isDeleted: true, currency: "ARS", exchangeRate: 1000, items: [{ productId: "p1", qty: 2 }] },
    ];
    expect(calcCOGS(sales, PRODUCTS, RATE)).toBe(0);
  });
});

describe("calcSaleMargin", () => {
  it("computes revenue, cogs, profit, margin", () => {
    const sale = { currency: "ARS", exchangeRate: 1000, total: 40000, items: [{ productId: "p1", qty: 2 }] };
    const m = calcSaleMargin(sale, PRODUCTS, RATE);
    expect(m.revenueARS).toBe(40000);
    expect(m.cogsARS).toBe(14000); // 7 × 2 × 1000
    expect(m.profitARS).toBe(26000);
    expect(m.marginPct).toBe(65);
  });
  it("handles USD sales with rate", () => {
    const sale = { currency: "USD", exchangeRate: 1000, total: 40, items: [{ productId: "p1", qty: 2 }] };
    const m = calcSaleMargin(sale, PRODUCTS, RATE);
    expect(m.revenueARS).toBe(40000); // 40 × 1000
  });
});

describe("buildPnL", () => {
  const sales = [
    { date: "2026-05-10", currency: "ARS", exchangeRate: 1000, total: 40000, items: [{ productId: "p1", qty: 2 }] },
    { date: "2026-04-10", currency: "ARS", exchangeRate: 1000, total: 14000, items: [{ productId: "p2", qty: 1 }] },
  ];
  const expenses = [
    { date: "2026-05-05", amountARS: 5000 },
    { date: "2026-04-05", amountARS: 3000 },
  ];

  it("builds P&L for a specific month (devengado)", () => {
    const pnl = buildPnL({ sales, expenses, products: PRODUCTS, exchangeRate: RATE, month: "2026-05" });
    expect(pnl.revenue).toBe(40000);
    expect(pnl.cogs).toBe(14000); // p1: 7×2×1000
    expect(pnl.grossProfit).toBe(26000);
    expect(pnl.grossMarginPct).toBe(65);
    expect(pnl.expensesTotal).toBe(5000);
    expect(pnl.netProfit).toBe(21000);
  });

  it("includes operational mermas at cost", () => {
    const withdrawals = [
      { date: "2026-05-15", type: "Garantía", productId: "p1", qty: 1 }, // cost 7 × 1000 = 7000
      { date: "2026-05-15", type: "Consumo propio", productId: "p1", qty: 1 }, // excluded
    ];
    const pnl = buildPnL({ sales, expenses, withdrawals, products: PRODUCTS, exchangeRate: RATE, month: "2026-05" });
    expect(pnl.mermasARS).toBe(7000);
    expect(pnl.netProfit).toBe(14000); // 26000 - 5000 - 7000
  });

  it("aggregates all when month is null", () => {
    const pnl = buildPnL({ sales, expenses, products: PRODUCTS, exchangeRate: RATE, month: null });
    expect(pnl.revenue).toBe(54000); // both sales
  });
});

describe("projectCashFlow", () => {
  it("projects inflows from velocity and outflows from pending purchases", () => {
    const statsMap = {
      p1: { product: PRODUCTS[0], velocity30dPerDay: 1 }, // 1/day
    };
    const purchases = [
      { status: "pedido", totalCostARS: 50000 },
      { status: "verificado", totalCostARS: 99999 }, // excluded
    ];
    const cf = projectCashFlow({
      statsMap, products: PRODUCTS, purchases, exchangeRate: RATE,
      horizonDays: 30, monthlyFixedExpensesARS: 10000,
    });
    // p1: min(10 stock, 1×30=30) = 10 units × 20000 = 200000 revenue
    expect(cf.projectedRevenueARS).toBe(200000);
    expect(cf.pendingPurchasesARS).toBe(50000);
    expect(cf.fixedExpensesARS).toBe(10000);
    expect(cf.outflows).toBe(60000);
    expect(cf.net).toBe(140000);
  });

  it("handles no velocity gracefully", () => {
    const cf = projectCashFlow({ statsMap: {}, products: PRODUCTS, purchases: [], exchangeRate: RATE });
    expect(cf.projectedRevenueARS).toBe(0);
  });
});

describe("financeKPIs", () => {
  it("computes executive KPIs", () => {
    const sales = [
      { date: "2026-05-10", currency: "ARS", exchangeRate: 1000, total: 40000, items: [{ productId: "p1", qty: 2 }] },
    ];
    const kpis = financeKPIs({ sales, products: PRODUCTS, exchangeRate: RATE, month: "2026-05" });
    expect(kpis.revenue).toBe(40000);
    expect(kpis.grossProfit).toBe(26000);
    expect(kpis.avgTicket).toBe(40000); // 1 sale
    expect(kpis.inventoryValueCostARS).toBe(95000);
    expect(kpis.salesCount).toBe(1);
    expect(kpis.roiPct).toBeGreaterThan(0);
  });
});
