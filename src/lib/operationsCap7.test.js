import { describe, it, expect } from "vitest";
import { calcEOQForProduct, reorderRecommendations } from "./eoq.js";
import { calcLeadTimes, recommendSupplierForUrgency } from "./leadTimeTracking.js";
import { calcShipping, shippingUpsell, getShippingZone, SHIPPING_ZONES } from "./shippingCalc.js";
import { createRMATicket, advanceRMATicket, calcRMAStats, RMA_STATUS_LABELS } from "./rmaWorkflow.js";

// ===== EOQ =====
describe("calcEOQForProduct", () => {
  it("calcula EOQ + reorder point para producto con datos", () => {
    const product = { id: "p1", priceUSD: 20, costUSDT: 10, stock: 8 };
    const stats = { velocity30dPerDay: 1 }; // 1 venta/día
    const result = calcEOQForProduct(product, stats);
    expect(result.eligible).toBe(true);
    expect(result.annualDemand).toBe(365);
    expect(result.eoq).toBeGreaterThan(0);
    expect(result.reorderPoint).toBeGreaterThan(0);
  });

  it("marca como inelegible si no hay velocidad", () => {
    const product = { id: "p1", priceUSD: 20, costUSDT: 10 };
    const stats = { velocity30dPerDay: 0 };
    expect(calcEOQForProduct(product, stats).eligible).toBe(false);
  });

  it("marca como inelegible si no hay costo", () => {
    const product = { id: "p1", priceUSD: 20 };
    const stats = { velocity30dPerDay: 1 };
    expect(calcEOQForProduct(product, stats).eligible).toBe(false);
  });

  it("shouldReorder=true cuando stock <= reorderPoint", () => {
    // Velocity 1/día, lead 30d, safety 7d → reorder ≈ 37
    const product = { id: "p1", priceUSD: 20, costUSDT: 10, stock: 10 };
    const stats = { velocity30dPerDay: 1 };
    const result = calcEOQForProduct(product, stats);
    expect(result.shouldReorder).toBe(true);
  });
});

describe("reorderRecommendations", () => {
  it("devuelve solo los que necesitan reposición", () => {
    const products = [
      { id: "p1", priceUSD: 20, costUSDT: 10, stock: 5 },   // necesita
      { id: "p2", priceUSD: 20, costUSDT: 10, stock: 200 }, // no
    ];
    const stats = { p1: { velocity30dPerDay: 1 }, p2: { velocity30dPerDay: 1 } };
    const r = reorderRecommendations(products, stats);
    expect(r.needsReorder.length).toBe(1);
    expect(r.needsReorder[0].product.id).toBe("p1");
  });
});

// ===== LEAD TIMES =====
describe("calcLeadTimes", () => {
  const purchases = [
    { supplier: "Paraguay 1", status: "verificado", date: "2026-05-01T00:00:00",
      statusHistory: [{ status: "verificado", at: "2026-05-25T00:00:00" }] },
    { supplier: "Paraguay 1", status: "verificado", date: "2026-04-01T00:00:00",
      statusHistory: [{ status: "verificado", at: "2026-04-30T00:00:00" }] },
    { supplier: "Paraguay 2", status: "verificado", date: "2026-05-01T00:00:00",
      statusHistory: [{ status: "verificado", at: "2026-05-20T00:00:00" }] },
    { supplier: "Paraguay 2", status: "cancelado", date: "2026-04-15T00:00:00" },
  ];

  it("calcula avg/min/max lead time por proveedor", () => {
    const result = calcLeadTimes(purchases);
    const p1 = result.find(r => r.supplier === "Paraguay 1");
    expect(p1.verifiedOrders).toBe(2);
    expect(p1.avgLeadTimeDays).toBeGreaterThan(0);
  });

  it("calcula reliabilityPct (verified / total)", () => {
    const result = calcLeadTimes(purchases);
    const p2 = result.find(r => r.supplier === "Paraguay 2");
    expect(p2.cancelledOrders).toBe(1);
    expect(p2.reliabilityPct).toBe(50); // 1/2
  });

  it("ordena más confiable primero", () => {
    const result = calcLeadTimes(purchases);
    expect(result[0].reliabilityPct).toBeGreaterThanOrEqual(result[1].reliabilityPct);
  });
});

