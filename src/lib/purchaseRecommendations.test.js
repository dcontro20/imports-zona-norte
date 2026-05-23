import { describe, it, expect } from "vitest";
import {
  buildCurrentSupplyMap,
  computePendingQtyByProduct,
  recommendPurchases,
  buildPurchaseFromRecommendation,
} from "./purchaseRecommendations.js";

const PRODUCTS = [
  { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon", puffs: "30000", priceUSD: 20, priceARS: 20000, stock: 2 },
  { id: "p2", brand: "Lost Mary", model: "BM", flavor: "Cherry", puffs: "6000", priceUSD: 14, priceARS: 14000, stock: 0 },
  { id: "p3", brand: "Geek", model: "Pulse", flavor: "Mango", puffs: "15000", priceUSD: 18, priceARS: 18000, stock: 50 }, // mucho stock, no needs reposition
];

const PROFILES = [
  { id: "sup1", name: "Paraguay 1", color: "#5B3592", defaultLeadDays: 30, defaultSupplierCommPercent: 10, defaultPaseroPercent: 5, defaultEnvioCostARS: 5000 },
  { id: "sup2", name: "Paraguay 2", color: "#0F6B5C", defaultLeadDays: 45, defaultSupplierCommPercent: 8, defaultPaseroPercent: 4, defaultEnvioCostARS: 3000 },
];

// Helper: build a sale ISO date N days ago
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

// Sales para que p1 y p2 tengan velocity > 0
const SALES = [
  // p1: 30 ventas en 30d → velocity ~1/d
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `s${i}`, date: daysAgo(i + 1), currency: "ARS", exchangeRate: 1000,
    items: [{ productId: "p1", qty: 1 }],
  })),
  // p2: 60 ventas en 30d → velocity ~2/d
  ...Array.from({ length: 60 }, (_, i) => ({
    id: `s2${i}`, date: daysAgo((i % 30) + 1), currency: "ARS", exchangeRate: 1000,
    items: [{ productId: "p2", qty: 1 }],
  })),
];

describe("buildCurrentSupplyMap", () => {
  it("returns empty for no lists", () => {
    expect(buildCurrentSupplyMap([])).toEqual({});
  });

  it("maps products to supplier offers, sorted by price", () => {
    const lists = [
      {
        id: "l1", supplierId: "sup1", supplierName: "Paraguay 1", processedAt: "2026-05-01",
        items: [{ matchedProductId: "p1", priceUSD: 22, qty: 100 }],
      },
      {
        id: "l2", supplierId: "sup2", supplierName: "Paraguay 2", processedAt: "2026-05-15",
        items: [{ matchedProductId: "p1", priceUSD: 18, qty: 50 }],
      },
    ];
    const map = buildCurrentSupplyMap(lists, PROFILES);
    expect(map.p1).toHaveLength(2);
    expect(map.p1[0].priceUSD).toBe(18); // mejor precio primero
    expect(map.p1[0].supplierId).toBe("sup2");
  });

  it("uses only the most recent list per supplier", () => {
    const lists = [
      {
        id: "old", supplierId: "sup1", supplierName: "P1", processedAt: "2026-01-01",
        items: [{ matchedProductId: "p1", priceUSD: 25, qty: 10 }],
      },
      {
        id: "new", supplierId: "sup1", supplierName: "P1", processedAt: "2026-05-01",
        items: [{ matchedProductId: "p1", priceUSD: 18, qty: 50 }],
      },
    ];
    const map = buildCurrentSupplyMap(lists, PROFILES);
    expect(map.p1).toHaveLength(1);
    expect(map.p1[0].priceUSD).toBe(18); // newest wins
  });

  it("excludes deleted lists and items without priceUSD", () => {
    const lists = [
      {
        id: "l1", supplierId: "sup1", supplierName: "P1", processedAt: "2026-05-01", isDeleted: true,
        items: [{ matchedProductId: "p1", priceUSD: 18, qty: 10 }],
      },
      {
        id: "l2", supplierId: "sup2", supplierName: "P2", processedAt: "2026-05-01",
        items: [{ matchedProductId: "p2", priceUSD: 0, qty: 10 }],
      },
    ];
    const map = buildCurrentSupplyMap(lists, PROFILES);
    expect(Object.keys(map)).toEqual([]);
  });
});

