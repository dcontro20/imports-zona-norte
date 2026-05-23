import { describe, it, expect } from "vitest";
import {
  PURCHASE_STATUSES,
  STATUS_DELAY_DAYS,
  resolvePurchaseProfile,
  expectedDelivery,
  statusDelayInfo,
  projectedROI,
  buildTimeline,
  isFromMonitor,
  groupByStatus,
  getNextStatus,
  aggregatePurchaseStats,
} from "./purchaseHelpers.js";

const PROFILES = [
  { id: "sup1", name: "Paraguay 1", color: "#5B3592", defaultLeadDays: 30, isDeleted: false },
  { id: "sup2", name: "Paraguay 2", color: "#0F6B5C", defaultLeadDays: 45, isDeleted: false },
];

const PRODUCTS = [
  { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon", priceUSD: 20 },
  { id: "p2", brand: "Lost Mary", model: "BM", flavor: "Cherry", priceUSD: 14 },
];

describe("PURCHASE_STATUSES", () => {
  it("has 4 statuses in order", () => {
    expect(PURCHASE_STATUSES.map(s => s.value)).toEqual([
      "pedido", "en_camino", "recibido", "verificado",
    ]);
  });
});

describe("resolvePurchaseProfile", () => {
  it("finds profile by supplier name", () => {
    const p = { supplier: "Paraguay 1" };
    expect(resolvePurchaseProfile(p, PROFILES)?.id).toBe("sup1");
  });
  it("returns null if no supplier", () => {
    expect(resolvePurchaseProfile({}, PROFILES)).toBeNull();
  });
  it("returns null if profile not found", () => {
    expect(resolvePurchaseProfile({ supplier: "Random" }, PROFILES)).toBeNull();
  });
  it("matches case-insensitive", () => {
    expect(resolvePurchaseProfile({ supplier: "PARAGUAY 1" }, PROFILES)?.id).toBe("sup1");
  });
});

describe("expectedDelivery", () => {
  it("computes ETA based on lead days", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
    const p = { status: "en_camino", date: tenDaysAgo,
      statusHistory: [{ status: "pedido", timestamp: tenDaysAgo }] };
    const eta = expectedDelivery(p, PROFILES[0]); // 30 day lead
    expect(eta).not.toBeNull();
    expect(eta.daysLeft).toBeGreaterThan(15);
    expect(eta.daysLeft).toBeLessThan(25);
    expect(eta.isOverdue).toBe(false);
  });

  it("flags overdue when past lead time", () => {
    const longAgo = new Date(Date.now() - 60 * 86400000).toISOString();
    const p = { status: "en_camino", date: longAgo,
      statusHistory: [{ status: "pedido", timestamp: longAgo }] };
    const eta = expectedDelivery(p, PROFILES[0]);
    expect(eta.isOverdue).toBe(true);
    expect(eta.daysLeft).toBeLessThan(0);
  });

  it("uses 30d default when no profile", () => {
    const today = new Date().toISOString();
    const p = { status: "pedido", date: today,
      statusHistory: [{ status: "pedido", timestamp: today }] };
    const eta = expectedDelivery(p, null);
    expect(eta.daysLeft).toBeGreaterThan(25);
    expect(eta.daysLeft).toBeLessThan(31);
  });

  it("returns null for verified orders", () => {
    expect(expectedDelivery({ status: "verificado", date: "2026-01-01" }, PROFILES[0])).toBeNull();
  });
});

describe("statusDelayInfo", () => {
  it("returns null when within limit", () => {
    const recent = new Date(Date.now() - 2 * 86400000).toISOString();
    const p = { status: "pedido", date: recent,
      statusHistory: [{ status: "pedido", timestamp: recent }] };
    expect(statusDelayInfo(p)).toBeNull();
  });

  it("detects warn severity (1-2x limit)", () => {
    const oldDate = new Date(Date.now() - 8 * 86400000).toISOString();
    const p = { status: "pedido", date: oldDate,
      statusHistory: [{ status: "pedido", timestamp: oldDate }] };
    const info = statusDelayInfo(p); // limit pedido=5, days=8 → warn
    expect(info.severity).toBe("warn");
    expect(info.days).toBeGreaterThan(5);
  });

  it("detects danger severity (>2x limit)", () => {
    const veryOld = new Date(Date.now() - 15 * 86400000).toISOString();
    const p = { status: "pedido", date: veryOld,
      statusHistory: [{ status: "pedido", timestamp: veryOld }] };
    const info = statusDelayInfo(p);
    expect(info.severity).toBe("danger");
  });

  it("returns null for verified", () => {
    expect(statusDelayInfo({ status: "verificado" })).toBeNull();
  });
});

