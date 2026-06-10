import { describe, it, expect } from "vitest";
import { lastNDaysSnapshot, simulateWhatIf, revenueNeededFor } from "./whatIfSimulator.js";

const NOW = new Date("2026-06-15T12:00:00");
const daysAgoISO = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const PRODUCTS = [
  { id: "p1", priceUSD: 20, costUSDT: 10 },
  { id: "p2", priceUSD: 15, costUSDT: 8 },
];

const SALES = [
  { date: daysAgoISO(2), total: 20000, currency: "ARS", exchangeRate: 1000,
    items: [{ productId: "p1", qty: 1, priceUSD: 20 }] },
  { date: daysAgoISO(10), total: 30000, currency: "ARS", exchangeRate: 1000,
    items: [{ productId: "p1", qty: 1, priceUSD: 20 }, { productId: "p2", qty: 1, priceUSD: 15 }] },
];

const EXPENSES = [
  { date: daysAgoISO(5), amountARS: 10000 },
];

describe("lastNDaysSnapshot", () => {
  it("calcula revenue, COGS, gastos, neto", () => {
    const snap = lastNDaysSnapshot({ sales: SALES, expenses: EXPENSES, products: PRODUCTS, exchangeRate: 1000, days: 30, now: NOW });
    expect(snap.revenueARS).toBe(50000);
    // COGS: 2× p1 (cost 10) + 1× p2 (cost 8) = 28 × 1000 = 28000
    expect(snap.cogsARS).toBe(28000);
    expect(snap.expensesARS).toBe(10000);
    expect(snap.netProfitARS).toBe(50000 - 28000 - 10000);
  });

  it("calcula margenes (gross y net)", () => {
    const snap = lastNDaysSnapshot({ sales: SALES, expenses: EXPENSES, products: PRODUCTS, exchangeRate: 1000, days: 30, now: NOW });
    expect(snap.grossMarginPct).toBeCloseTo(44, 0);
    expect(snap.netMarginPct).toBeCloseTo(24, 0);
  });
});

describe("simulateWhatIf", () => {
  const baseSnap = lastNDaysSnapshot({ sales: SALES, expenses: EXPENSES, products: PRODUCTS, exchangeRate: 1000, days: 30, now: NOW });

  it("priceDeltaPct +10% sube revenue 10% pero no COGS", () => {
    const sim = simulateWhatIf(baseSnap, { priceDeltaPct: 10 });
    expect(sim.revenueARS).toBe(Math.round(baseSnap.revenueARS * 1.1));
    expect(sim.cogsARS).toBe(baseSnap.cogsARS); // costos no cambian
    expect(sim.netProfitARS).toBeGreaterThan(baseSnap.netProfitARS);
  });

  it("costDeltaPct -20% baja COGS sin tocar revenue", () => {
    const sim = simulateWhatIf(baseSnap, { costDeltaPct: -20 });
    expect(sim.revenueARS).toBe(baseSnap.revenueARS);
    expect(sim.cogsARS).toBe(Math.round(baseSnap.cogsARS * 0.8));
    expect(sim.netProfitARS).toBeGreaterThan(baseSnap.netProfitARS);
  });

  it("volumeDeltaPct +50% escala revenue y COGS proporcionalmente", () => {
    const sim = simulateWhatIf(baseSnap, { volumeDeltaPct: 50 });
    expect(sim.revenueARS).toBe(Math.round(baseSnap.revenueARS * 1.5));
    expect(sim.cogsARS).toBe(Math.round(baseSnap.cogsARS * 1.5));
  });

  it("calcula delta vs base", () => {
    const sim = simulateWhatIf(baseSnap, { priceDeltaPct: 5 });
    expect(sim.deltas.revenueDeltaARS).toBeGreaterThan(0);
    expect(sim.deltas.netDeltaARS).toBeGreaterThan(0);
  });

  it("modifiers múltiples se combinan", () => {
    const sim = simulateWhatIf(baseSnap, { priceDeltaPct: 5, costDeltaPct: -10, expensesDeltaPct: -20 });
    // Tres mejoras → neto significativamente mejor
    expect(sim.netProfitARS).toBeGreaterThan(baseSnap.netProfitARS);
  });
});

describe("revenueNeededFor", () => {
  it("calcula revenue mensual necesario para llegar a un target de neto", () => {
    const snap = lastNDaysSnapshot({ sales: SALES, expenses: EXPENSES, products: PRODUCTS, exchangeRate: 1000, days: 30, now: NOW });
    // Margen neto ~24% → para llegar a $500k de neto necesitás ~$2.083k de revenue
    const r = revenueNeededFor(500000, snap);
    expect(r).toBeTruthy();
    expect(r.neededMonthlyRevenueARS).toBeGreaterThan(r.currentMonthlyRevenueARS);
    expect(r.netMarginPct).toBe(snap.netMarginPct);
  });

  it("devuelve null si margen neto es 0 o negativo", () => {
    const snap = { netProfitARS: -1000, revenueARS: 100000, netMarginPct: -1, days: 30 };
    expect(revenueNeededFor(50000, snap)).toBeNull();
  });
});