describe("recommendSupplierForUrgency", () => {
  it("urgent prioriza velocidad", () => {
    const purchases = [
      { supplier: "Slow", status: "verificado", date: "2026-04-01T00:00:00",
        statusHistory: [{ status: "verificado", at: "2026-05-15T00:00:00" }] },
      { supplier: "Fast", status: "verificado", date: "2026-04-01T00:00:00",
        statusHistory: [{ status: "verificado", at: "2026-04-15T00:00:00" }] },
    ];
    const r = recommendSupplierForUrgency(purchases, { urgency: "urgent" });
    expect(r.supplier).toBe("Fast");
  });
});

// ===== SHIPPING =====
describe("calcShipping", () => {
  it("Nordelta es siempre gratis", () => {
    const r = calcShipping({ zoneId: "nordelta", orderTotalARS: 100 });
    expect(r.free).toBe(true);
    expect(r.costARS).toBe(0);
  });

  it("CABA cuesta $3000 normal", () => {
    const r = calcShipping({ zoneId: "caba", orderTotalARS: 10000, totalUnits: 1 });
    expect(r.costARS).toBe(3000);
    expect(r.free).toBe(false);
  });

  it("CABA gratis con pedido >=$60k", () => {
    const r = calcShipping({ zoneId: "caba", orderTotalARS: 60000, totalUnits: 1 });
    expect(r.free).toBe(true);
  });

  it("CABA gratis con 4+ unidades", () => {
    const r = calcShipping({ zoneId: "caba", orderTotalARS: 10000, totalUnits: 5 });
    expect(r.free).toBe(true);
  });
});

describe("shippingUpsell", () => {
  it("sugiere unidades extra si está cerca del umbral", () => {
    const u = shippingUpsell({ zoneId: "caba", orderTotalARS: 10000, totalUnits: 3 });
    expect(u).toBeTruthy();
    expect(u.message).toMatch(/1 unidad/);
  });

  it("devuelve null si ya tiene envío gratis", () => {
    expect(shippingUpsell({ zoneId: "nordelta" })).toBeNull();
    expect(shippingUpsell({ zoneId: "caba", orderTotalARS: 100000, totalUnits: 1 })).toBeNull();
  });
});

// ===== RMA =====
describe("createRMATicket + advanceRMATicket", () => {
  it("crea ticket con estado reportado", () => {
    const t = createRMATicket({ saleId: "s1", productId: "p1", clientId: "c1", reason: "no enciende", reportedBy: "Diego" });
    expect(t.status).toBe("reportado");
    expect(t.statusHistory).toHaveLength(1);
  });

  it("avanza estado y registra en history", () => {
    let t = createRMATicket({ saleId: "s1", productId: "p1", reason: "filtra" });
    t = advanceRMATicket(t, "en_revision");
    expect(t.status).toBe("en_revision");
    t = advanceRMATicket(t, "resuelto", { solution: "cambio_mismo_sabor" });
    expect(t.status).toBe("resuelto");
    expect(t.solution).toBe("cambio_mismo_sabor");
    expect(t.resolvedAt).toBeTruthy();
    expect(t.statusHistory.length).toBe(3);
  });
});

describe("calcRMAStats", () => {
  const products = [
    { id: "p1", brand: "Elfbar" },
    { id: "p2", brand: "Geek" },
  ];
  const tickets = [
    { productId: "p1", status: "resuelto", reportedAt: "2026-06-01", resolvedAt: "2026-06-03" },
    { productId: "p1", status: "rechazado", reportedAt: "2026-06-10", resolvedAt: "2026-06-11" },
    { productId: "p2", status: "reportado", reportedAt: "2026-06-15" },
  ];

  it("agrega counts por status", () => {
    const s = calcRMAStats(tickets, products);
    expect(s.totalTickets).toBe(3);
    expect(s.resolvedTickets).toBe(1);
    expect(s.rejectedTickets).toBe(1);
    expect(s.openTickets).toBe(1);
  });

  it("agrega por marca", () => {
    const s = calcRMAStats(tickets, products);
    expect(s.byBrand.Elfbar.tickets).toBe(2);
    expect(s.byBrand.Geek.tickets).toBe(1);
  });

  it("calcula avgResolutionDays", () => {
    const s = calcRMAStats(tickets, products);
    expect(s.avgResolutionDays).toBeGreaterThan(0);
  });
});