describe("projectedROI", () => {
  it("computes revenue, profit, roi%", () => {
    const purchase = {
      items: [
        { productId: "p1", qty: 10 }, // priceUSD 20 × 10 × 1000 = 200000
        { productId: "p2", qty: 5 },  // priceUSD 14 × 5 × 1000 = 70000
      ],
      totalCostARS: 150000,
    };
    const roi = projectedROI(purchase, PRODUCTS, 1000);
    expect(roi.revenueARS).toBe(270000);
    expect(roi.cost).toBe(150000);
    expect(roi.profit).toBe(120000);
    expect(roi.roiPct).toBeCloseTo(80, 1);
  });

  it("returns null when no items or cost", () => {
    expect(projectedROI({ items: [], totalCostARS: 100 }, PRODUCTS, 1000)).toBeNull();
    expect(projectedROI({ items: [{ productId: "p1", qty: 1 }], totalCostARS: 0 }, PRODUCTS, 1000)).toBeNull();
  });

  it("handles unknown products gracefully", () => {
    const purchase = {
      items: [{ productId: "unknown", qty: 10 }],
      totalCostARS: 100,
    };
    const roi = projectedROI(purchase, PRODUCTS, 1000);
    expect(roi.revenueARS).toBe(0);
    expect(roi.profit).toBe(-100);
  });
});

describe("buildTimeline", () => {
  it("marks past, current and future steps", () => {
    const p = {
      status: "en_camino",
      date: "2026-01-01",
      statusHistory: [
        { status: "pedido", timestamp: "2026-01-01T10:00:00Z" },
        { status: "en_camino", timestamp: "2026-01-03T10:00:00Z" },
      ],
    };
    const t = buildTimeline(p);
    expect(t).toHaveLength(4);
    expect(t[0].isPast).toBe(true);     // pedido is past
    expect(t[1].isCurrent).toBe(true);  // en_camino is current
    expect(t[2].isFuture).toBe(true);   // recibido future
    expect(t[3].isFuture).toBe(true);   // verificado future
  });

  it("preserves notes and users from history", () => {
    const p = {
      status: "pedido",
      date: "2026-01-01",
      statusHistory: [
        { status: "pedido", timestamp: "2026-01-01", note: "hello", user: "Diego" },
      ],
    };
    const t = buildTimeline(p);
    expect(t[0].note).toBe("hello");
    expect(t[0].user).toBe("Diego");
  });
});

describe("isFromMonitor", () => {
  it("detects monitor mention in notes", () => {
    expect(isFromMonitor({ notes: "Generado desde Monitor" })).toBe(true);
    expect(isFromMonitor({ notes: "Otro origen" })).toBe(false);
    expect(isFromMonitor({})).toBe(false);
  });
});

describe("groupByStatus", () => {
  it("groups purchases by status", () => {
    const purchases = [
      { id: "1", status: "pedido", date: "2026-01-01" },
      { id: "2", status: "pedido", date: "2026-01-02" },
      { id: "3", status: "verificado", date: "2026-01-03" },
    ];
    const g = groupByStatus(purchases);
    expect(g.pedido).toHaveLength(2);
    expect(g.verificado).toHaveLength(1);
    expect(g.en_camino).toHaveLength(0);
  });

  it("excludes deleted purchases", () => {
    const purchases = [
      { id: "1", status: "pedido", date: "2026-01-01", isDeleted: true },
      { id: "2", status: "pedido", date: "2026-01-02" },
    ];
    expect(groupByStatus(purchases).pedido).toHaveLength(1);
  });

  it("sorts each group by date desc", () => {
    const purchases = [
      { id: "1", status: "pedido", date: "2026-01-01" },
      { id: "2", status: "pedido", date: "2026-02-01" },
    ];
    const g = groupByStatus(purchases);
    expect(g.pedido[0].id).toBe("2");
  });
});

describe("getNextStatus", () => {
  it("returns next in sequence", () => {
    expect(getNextStatus("pedido").value).toBe("en_camino");
    expect(getNextStatus("en_camino").value).toBe("recibido");
    expect(getNextStatus("recibido").value).toBe("verificado");
  });
  it("returns null at verified", () => {
    expect(getNextStatus("verificado")).toBeNull();
  });
});

describe("aggregatePurchaseStats", () => {
  it("counts purchases by status", () => {
    const purchases = [
      { status: "pedido", date: "2026-01-01" },
      { status: "pedido", date: "2026-01-01" },
      { status: "verificado", date: "2026-01-01" },
    ];
    const stats = aggregatePurchaseStats(purchases);
    expect(stats.byStatus.pedido).toBe(2);
    expect(stats.byStatus.verificado).toBe(1);
    expect(stats.totalPending).toBe(2);
  });

  it("counts USDT in transit (non-verified)", () => {
    const purchases = [
      { status: "pedido", totalUSDT: 100, date: "2026-01-01" },
      { status: "en_camino", totalUSDT: 200, date: "2026-01-01" },
      { status: "verificado", totalUSDT: 500, date: "2026-01-01" },
    ];
    const stats = aggregatePurchaseStats(purchases);
    expect(stats.totalUSDTinTransit).toBe(300);
  });

  it("counts overdue (danger severity)", () => {
    const veryOld = new Date(Date.now() - 15 * 86400000).toISOString();
    const purchases = [
      { status: "pedido", date: veryOld,
        statusHistory: [{ status: "pedido", timestamp: veryOld }] },
    ];
    const stats = aggregatePurchaseStats(purchases);
    expect(stats.overdueCount).toBe(1);
  });
});
