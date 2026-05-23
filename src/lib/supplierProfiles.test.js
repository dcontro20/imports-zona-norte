import { describe, it, expect } from "vitest";
import {
  SUPPLIER_COLORS,
  pickSupplierColor,
  emptySupplierProfile,
  buildSupplierProfile,
  activeProfiles,
  findProfileByName,
  computeSupplierStats,
  aliasKey,
  buildAlias,
  findAlias,
  upsertAlias,
  buildListEntry,
  markListSaved,
  priceHistoryForProductInSupplier,
  detectPriceChange,
} from "./supplierProfiles.js";

describe("pickSupplierColor", () => {
  it("returns a color from the palette", () => {
    const c = pickSupplierColor("Paraguay 1");
    expect(SUPPLIER_COLORS).toContain(c);
  });
  it("is deterministic for same name", () => {
    expect(pickSupplierColor("Paraguay 1")).toBe(pickSupplierColor("Paraguay 1"));
  });
  it("prefers untaken colors", () => {
    const taken = SUPPLIER_COLORS.slice(0, SUPPLIER_COLORS.length - 1);
    const c = pickSupplierColor("New", taken);
    expect(c).toBe(SUPPLIER_COLORS[SUPPLIER_COLORS.length - 1]);
  });
});

describe("emptySupplierProfile / buildSupplierProfile", () => {
  it("returns a profile with defaults", () => {
    const p = emptySupplierProfile();
    expect(p.name).toBe("");
    expect(p.color).toBe(SUPPLIER_COLORS[0]);
    expect(p.country).toBe("Paraguay");
    expect(p.defaultLeadDays).toBe(30);
    expect(p.isDeleted).toBe(false);
  });
  it("buildSupplierProfile assigns trimmed name and color", () => {
    const p = buildSupplierProfile("  Paraguay 1  ");
    expect(p.name).toBe("Paraguay 1");
    expect(SUPPLIER_COLORS).toContain(p.color);
  });
  it("buildSupplierProfile avoids colors already taken", () => {
    const existing = [
      { name: "A", color: SUPPLIER_COLORS[0], isDeleted: false },
      { name: "B", color: SUPPLIER_COLORS[1], isDeleted: false },
    ];
    const p = buildSupplierProfile("New", existing);
    expect([SUPPLIER_COLORS[0], SUPPLIER_COLORS[1]]).not.toContain(p.color);
  });
});

describe("activeProfiles / findProfileByName", () => {
  const profiles = [
    { id: "1", name: "Paraguay 1", isDeleted: false },
    { id: "2", name: "Paraguay 2", isDeleted: true },
    { id: "3", name: "Pesos Online", isDeleted: false },
  ];
  it("returns only non-deleted", () => {
    expect(activeProfiles(profiles)).toHaveLength(2);
  });
  it("findProfileByName matches case-insensitive", () => {
    expect(findProfileByName(profiles, "paraguay 1")?.id).toBe("1");
    expect(findProfileByName(profiles, "PARAGUAY 1")?.id).toBe("1");
  });
  it("findProfileByName excludes deleted", () => {
    expect(findProfileByName(profiles, "Paraguay 2")).toBeNull();
  });
  it("findProfileByName matches without accents", () => {
    const p = [{ id: "x", name: "Paraguáy 1", isDeleted: false }];
    expect(findProfileByName(p, "Paraguay 1")?.id).toBe("x");
  });
});

