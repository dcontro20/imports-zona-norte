import { describe, it, expect } from "vitest";
import {
  buildProductSalesStats,
  calcProductMargin,
  classifyVelocity,
  calcABCAnalysis,
  findSlowMovers,
  findDeadStock,
  calcBrandPerformance,
  suggestPurchaseQty,
  findVelocityDrops,
  classifyLifecycle,
  calcProductCoOccurrence,
  calcDayOfWeekPattern,
  calcSellThroughRate,
  calcInventoryHealth,
} from "./productIntelligence.js";

const RATE = 1400;
const NOW = new Date("2026-04-29T12:00:00Z");

const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const PRODUCTS = [
  { id: "p1", brand: "Lost Mary", model: "BM5000", flavor: "Mango", priceUSD: 10, priceARS: 14000, costUSDT: 5, stock: 20, createdAt: daysAgo(60) },
  { id: "p2", brand: "Lost Mary", model: "BM5000", flavor: "Watermelon", priceUSD: 10, priceARS: 14000, costUSDT: 5, stock: 50, createdAt: daysAgo(120) },
  { id: "p3", brand: "Elf Bar", model: "BC5000", flavor: "Strawberry", priceUSD: 12, priceARS: 16800, costUSDT: 7, stock: 5, createdAt: daysAgo(45) },
  { id: "p4", brand: "Geek Bar", model: "Pulse", flavor: "Grape", priceUSD: 15, priceARS: 21000, costUSDT: 8, stock: 0, createdAt: daysAgo(180) },
  { id: "p5", brand: "Lost Mary", model: "BM5000", flavor: "Discontinued", priceUSD: 10, priceARS: 14000, costUSDT: 5, stock: 30, createdAt: daysAgo(200) },
  { id: "p6", brand: "Ignite", model: "V250", flavor: "New", priceUSD: 8, priceARS: 11200, costUSDT: 4, stock: 10, createdAt: daysAgo(15) }, // nuevo
];

const SALES = [
  // p1 — vende muy bien (top mover)
  { id: "s1", date: daysAgo(2), currency: "ARS", items: [{ productId: "p1", qty: 3 }] },
  { id: "s2", date: daysAgo(5), currency: "ARS", items: [{ productId: "p1", qty: 5 }] },
  { id: "s3", date: daysAgo(10), currency: "ARS", items: [{ productId: "p1", qty: 4 }] },
  { id: "s4", date: daysAgo(20), currency: "ARS", items: [{ productId: "p1", qty: 6 }, { productId: "p2", qty: 2 }] },
  { id: "s5", date: daysAgo(28), currency: "ARS", items: [{ productId: "p1", qty: 4 }] },
  // p2 — vende moderado
  { id: "s6", date: daysAgo(8), currency: "ARS", items: [{ productId: "p2", qty: 2 }] },
  { id: "s7", date: daysAgo(15), currency: "ARS", items: [{ productId: "p2", qty: 3 }] },
  // p3 — vendió hace tiempo (slow)
  { id: "s8", date: daysAgo(45), currency: "ARS", items: [{ productId: "p3", qty: 1 }] },
  // p4 — sin stock pero se vendió: stock 0
  { id: "s9", date: daysAgo(50), currency: "ARS", items: [{ productId: "p4", qty: 2 }] },
  // p5 — NUNCA se vendió (dead stock)
  // p6 — recién creado, vendió 1
  { id: "s10", date: daysAgo(7), currency: "ARS", items: [{ productId: "p6", qty: 1 }] },
];

describe("buildProductSalesStats", () => {
  it("agrega totals correctamente", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    expect(map.p1.totalQty).toBe(22); // 3+5+4+6+4
    expect(map.p2.totalQty).toBe(7);  // 2+2+3
    expect(map.p3.totalQty).toBe(1);
    expect(map.p5.totalQty).toBe(0);  // nunca vendió
  });

  it("calcula velocity30d / velocity30dPerDay", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    expect(map.p1.velocity30d).toBe(22); // todas las ventas de p1 caen en 30d
    expect(map.p1.velocity30dPerDay).toBeCloseTo(22 / 30, 2);
    expect(map.p3.velocity30d).toBe(0);  // venta hace 45d
  });

  it("calcula daysSinceLastSale", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    expect(map.p1.daysSinceLastSale).toBeLessThanOrEqual(2);
    expect(map.p3.daysSinceLastSale).toBeGreaterThanOrEqual(44);
    expect(map.p5.daysSinceLastSale).toBe(Infinity);
  });

  it("ignora soft-deleted en sales y products", () => {
    const products = [...PRODUCTS, { id: "px", brand: "X", model: "X", isDeleted: true, stock: 100, priceUSD: 10 }];
    const sales = [...SALES, { id: "sx", isDeleted: true, date: daysAgo(1), items: [{ productId: "p1", qty: 999 }] }];
    const map = buildProductSalesStats(products, sales, RATE, NOW);
    expect(map.px).toBeUndefined();
    expect(map.p1.totalQty).toBe(22); // no contó la deleted
  });

  it("revenue ARS suma usando priceARS (default)", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    // p1: 22 uds × 14000 ARS = 308000
    expect(map.p1.totalRevenueARS).toBe(22 * 14000);
  });
});

