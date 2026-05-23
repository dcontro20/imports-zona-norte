import { describe, it, expect } from "vitest";
import {
  buildComparisonMatrix,
  computeOptimalSplit,
  buildSupplierSummary,
  topSpreadProducts,
  suppliersForProduct,
} from "./supplierComparison.js";

const CATALOG = [
  { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon Ice", puffs: "30000" },
  { id: "p2", brand: "Elfbar", model: "TE", flavor: "Açai Banana Ice", puffs: "30000" },
  { id: "p3", brand: "Lost Mary", model: "BM6000", flavor: "Cherry Cola", puffs: "6000" },
];

function mkList(supId, name, items, color = "#5E6AD2") {
  return { supplierId: supId, supplierName: name, color, items };
}

describe("buildComparisonMatrix", () => {
  it("returns empty matrix for no lists", () => {
    const m = buildComparisonMatrix([]);
    expect(m.products).toEqual([]);
    expect(m.suppliers).toEqual([]);
  });

  it("builds matrix with one supplier", () => {
    const lists = [mkList("sup1", "Paraguay 1", [
      { matchedProductId: "p1", qty: 20, priceUSD: 18 },
    ])];
    const m = buildComparisonMatrix(lists, CATALOG);
    expect(m.suppliers).toHaveLength(1);
    expect(m.products).toHaveLength(1);
    expect(m.cells.p1.sup1.priceUSD).toBe(18);
  });

  it("aggregates same product across suppliers", () => {
    const lists = [
      mkList("sup1", "Paraguay 1", [{ matchedProductId: "p1", qty: 20, priceUSD: 18 }]),
      mkList("sup2", "Paraguay 2", [{ matchedProductId: "p1", qty: 30, priceUSD: 16 }]),
    ];
    const m = buildComparisonMatrix(lists, CATALOG);
    expect(m.products).toHaveLength(1);
    expect(m.suppliers).toHaveLength(2);
    expect(m.cells.p1.sup1.priceUSD).toBe(18);
    expect(m.cells.p1.sup2.priceUSD).toBe(16);
  });

  it("identifies best and worst supplier per product", () => {
    const lists = [
      mkList("sup1", "Paraguay 1", [{ matchedProductId: "p1", qty: 1, priceUSD: 18 }]),
      mkList("sup2", "Paraguay 2", [{ matchedProductId: "p1", qty: 1, priceUSD: 16 }]),
      mkList("sup3", "Paraguay 3", [{ matchedProductId: "p1", qty: 1, priceUSD: 20 }]),
    ];
    const m = buildComparisonMatrix(lists, CATALOG);
    expect(m.bestBy.p1.supplierId).toBe("sup2");
    expect(m.bestBy.p1.priceUSD).toBe(16);
    expect(m.worstBy.p1.supplierId).toBe("sup3");
    expect(m.worstBy.p1.priceUSD).toBe(20);
  });

  it("computes diff pct between best and worst", () => {
    const lists = [
      mkList("sup1", "S1", [{ matchedProductId: "p1", qty: 1, priceUSD: 10 }]),
      mkList("sup2", "S2", [{ matchedProductId: "p1", qty: 1, priceUSD: 12 }]),
    ];
    const m = buildComparisonMatrix(lists, CATALOG);
    expect(m.diffPct.p1).toBe(20); // (12-10)/10 * 100
  });

  it("excludes items without available stock from best/worst", () => {
    const lists = [
      mkList("sup1", "S1", [{ matchedProductId: "p1", qty: 0, priceUSD: 10 }]), // no stock
      mkList("sup2", "S2", [{ matchedProductId: "p1", qty: 5, priceUSD: 12 }]),
    ];
    const m = buildComparisonMatrix(lists, CATALOG);
    expect(m.bestBy.p1.supplierId).toBe("sup2");
    expect(m.worstBy.p1.supplierId).toBe("sup2");
  });

  it("groups unmatched products by brand+model+flavor", () => {
    const lists = [
      mkList("sup1", "S1", [{ brand: "X", model: "Y", flavor: "Z", qty: 1, priceUSD: 10 }]),
      mkList("sup2", "S2", [{ brand: "X", model: "Y", flavor: "Z", qty: 1, priceUSD: 12 }]),
    ];
    const m = buildComparisonMatrix(lists, CATALOG);
    expect(m.products).toHaveLength(1);
  });

  it("enriches matched products with catalog data", () => {
    const lists = [mkList("sup1", "S1", [{ matchedProductId: "p1", qty: 1, priceUSD: 18 }])];
    const m = buildComparisonMatrix(lists, CATALOG);
    expect(m.products[0].brand).toBe("Elfbar");
    expect(m.products[0].puffs).toBe("30000");
  });

  it("sorts products by brand, model, flavor", () => {
    const lists = [mkList("sup1", "S1", [
      { matchedProductId: "p3", qty: 1, priceUSD: 14 },
      { matchedProductId: "p1", qty: 1, priceUSD: 18 },
      { matchedProductId: "p2", qty: 1, priceUSD: 18 },
    ])];
    const m = buildComparisonMatrix(lists, CATALOG);
    // Elfbar before Lost Mary
    expect(m.products[0].brand).toBe("Elfbar");
    expect(m.products[m.products.length - 1].brand).toBe("Lost Mary");
  });
});

describe("computeOptimalSplit", () => {
  const lists = [
    mkList("sup1", "Paraguay 1", [
      { matchedProductId: "p1", qty: 20, priceUSD: 18 },
      { matchedProductId: "p2", qty: 10, priceUSD: 15 },
      { matchedProductId: "p3", qty: 5, priceUSD: 14 },
    ]),
    mkList("sup2", "Paraguay 2", [
      { matchedProductId: "p1", qty: 20, priceUSD: 16 }, // BETTER on p1
      { matchedProductId: "p2", qty: 10, priceUSD: 17 },
      { matchedProductId: "p3", qty: 5, priceUSD: 12 }, // BETTER on p3
    ]),
  ];

  it("allocates each product to its cheapest supplier", () => {
    const matrix = buildComparisonMatrix(lists, CATALOG);
    const split = computeOptimalSplit(matrix, { p1: 10, p2: 10, p3: 10 });
    // p1 → sup2 ($16), p2 → sup1 ($15), p3 → sup2 ($12)
    expect(split.allocations.sup2.map(a => a.productId).sort()).toEqual(["p1", "p3"]);
    expect(split.allocations.sup1.map(a => a.productId)).toEqual(["p2"]);
    expect(split.totalCost).toBe(16 * 10 + 15 * 10 + 12 * 10); // 430
  });

  it("computes savings vs worst supplier per product", () => {
    const matrix = buildComparisonMatrix(lists, CATALOG);
    const split = computeOptimalSplit(matrix, { p1: 10 });
    // worst for p1 is sup1 at $18, best is sup2 at $16. Savings = 10*(18-16) = 20
    expect(split.savingsVsWorst).toBe(20);
  });

  it("ignores products with no demand", () => {
    const matrix = buildComparisonMatrix(lists, CATALOG);
    const split = computeOptimalSplit(matrix, {});
    expect(split.totalCost).toBe(0);
  });

  it("aggregates by supplier", () => {
    const matrix = buildComparisonMatrix(lists, CATALOG);
    const split = computeOptimalSplit(matrix, { p1: 10, p2: 5 });
    expect(split.bySupplier.sup2.totalUSD).toBe(10 * 16); // p1 → sup2
    expect(split.bySupplier.sup1.totalUSD).toBe(5 * 15); // p2 → sup1
  });

  it("handles null matrix gracefully", () => {
    const split = computeOptimalSplit(null);
    expect(split.totalCost).toBe(0);
  });
});

describe("buildSupplierSummary", () => {
  it("computes counts of best price per supplier", () => {
    const lists = [
      mkList("sup1", "P1", [
        { matchedProductId: "p1", qty: 1, priceUSD: 18 },
        { matchedProductId: "p2", qty: 1, priceUSD: 15 }, // best for p2
      ]),
      mkList("sup2", "P2", [
        { matchedProductId: "p1", qty: 1, priceUSD: 16 }, // best for p1
        { matchedProductId: "p2", qty: 1, priceUSD: 17 },
      ]),
    ];
    const matrix = buildComparisonMatrix(lists, CATALOG);
    const summaries = buildSupplierSummary(matrix);
    expect(summaries.find(s => s.supplierId === "sup1").bestPriceCount).toBe(1);
    expect(summaries.find(s => s.supplierId === "sup2").bestPriceCount).toBe(1);
  });

  it("identifies exclusive products", () => {
    const lists = [
      mkList("sup1", "P1", [{ matchedProductId: "p1", qty: 1, priceUSD: 18 }]),
      mkList("sup2", "P2", [{ matchedProductId: "p2", qty: 1, priceUSD: 15 }]),
    ];
    const matrix = buildComparisonMatrix(lists, CATALOG);
    const summaries = buildSupplierSummary(matrix);
    expect(summaries.find(s => s.supplierId === "sup1").exclusiveCount).toBe(1);
    expect(summaries.find(s => s.supplierId === "sup2").exclusiveCount).toBe(1);
  });

  it("computes average premium over best", () => {
    const lists = [
      mkList("sup1", "P1", [{ matchedProductId: "p1", qty: 1, priceUSD: 20 }]), // 25% premium
      mkList("sup2", "P2", [{ matchedProductId: "p1", qty: 1, priceUSD: 16 }]), // 0% (best)
    ];
    const matrix = buildComparisonMatrix(lists, CATALOG);
    const summaries = buildSupplierSummary(matrix);
    expect(summaries.find(s => s.supplierId === "sup1").avgPremiumVsBest).toBe(25);
    expect(summaries.find(s => s.supplierId === "sup2").avgPremiumVsBest).toBe(0);
  });
});

describe("topSpreadProducts", () => {
  it("returns products sorted by spread descending", () => {
    const lists = [
      mkList("sup1", "P1", [
        { matchedProductId: "p1", qty: 1, priceUSD: 10 },
        { matchedProductId: "p2", qty: 1, priceUSD: 10 },
      ]),
      mkList("sup2", "P2", [
        { matchedProductId: "p1", qty: 1, priceUSD: 11 }, // 10% spread
        { matchedProductId: "p2", qty: 1, priceUSD: 15 }, // 50% spread
      ]),
    ];
    const matrix = buildComparisonMatrix(lists, CATALOG);
    const top = topSpreadProducts(matrix);
    expect(top[0].productId).toBe("p2");
    expect(top[0].diffPct).toBe(50);
    expect(top[1].productId).toBe("p1");
  });

  it("respects limit", () => {
    const lists = [
      mkList("sup1", "P1", [
        { matchedProductId: "p1", qty: 1, priceUSD: 10 },
        { matchedProductId: "p2", qty: 1, priceUSD: 10 },
        { matchedProductId: "p3", qty: 1, priceUSD: 10 },
      ]),
      mkList("sup2", "P2", [
        { matchedProductId: "p1", qty: 1, priceUSD: 11 },
        { matchedProductId: "p2", qty: 1, priceUSD: 15 },
        { matchedProductId: "p3", qty: 1, priceUSD: 20 },
      ]),
    ];
    const matrix = buildComparisonMatrix(lists, CATALOG);
    expect(topSpreadProducts(matrix, 2)).toHaveLength(2);
  });
});

describe("suppliersForProduct", () => {
  const lists = [
    mkList("sup1", "P1", [{ matchedProductId: "p1", qty: 0, priceUSD: 18 }]), // no stock
    mkList("sup2", "P2", [{ matchedProductId: "p1", qty: 10, priceUSD: 16 }]),
    mkList("sup3", "P3", [{ matchedProductId: "p1", qty: 5, priceUSD: 14 }]),
  ];

  it("returns suppliers sorted by price asc, unavailable last", () => {
    const matrix = buildComparisonMatrix(lists, CATALOG);
    const rows = suppliersForProduct(matrix, "p1");
    expect(rows[0].supplierId).toBe("sup3"); // $14, available
    expect(rows[1].supplierId).toBe("sup2"); // $16, available
    expect(rows[2].supplierId).toBe("sup1"); // $18, no stock
  });

  it("returns empty for unknown product", () => {
    const matrix = buildComparisonMatrix(lists, CATALOG);
    const rows = suppliersForProduct(matrix, "nonexistent");
    expect(rows.every(r => !r.hasListing)).toBe(true);
  });
});