describe("computeSupplierStats", () => {
  const profile = { id: "1", name: "Paraguay 1" };
  it("computes counts and totals from purchases", () => {
    const purchases = [
      { id: "p1", supplier: "Paraguay 1", status: "verificado", totalUSDT: 1000, totalCostARS: 1500000, totalItems: 50, date: "2026-04-01" },
      { id: "p2", supplier: "Paraguay 1", status: "pedido", totalUSDT: 500, totalCostARS: 750000, totalItems: 25, date: "2026-05-01" },
      { id: "p3", supplier: "Paraguay 2", status: "verificado", totalUSDT: 800, totalCostARS: 1200000, totalItems: 40, date: "2026-04-15" },
    ];
    const stats = computeSupplierStats(profile, purchases);
    expect(stats.orderCount).toBe(2);
    expect(stats.totalUSDT).toBe(1500);
    expect(stats.verifiedCount).toBe(1);
    expect(stats.pendingCount).toBe(1);
    expect(stats.reliability).toBe(50);
  });

  it("computes average lead time from status history", () => {
    const purchases = [
      {
        id: "p1", supplier: "Paraguay 1", status: "verificado",
        date: "2026-04-01",
        statusHistory: [
          { status: "pedido", timestamp: "2026-04-01T00:00:00Z" },
          { status: "recibido", timestamp: "2026-04-21T00:00:00Z" }, // 20 days
        ],
      },
      {
        id: "p2", supplier: "Paraguay 1", status: "verificado",
        date: "2026-05-01",
        statusHistory: [
          { status: "pedido", timestamp: "2026-05-01T00:00:00Z" },
          { status: "recibido", timestamp: "2026-05-31T00:00:00Z" }, // 30 days
        ],
      },
    ];
    const stats = computeSupplierStats(profile, purchases);
    expect(stats.avgLeadTime).toBe(25);
  });

  it("returns 6 months of monthly spend", () => {
    const purchases = [
      { supplier: "Paraguay 1", totalCostARS: 100000, date: new Date().toISOString().slice(0, 10) },
    ];
    const stats = computeSupplierStats(profile, purchases);
    expect(stats.monthly).toHaveLength(6);
    expect(stats.monthly[5].total).toBe(100000); // current month
  });

  it("handles null profile gracefully", () => {
    expect(computeSupplierStats(null, [])).toBeNull();
  });

  it("excludes deleted purchases", () => {
    const purchases = [
      { supplier: "Paraguay 1", totalUSDT: 1000, isDeleted: true, date: "2026-01-01" },
      { supplier: "Paraguay 1", totalUSDT: 500, date: "2026-01-01" },
    ];
    const stats = computeSupplierStats(profile, purchases);
    expect(stats.totalUSDT).toBe(500);
  });
});

describe("aliasKey", () => {
  it("normalizes raw text", () => {
    expect(aliasKey("  Açai Banana ICE  ")).toBe("acai banana ice");
  });
  it("prefixes with supplierId if provided", () => {
    expect(aliasKey("Foo", "sup1")).toBe("sup1::foo");
  });
});

describe("buildAlias", () => {
  it("creates an alias with normalized rawKey", () => {
    const a = buildAlias("sup1", "Açai Banana", "prod1");
    expect(a.supplierId).toBe("sup1");
    expect(a.rawKey).toBe("acai banana");
    expect(a.productId).toBe("prod1");
    expect(a.hits).toBe(1);
    expect(a.id).toBeTruthy();
  });
});

describe("findAlias", () => {
  const aliases = [
    { id: "a1", supplierId: "sup1", rawKey: "watermelon ice", productId: "p1" },
    { id: "a2", supplierId: "sup2", rawKey: "watermelon ice", productId: "p2" }, // diferente supplier
    { id: "a3", supplierId: null, rawKey: "global flavor", productId: "p3" },
  ];

  it("finds alias matching supplier", () => {
    expect(findAlias(aliases, "Watermelon Ice", "sup1")?.id).toBe("a1");
    expect(findAlias(aliases, "Watermelon Ice", "sup2")?.id).toBe("a2");
  });

  it("falls back to global alias when supplier not found", () => {
    expect(findAlias(aliases, "global flavor", "sup1")?.id).toBe("a3");
  });

  it("returns null for unknown text", () => {
    expect(findAlias(aliases, "completamente desconocido", "sup1")).toBeNull();
  });

  it("normalizes input before searching", () => {
    expect(findAlias(aliases, "WATERMELON ICE", "sup1")?.id).toBe("a1");
  });
});

describe("upsertAlias", () => {
  it("inserts new alias", () => {
    const aliases = [];
    const next = upsertAlias(aliases, buildAlias("sup1", "X", "p1"));
    expect(next).toHaveLength(1);
  });

  it("increments hits for existing alias pointing to same product", () => {
    const initial = [buildAlias("sup1", "X", "p1")];
    const newAlias = buildAlias("sup1", "X", "p1");
    const next = upsertAlias(initial, newAlias);
    expect(next).toHaveLength(1);
    expect(next[0].hits).toBe(2);
  });

  it("replaces existing alias if it points to a different product", () => {
    const initial = [buildAlias("sup1", "X", "p1")];
    const newAlias = buildAlias("sup1", "X", "p2");
    const next = upsertAlias(initial, newAlias);
    expect(next).toHaveLength(1);
    expect(next[0].productId).toBe("p2");
  });

  it("global alias and supplier alias coexist", () => {
    const initial = [buildAlias(null, "X", "p1")];
    const newAlias = buildAlias("sup1", "X", "p2");
    const next = upsertAlias(initial, newAlias);
    expect(next).toHaveLength(2);
  });
});

