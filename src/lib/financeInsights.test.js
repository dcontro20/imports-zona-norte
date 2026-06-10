import { describe, it, expect } from "vitest";
import { ticketDistribution, purchaseBatchPerformance, monthlySeasonality } from "./financeInsights.js";

const NOW = new Date("2026-06-15T12:00:00");
const daysAgoISO = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe("ticketDistribution", () => {
  it("calcula avg, median, p25, p75", () => {
    const sales = [
      { date: daysAgoISO(1), total: 10000, currency: "ARS" },
      { date: daysAgoISO(2), total: 20000, currency: "ARS" },
      { date: daysAgoISO(3), total: 30000, currency: "ARS" },
      { date: daysAgoISO(4), total: 40000, currency: "ARS" },
      { date: daysAgoISO(5), total: 50000, currency: "ARS" },
    ];
    const d = ticketDistribution(sales, 1000, { now: NOW });
    expect(d.count).toBe(5);
    expect(d.avg).toBe(30000);
    expect(d.median).toBe(30000);
    expect(d.min).toBe(10000);
    expect(d.max).toBe(50000);
  });

  it("la mediana NO se infla con un ticket grande aislado", () => {
    const sales = [
      ...Array.from({ length: 9 }, (_, i) => ({ date: daysAgoISO(i + 1), total: 10000, currency: "ARS" })),
      { date: daysAgoISO(10), total: 1000000, currency: "ARS" }, // outlier
    ];
    const d = ticketDistribution(sales, 1000, { now: NOW });
    expect(d.median).toBe(10000); // mediana resistente
    expect(d.avg).toBeGreaterThan(d.median); // el avg sí se infla
  });

  it("genera histograma con 6 buckets", () => {
    const sales = [
      { date: daysAgoISO(1), total: 5000, currency: "ARS" },
      { date: daysAgoISO(2), total: 15000, currency: "ARS" },
      { date: daysAgoISO(3), total: 75000, currency: "ARS" },
    ];
    const d = ticketDistribution(sales, 1000, { now: NOW });
    expect(d.histogram).toHaveLength(6);
    expect(d.histogram.reduce((s, h) => s + h.count, 0)).toBe(3);
  });

  it("filtra solo las ventas en la ventana sinceDays", () => {
    const sales = [
      { date: daysAgoISO(5), total: 10000, currency: "ARS" },
      { date: daysAgoISO(120), total: 10000, currency: "ARS" }, // fuera de 90d
    ];
    const d = ticketDistribution(sales, 1000, { sinceDays: 90, now: NOW });
    expect(d.count).toBe(1);
  });

  it("handles vacío", () => {
    expect(ticketDistribution([], 1000, { now: NOW }).count).toBe(0);
  });
});

describe("purchaseBatchPerformance", () => {
  const purchases = [
    {
      id: "lote1", status: "verificado", date: daysAgoISO(60),
      supplier: "Paraguay 1", loteNumber: "L-001",
      totalUSDT: 100,
      items: [{ productId: "p1", qty: 10 }],
    },
    {
      id: "lote2", status: "verificado", date: daysAgoISO(30),
      supplier: "Paraguay 2", loteNumber: "L-002",
      totalUSDT: 50,
      items: [{ productId: "p2", qty: 5 }],
    },
    {
      id: "lote3", status: "pendiente", // no cuenta — no verificado
      totalUSDT: 999,
      items: [],
    },
  ];

  const sales = [
    // Lote 1: vendió 8 de 10 a $20 USD c/u → revenue = 160 USD × 1000 = 160k
    ...Array.from({ length: 8 }, (_, i) => ({
      date: daysAgoISO(50 - i), isDeleted: false,
      currency: "USD", exchangeRate: 1000,
      items: [{ productId: "p1", qty: 1, priceUSD: 20 }],
    })),
    // Lote 2: vendió 5 de 5 a $15 USD c/u → revenue = 75 USD × 1000 = 75k
    ...Array.from({ length: 5 }, (_, i) => ({
      date: daysAgoISO(20 - i), isDeleted: false,
      currency: "USD", exchangeRate: 1000,
      items: [{ productId: "p2", qty: 1, priceUSD: 15 }],
    })),
  ];

  it("calcula ROI por lote correctamente", () => {
    const perf = purchaseBatchPerformance({ purchases, sales, exchangeRate: 1000 });
    expect(perf).toHaveLength(2); // pendiente excluido
    const l1 = perf.find(p => p.loteId === "lote1");
    expect(l1.unitsSold).toBe(8);
    expect(l1.sellThroughPct).toBe(80);
    expect(l1.costARS).toBe(100000);
    expect(l1.revenueARS).toBe(160000);
    expect(l1.roiPct).toBeCloseTo(60, 0);
  });

  it("ordena por roiPct desc", () => {
    const perf = purchaseBatchPerformance({ purchases, sales, exchangeRate: 1000 });
    for (let i = 1; i < perf.length; i++) {
      expect(perf[i].roiPct).toBeLessThanOrEqual(perf[i - 1].roiPct);
    }
  });

  it("excluye lotes no verificados", () => {
    const perf = purchaseBatchPerformance({ purchases, sales, exchangeRate: 1000 });
    expect(perf.find(p => p.loteId === "lote3")).toBeFalsy();
  });
});

describe("monthlySeasonality", () => {
  it("genera 12 meses (default) con label en español", () => {
    const s = monthlySeasonality([], 1000, { now: NOW });
    expect(s.months).toHaveLength(12);
    expect(s.months[0].label).toMatch(/[a-z]{3}\.?\s\d{2}/i);
  });

  it("marca meses como strong/weak/empty vs promedio", () => {
    // Mes actual 200k, todos los anteriores 100k → mes actual = strong
    const sales = [
      ...Array.from({ length: 11 }, (_, i) => ({
        date: `2026-${String((i % 12) + 1).padStart(2, "0")}-15`,
        total: 100000, currency: "ARS",
      })),
      { date: "2026-06-01", total: 200000, currency: "ARS" },
    ];
    const s = monthlySeasonality(sales, 1000, { now: NOW });
    const junio = s.months.find(m => m.key === "2026-06");
    expect(junio.strength).toBe("strong");
  });

  it("calcula avgMonthly sobre los meses con datos", () => {
    const sales = [
      { date: "2026-04-01", total: 50000, currency: "ARS" },
      { date: "2026-05-01", total: 100000, currency: "ARS" },
    ];
    const s = monthlySeasonality(sales, 1000, { now: NOW });
    expect(s.avgMonthly).toBe(75000); // promedio de los 2 con datos
  });
});