describe("calcProductMargin (S15.3)", () => {
  it("calcula margen y ROI", () => {
    const m = calcProductMargin({ priceUSD: 10, costUSDT: 5 });
    expect(m.marginUSD).toBe(5);
    expect(m.marginPct).toBe(50);
    expect(m.roiPct).toBe(100); // (10-5)/5 = 100%
  });
  it("retorna null si no hay precio", () => {
    expect(calcProductMargin({ priceUSD: 0, costUSDT: 5 })).toBe(null);
    expect(calcProductMargin(null)).toBe(null);
  });
  it("retorna roiPct null si no hay costo", () => {
    const m = calcProductMargin({ priceUSD: 10, costUSDT: 0 });
    expect(m.marginPct).toBe(100);
    expect(m.roiPct).toBe(null);
  });
});

describe("classifyVelocity (S15.1)", () => {
  it("clasifica correctamente", () => {
    expect(classifyVelocity(2).tier).toBe("hot");
    expect(classifyVelocity(0.5).tier).toBe("warm");
    expect(classifyVelocity(0.1).tier).toBe("cold");
    expect(classifyVelocity(0).tier).toBe("frozen");
  });
});

describe("calcABCAnalysis (S15.2 Pareto)", () => {
  it("clasifica A/B/C según revenue acumulado", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    const abc = calcABCAnalysis(map);
    // p1 tiene mayor revenue → debería ser A
    expect(abc[0].productId).toBe("p1");
    expect(abc[0].classification).toBe("A");
    // El último debería ser C (sin ventas o muy poco)
    expect(abc[abc.length - 1].classification).toBe("C");
  });

  it("acumula 80% en A", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    const abc = calcABCAnalysis(map);
    const aClass = abc.filter(x => x.classification === "A");
    if (aClass.length > 0) {
      expect(aClass[aClass.length - 1].cumulativePct).toBeLessThanOrEqual(80.5); // tolerancia
    }
  });

  it("array vacío devuelve []", () => {
    expect(calcABCAnalysis({})).toEqual([]);
  });
});

describe("findSlowMovers (S15.4)", () => {
  it("identifica p3 (45d sin venta + stock)", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    const slow = findSlowMovers(map, PRODUCTS);
    const ids = slow.map(s => s.productId);
    expect(ids).toContain("p3");
    expect(ids).toContain("p5"); // nunca vendió
  });

  it("excluye p1 (vende muy bien)", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    const slow = findSlowMovers(map, PRODUCTS);
    expect(slow.map(s => s.productId)).not.toContain("p1");
  });

  it("excluye productos sin stock", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    const slow = findSlowMovers(map, PRODUCTS);
    expect(slow.map(s => s.productId)).not.toContain("p4"); // stock=0
  });

  it("incluye sugerencia textual", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    const slow = findSlowMovers(map, PRODUCTS);
    slow.forEach(s => expect(typeof s.suggestion).toBe("string"));
  });
});

describe("findDeadStock (S15.6)", () => {
  it("identifica p5 (nunca vendido + stock 30)", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    const dead = findDeadStock(map);
    expect(dead.map(d => d.productId)).toContain("p5");
  });

  it("ordena por stockValue descendente", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    const dead = findDeadStock(map);
    if (dead.length > 1) {
      for (let i = 0; i < dead.length - 1; i++) {
        expect(dead[i].stockValueUSD).toBeGreaterThanOrEqual(dead[i + 1].stockValueUSD);
      }
    }
  });
});

describe("calcBrandPerformance (S15.5)", () => {
  it("agrupa por marca", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    const brands = calcBrandPerformance(map, PRODUCTS);
    const brandNames = brands.map(b => b.brand);
    expect(brandNames).toContain("Lost Mary");
    expect(brandNames).toContain("Elf Bar");
  });

  it("Lost Mary tiene mayor revenue (p1+p2+p5)", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    const brands = calcBrandPerformance(map, PRODUCTS);
    expect(brands[0].brand).toBe("Lost Mary");
    expect(brands[0].skuCount).toBe(3);
  });

  it("calcula avgMarginPct ponderado por qty", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    const brands = calcBrandPerformance(map, PRODUCTS);
    const lm = brands.find(b => b.brand === "Lost Mary");
    expect(lm.avgMarginPct).toBeCloseTo(50, 0); // priceUSD 10, cost 5
  });
});