describe("computePendingQtyByProduct", () => {
  it("sums qty across non-verified purchases", () => {
    const purchases = [
      { status: "pedido", items: [{ productId: "p1", qty: 10 }] },
      { status: "en_camino", items: [{ productId: "p1", qty: 5 }] },
      { status: "verificado", items: [{ productId: "p1", qty: 100 }] }, // excluded
    ];
    expect(computePendingQtyByProduct(purchases).p1).toBe(15);
  });

  it("ignores deleted", () => {
    const purchases = [
      { status: "pedido", isDeleted: true, items: [{ productId: "p1", qty: 10 }] },
      { status: "pedido", items: [{ productId: "p1", qty: 5 }] },
    ];
    expect(computePendingQtyByProduct(purchases).p1).toBe(5);
  });
});

describe("recommendPurchases", () => {
  const LISTS = [
    {
      id: "l1", supplierId: "sup1", supplierName: "Paraguay 1", processedAt: "2026-05-15",
      items: [
        { matchedProductId: "p1", priceUSD: 7, qty: 100 },
        { matchedProductId: "p2", priceUSD: 5, qty: 100 },
      ],
    },
    {
      id: "l2", supplierId: "sup2", supplierName: "Paraguay 2", processedAt: "2026-05-15",
      items: [
        { matchedProductId: "p1", priceUSD: 8, qty: 50 },
        { matchedProductId: "p2", priceUSD: 4, qty: 50 }, // mejor precio para p2
      ],
    },
  ];

  it("recommends products with low stock to cheapest supplier", () => {
    const recs = recommendPurchases({
      products: PRODUCTS, sales: SALES, purchases: [], supplierLists: LISTS,
      supplierProfiles: PROFILES, exchangeRate: 1000,
    });
    // p1 → sup1 ($7), p2 → sup2 ($4)
    const sup1 = recs.find(r => r.supplierId === "sup1");
    const sup2 = recs.find(r => r.supplierId === "sup2");
    expect(sup1.items.some(i => i.productId === "p1")).toBe(true);
    expect(sup2.items.some(i => i.productId === "p2")).toBe(true);
  });

  it("does not recommend products with abundant stock", () => {
    const recs = recommendPurchases({
      products: PRODUCTS, sales: [], purchases: [], supplierLists: LISTS,
      supplierProfiles: PROFILES, exchangeRate: 1000,
    });
    // Sin sales no hay velocity → no recommendations
    expect(recs).toEqual([]);
  });

  it("discounts pending purchases", () => {
    const purchases = [
      { status: "en_camino", items: [{ productId: "p1", qty: 1000 }] }, // ya viene mucho
    ];
    const recs = recommendPurchases({
      products: PRODUCTS, sales: SALES, purchases, supplierLists: LISTS,
      supplierProfiles: PROFILES, exchangeRate: 1000,
    });
    const sup1 = recs.find(r => r.supplierId === "sup1");
    // p1 ya está cubierto, no debería recomendar
    expect(sup1?.items.some(i => i.productId === "p1")).toBeFalsy();
  });

  it("includes alternativeSuppliers info", () => {
    const recs = recommendPurchases({
      products: PRODUCTS, sales: SALES, purchases: [], supplierLists: LISTS,
      supplierProfiles: PROFILES, exchangeRate: 1000,
    });
    const sup1 = recs.find(r => r.supplierId === "sup1");
    const p1item = sup1?.items.find(i => i.productId === "p1");
    expect(p1item?.alternativeSuppliers).toBeDefined();
    expect(p1item.alternativeSuppliers[0].supplierName).toBe("Paraguay 2");
    expect(p1item.alternativeSuppliers[0].delta).toBe(1); // 8 - 7
  });

  it("calculates totalSavingsVsAlt", () => {
    const recs = recommendPurchases({
      products: PRODUCTS, sales: SALES, purchases: [], supplierLists: LISTS,
      supplierProfiles: PROFILES, exchangeRate: 1000,
    });
    const sup1 = recs.find(r => r.supplierId === "sup1");
    expect(sup1.totalSavingsVsAlt).toBeGreaterThan(0);
  });

  it("attaches profile defaults to each recommendation", () => {
    const recs = recommendPurchases({
      products: PRODUCTS, sales: SALES, purchases: [], supplierLists: LISTS,
      supplierProfiles: PROFILES, exchangeRate: 1000,
    });
    const sup1 = recs.find(r => r.supplierId === "sup1");
    expect(sup1.defaultCommPct).toBe(10);
    expect(sup1.leadDays).toBe(30);
  });

  it("sorts results by totalUSDT desc", () => {
    const recs = recommendPurchases({
      products: PRODUCTS, sales: SALES, purchases: [], supplierLists: LISTS,
      supplierProfiles: PROFILES, exchangeRate: 1000,
    });
    if (recs.length >= 2) {
      expect(recs[0].totalUSDT).toBeGreaterThanOrEqual(recs[1].totalUSDT);
    }
  });

  it("includes reasons in items", () => {
    const recs = recommendPurchases({
      products: PRODUCTS, sales: SALES, purchases: [], supplierLists: LISTS,
      supplierProfiles: PROFILES, exchangeRate: 1000,
    });
    recs.forEach(r => r.items.forEach(i => {
      expect(i.reason).toBeTruthy();
    }));
  });

  it("handles empty inputs gracefully", () => {
    expect(recommendPurchases({})).toEqual([]);
  });
});