describe("buildListEntry", () => {
  it("builds a compact entry from enriched items", () => {
    const items = [
      {
        brand: "Elfbar", model: "TE", flavor: "Watermelon Ice",
        qty: 20, priceUSD: 18, raw: "Elfbar TE Watermelon Ice",
        bestMatch: { product: { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon Ice", puffs: "30000" } },
        confidence: "high",
      },
    ];
    const entry = buildListEntry("sup1", "Paraguay 1", items, "spreadsheet", "file.xlsx");
    expect(entry.supplierId).toBe("sup1");
    expect(entry.supplierName).toBe("Paraguay 1");
    expect(entry.items).toHaveLength(1);
    expect(entry.totalItems).toBe(1);
    expect(entry.totalUSD).toBe(360); // 20 * 18
    expect(entry.items[0].matchedProductId).toBe("p1");
    expect(entry.saved).toBe(false);
  });

  it("strips bestMatch object (keeps only id)", () => {
    const items = [{ qty: 1, priceUSD: 1, bestMatch: { product: { id: "p1" } } }];
    const entry = buildListEntry("s", "S", items, "text");
    expect(entry.items[0].bestMatch).toBeUndefined();
    expect(entry.items[0].matchedProductId).toBe("p1");
  });
});

describe("markListSaved", () => {
  it("marks list as saved with purchaseId", () => {
    const lists = [
      { id: "l1", saved: false },
      { id: "l2", saved: false },
    ];
    const next = markListSaved(lists, "l1", "purch1");
    expect(next[0].saved).toBe(true);
    expect(next[0].purchaseId).toBe("purch1");
    expect(next[1].saved).toBe(false);
  });
});

describe("priceHistoryForProductInSupplier", () => {
  const lists = [
    {
      id: "l1", supplierId: "sup1", processedAt: "2026-01-01",
      items: [{ matchedProductId: "p1", priceUSD: 18 }, { matchedProductId: "p2", priceUSD: 14 }],
    },
    {
      id: "l2", supplierId: "sup1", processedAt: "2026-02-01",
      items: [{ matchedProductId: "p1", priceUSD: 19 }],
    },
    {
      id: "l3", supplierId: "sup2", processedAt: "2026-01-15",
      items: [{ matchedProductId: "p1", priceUSD: 16 }],
    },
  ];

  it("returns chronological prices for given supplier", () => {
    const history = priceHistoryForProductInSupplier(lists, "sup1", "p1");
    expect(history).toHaveLength(2);
    expect(history[0].priceUSD).toBe(18);
    expect(history[1].priceUSD).toBe(19);
  });

  it("excludes prices from other suppliers", () => {
    const history = priceHistoryForProductInSupplier(lists, "sup1", "p1");
    expect(history.every(h => h.priceUSD !== 16)).toBe(true);
  });

  it("returns empty for unknown product", () => {
    expect(priceHistoryForProductInSupplier(lists, "sup1", "unknown")).toEqual([]);
  });
});

describe("detectPriceChange", () => {
  it("detects significant increase", () => {
    const history = [{ date: "2026-01-01", priceUSD: 18 }];
    const change = detectPriceChange(history, 20);
    expect(change.direction).toBe("up");
    expect(change.changePct).toBeCloseTo(11.1, 1);
  });

  it("detects significant decrease", () => {
    const history = [{ date: "2026-01-01", priceUSD: 18 }];
    const change = detectPriceChange(history, 16);
    expect(change.direction).toBe("down");
  });

  it("returns null for small changes", () => {
    const history = [{ date: "2026-01-01", priceUSD: 18 }];
    expect(detectPriceChange(history, 18.5, 5)).toBeNull();
  });

  it("returns null for empty history", () => {
    expect(detectPriceChange([], 20)).toBeNull();
    expect(detectPriceChange(null, 20)).toBeNull();
  });
});
