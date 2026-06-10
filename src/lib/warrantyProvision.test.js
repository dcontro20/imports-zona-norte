import { describe, it, expect } from "vitest";
import { calcWarrantyRate, warrantyProvisionForPeriod } from "./warrantyProvision.js";

const NOW = new Date("2026-06-15T12:00:00");

describe("calcWarrantyRate", () => {
  it("calcula tasa = garantías / revenue del período", () => {
    const sales = [
      { date: "2026-05-01", total: 100000, currency: "ARS" },
      { date: "2026-05-15", total: 100000, currency: "ARS" },
    ];
    const withdrawals = [
      { date: "2026-05-10", withdrawType: "Garantía", costEstimateARS: 6000 },
    ];
    const r = calcWarrantyRate({ sales, withdrawals, exchangeRate: 1000, monthsBack: 6, now: NOW });
    expect(r.revenueARS).toBe(200000);
    expect(r.warrantyCostARS).toBe(6000);
    expect(r.ratePct).toBe(3); // 6000/200000 = 3%
  });

  it("rate 0 si no hay garantías", () => {
    const sales = [{ date: "2026-05-01", total: 100000, currency: "ARS" }];
    const r = calcWarrantyRate({ sales, withdrawals: [], now: NOW });
    expect(r.ratePct).toBe(0);
  });

  it("ignora withdrawals que no son garantía", () => {
    const sales = [{ date: "2026-05-01", total: 100000, currency: "ARS" }];
    const withdrawals = [
      { date: "2026-05-10", withdrawType: "Consumo propio", costEstimateARS: 10000 },
    ];
    const r = calcWarrantyRate({ sales, withdrawals, now: NOW });
    expect(r.warrantyCostARS).toBe(0);
  });
});

describe("warrantyProvisionForPeriod", () => {
  it("calcula provisión = revenue × rate", () => {
    const sales = [{ date: "2026-06-10", total: 100000, currency: "ARS" }];
    const r = warrantyProvisionForPeriod({
      sales, from: "2026-06-01", to: "2026-06-30", exchangeRate: 1000,
      ratePct: 3, // 3% explícito
    });
    expect(r.revenueARS).toBe(100000);
    expect(r.provisionARS).toBe(3000);
  });

  it("detecta deficit cuando garantías reales > provisión", () => {
    const sales = [{ date: "2026-06-10", total: 100000, currency: "ARS" }];
    const withdrawals = [
      { date: "2026-06-12", withdrawType: "Garantía", costEstimateARS: 5000 },
    ];
    const r = warrantyProvisionForPeriod({
      sales, withdrawals,
      from: "2026-06-01", to: "2026-06-30", exchangeRate: 1000, ratePct: 3,
    });
    expect(r.actualWarrantyARS).toBe(5000);
    expect(r.diff).toBe(-2000);
    expect(r.status).toBe("deficit");
  });

  it("usa fallback rate si no hay historia", () => {
    const sales = [{ date: "2026-06-10", total: 100000, currency: "ARS" }];
    const r = warrantyProvisionForPeriod({
      sales, from: "2026-06-01", to: "2026-06-30", exchangeRate: 1000,
      fallbackRate: 4,
    });
    expect(r.ratePct).toBe(4);
    expect(r.provisionARS).toBe(4000);
  });
});