describe("buildPurchaseFromRecommendation", () => {
  it("transforms a recommendation into purchase shape", () => {
    const reco = {
      supplierId: "sup1",
      supplierName: "Paraguay 1",
      color: "#5B3592",
      items: [
        {
          productId: "p1", qty: 20, priceUSD: 7, subtotalUSD: 140,
          product: { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon", puffs: "30000" },
        },
      ],
      totalItems: 20, totalUSDT: 140,
      defaultCommPct: 10, defaultPaseroPct: 5, defaultEnvioCostARS: 5000,
      leadDays: 30,
    };
    const purchase = buildPurchaseFromRecommendation(reco, 1000);
    expect(purchase.supplier).toBe("Paraguay 1");
    expect(purchase.status).toBe("pedido");
    expect(purchase.items).toHaveLength(1);
    expect(purchase.items[0].qty).toBe(20);
    expect(purchase.groups).toHaveLength(1);
    expect(purchase.groups[0].flavors).toHaveLength(1);
    expect(purchase.totalUSDT).toBe(140);
    expect(purchase.supplierCommUSDT).toBe(14); // 10% de 140
    expect(purchase.totalUSDTpaid).toBe(154);
    expect(purchase.envioCostARS).toBe(5000);
    expect(purchase.notes).toMatch(/Recomendados/);
  });

  it("groups items by brand/model/puffs", () => {
    const reco = {
      supplierName: "Paraguay 1", supplierId: "sup1",
      items: [
        { productId: "p1", qty: 5, priceUSD: 7, subtotalUSD: 35,
          product: { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon", puffs: "30000" } },
        { productId: "p1b", qty: 3, priceUSD: 7, subtotalUSD: 21,
          product: { id: "p1b", brand: "Elfbar", model: "TE", flavor: "Cherry", puffs: "30000" } },
      ],
      totalItems: 8, totalUSDT: 56,
      defaultCommPct: 0, defaultPaseroPct: 0, defaultEnvioCostARS: 0,
      leadDays: 30,
    };
    const purchase = buildPurchaseFromRecommendation(reco, 1000);
    expect(purchase.groups).toHaveLength(1); // same brand+model+puffs
    expect(purchase.groups[0].flavors).toHaveLength(2);
  });
});