describe("suggestPurchaseQty (S15.7)", () => {
  it("sugiere qty para top movers", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    const suggestions = suggestPurchaseQty(map, { leadTimeDays: 30, coverDays: 30, safetyDays: 7 });
    const p1Sug = suggestions.find(s => s.productId === "p1");
    // velocity = 22/30 ≈ 0.73 uds/día
    // target = 0.73 × 67 ≈ 49 uds
    // suggested = 49 - 20 (stock actual) = 29
    expect(p1Sug.suggestedQty).toBeGreaterThan(20);
  });

  it("sugiere 0 para productos sin ventas", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    const suggestions = suggestPurchaseQty(map);
    const p5 = suggestions.find(s => s.productId === "p5");
    expect(p5.suggestedQty).toBe(0);
  });
});

describe("findVelocityDrops (S15.8)", () => {
  it("detecta drop si última semana << promedio mensual", () => {
    const products = [{ id: "px", brand: "X", model: "X", priceUSD: 10, stock: 50 }];
    const sales = [
      // 28 ventas en últimos 30d, pero ninguna en últimos 7d
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `s${i}`, date: daysAgo(28 - i * 2), currency: "ARS", items: [{ productId: "px", qty: 7 }],
      })),
    ];
    const map = buildProductSalesStats(products, sales, RATE, NOW);
    const drops = findVelocityDrops(map);
    expect(drops.map(d => d.productId)).toContain("px");
  });
});

describe("classifyLifecycle (S15.9)", () => {
  it("p6 (creado hace 15d) es 'new'", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    expect(classifyLifecycle(map.p6, NOW).stage).toBe("new");
  });

  it("p5 (sin ventas hace ≥60d) es 'dead'", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    expect(classifyLifecycle(map.p5, NOW).stage).toBe("dead");
  });
});

describe("calcProductCoOccurrence (S15.10)", () => {
  it("detecta co-ocurrencia p1+p2 en s4", () => {
    const co = calcProductCoOccurrence(SALES, PRODUCTS);
    expect(co.p1).toBeDefined();
    expect(co.p1.find(x => x.productId === "p2")).toBeTruthy();
    expect(co.p1.find(x => x.productId === "p2").co).toBe(1);
  });

  it("ignora sales con un solo producto", () => {
    const co = calcProductCoOccurrence(SALES, PRODUCTS);
    // p3 solo aparece sola en s8 → no debería estar en cualquier otra co map
    expect(co.p3).toBeUndefined();
  });
});

describe("calcDayOfWeekPattern (S15.11)", () => {
  it("devuelve 7 buckets", () => {
    const buckets = calcDayOfWeekPattern(SALES, null, 90, NOW);
    expect(buckets).toHaveLength(7);
    expect(buckets[0].label).toBe("Dom");
    expect(buckets[6].label).toBe("Sáb");
  });

  it("filtra por productId", () => {
    const allP1 = calcDayOfWeekPattern(SALES, "p1", 90, NOW);
    const totalP1 = allP1.reduce((s, b) => s + b.qty, 0);
    expect(totalP1).toBe(22); // todas las uds vendidas de p1
  });
});

describe("calcInventoryHealth (S15.14)", () => {
  it("calcula KPIs base", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    const health = calcInventoryHealth(PRODUCTS, [], SALES, map);
    expect(health.skuCount).toBe(6);
    expect(health.productsWithStock).toBe(5); // todos menos p4
    expect(health.fillRatePct).toBe(83); // 5/6
  });

  it("detecta dead stock value", () => {
    const map = buildProductSalesStats(PRODUCTS, SALES, RATE, NOW);
    const health = calcInventoryHealth(PRODUCTS, [], SALES, map);
    expect(health.deadStockCount).toBeGreaterThan(0);
  });
});

describe("calcSellThroughRate (S15.13)", () => {
  it("calcula STR de un lote verificado", () => {
    const purchases = [{
      id: "po1", date: daysAgo(60), status: "verificado", supplier: "Para1",
      items: [{ productId: "p1", qty: 50 }],
    }];
    const str = calcSellThroughRate(purchases, SALES);
    expect(str).toHaveLength(1);
    // Vendí 22 de p1 desde la compra → 22/50 = 44%
    expect(str[0].strPct).toBe(44);
  });

  it("ignora purchases no verificadas", () => {
    const purchases = [
      { id: "po1", date: daysAgo(60), status: "pedido", items: [{ productId: "p1", qty: 50 }] },
    ];
    expect(calcSellThroughRate(purchases, SALES)).toEqual([]);
  });
});
