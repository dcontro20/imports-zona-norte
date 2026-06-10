import { describe, it, expect } from "vitest";
import { forecastMonthClose, forecastCashFlow } from "./financeForecast.js";

const NOW = new Date("2026-06-15T12:00:00"); // junio, día 15 de 30
const daysAgoISO = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe("forecastMonthClose", () => {
  it("calcula revenueSoFar del mes actual", () => {
    const sales = [
      { date: "2026-06-01T10:00", total: 30000, currency: "ARS" },
      { date: "2026-06-10T10:00", total: 20000, currency: "ARS" },
      { date: "2026-05-30T10:00", total: 999999, currency: "ARS" }, // mes anterior
    ];
    const f = forecastMonthClose(sales, 1000, NOW);
    expect(f.revenueSoFar).toBe(50000);
  });

  it("proyecta cierre extrapolando los últimos 14 días", () => {
    const sales = [
      // 5 ventas en los últimos 14 días, $20k cada una = $100k / 14 = ~7142/día
      { date: daysAgoISO(1), total: 20000, currency: "ARS" },
      { date: daysAgoISO(3), total: 20000, currency: "ARS" },
      { date: daysAgoISO(5), total: 20000, currency: "ARS" },
      { date: daysAgoISO(8), total: 20000, currency: "ARS" },
      { date: daysAgoISO(12), total: 20000, currency: "ARS" },
    ];
    const f = forecastMonthClose(sales, 1000, NOW);
    expect(f.dailyAvgLast14).toBeGreaterThan(0);
    // Cierre proyectado > revenue actual (porque quedan 15d × rate)
    expect(f.projectedClose).toBeGreaterThan(f.revenueSoFar);
  });

  it("compara con mes anterior y calcula growthPct", () => {
    const sales = [
      { date: "2026-06-01", total: 50000, currency: "ARS" },
      { date: "2026-05-15", total: 100000, currency: "ARS" }, // mes anterior
    ];
    const f = forecastMonthClose(sales, 1000, NOW);
    expect(f.lastMonthRevenue).toBe(100000);
    expect(typeof f.growthPct).toBe("number");
  });

  it("growthPct = null si el mes anterior fue 0", () => {
    const sales = [{ date: "2026-06-01", total: 50000, currency: "ARS" }];
    const f = forecastMonthClose(sales, 1000, NOW);
    expect(f.growthPct).toBeNull();
  });

  it("handles ventas vacías", () => {
    const f = forecastMonthClose([], 1000, NOW);
    expect(f.revenueSoFar).toBe(0);
    expect(f.projectedClose).toBe(0);
  });

  it("convierte USD a ARS con el rate de la venta", () => {
    const sales = [
      { date: "2026-06-10", total: 20, currency: "USD", exchangeRate: 1500 },
    ];
    const f = forecastMonthClose(sales, 1000, NOW);
    expect(f.revenueSoFar).toBe(30000); // 20 × 1500
  });
});

describe("forecastCashFlow", () => {
  it("proyecta cash en horizontes 30/60/90", () => {
    const sales = [
      { date: daysAgoISO(1), total: 10000, currency: "ARS" },
      { date: daysAgoISO(2), total: 10000, currency: "ARS" },
    ];
    const f = forecastCashFlow({ currentCashARS: 100000, sales, exchangeRate: 1000, now: NOW });
    expect(f.horizons).toHaveLength(3);
    expect(f.horizons[0].days).toBe(30);
    expect(f.horizons[1].days).toBe(60);
    expect(f.horizons[2].days).toBe(90);
  });

  it("incluye compras pendientes como egreso futuro", () => {
    const purchases = [
      { status: "en_camino", totalUSDT: 100 }, // 100 × 1000 = 100k ARS
      { status: "verificado", totalUSDT: 999 }, // verificado NO cuenta
    ];
    const f = forecastCashFlow({ currentCashARS: 200000, purchases, exchangeRate: 1000, now: NOW });
    expect(f.pendingPurchasesARS).toBe(100000);
    expect(f.dailyOutflow).toBeGreaterThan(0);
  });

  it("cash queda peor en horizontes más largos si netDaily es negativo", () => {
    const expenses = [
      { date: "2026-06-01", amountARS: 60000 }, // 2k/día durante 30
    ];
    const f = forecastCashFlow({ currentCashARS: 100000, expenses, exchangeRate: 1000, now: NOW });
    expect(f.netDaily).toBeLessThan(0);
    // 30 días peor que actual
    expect(f.horizons[0].projectedCash).toBeLessThan(100000);
    // 90 días peor que 30
    expect(f.horizons[2].projectedCash).toBeLessThan(f.horizons[0].projectedCash);
  });

  it("handles todo vacío", () => {
    const f = forecastCashFlow({});
    expect(f.horizons).toHaveLength(3);
    expect(f.currentCashARS).toBe(0);
  });
});
