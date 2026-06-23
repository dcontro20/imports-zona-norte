import { describe, it, expect } from "vitest";
import { monthRunRate, businessHealthScore, deadStockPct } from "./executiveMetrics.js";

describe("monthRunRate", () => {
  it("proyecta linealmente", () => {
    // 100k en 10 días de un mes de 30 → 300k proyectado
    const r = monthRunRate({ valueSoFar: 100000, dayOfMonth: 10, daysInMonth: 30 });
    expect(r.projected).toBe(300000);
    expect(r.perDay).toBe(10000);
    expect(r.pctOfMonth).toBe(33);
  });
  it("día 1 no divide por cero", () => {
    const r = monthRunRate({ valueSoFar: 5000, dayOfMonth: 0, daysInMonth: 30 });
    expect(r.projected).toBe(150000);
  });
});

describe("businessHealthScore", () => {
  it("negocio ideal → score alto, Excelente", () => {
    const r = businessHealthScore({ netMarginPct: 35, revenueDeltaPct: 30, deadStockPct: 0, debtRatio: 0 });
    expect(r.score).toBe(100);
    expect(r.label).toBe("Excelente");
  });
  it("negocio en problemas → score bajo, Riesgo", () => {
    const r = businessHealthScore({ netMarginPct: 2, revenueDeltaPct: -40, deadStockPct: 60, debtRatio: 0.8 });
    expect(r.score).toBeLessThan(35);
    expect(r.label).toBe("Riesgo");
  });
  it("factores intermedios suman parcial", () => {
    const r = businessHealthScore({ netMarginPct: 15, revenueDeltaPct: 0, deadStockPct: 20, debtRatio: 0.25 });
    // margin 15 (50% de 30), growth 12-13 (centro), stock 12-13 (mitad), debt 10 (mitad)
    expect(r.score).toBeGreaterThan(40);
    expect(r.score).toBeLessThan(70);
    expect(["Atención", "Sólido"]).toContain(r.label);
  });
  it("devuelve los 4 factores con su sub-score", () => {
    const r = businessHealthScore({ netMarginPct: 30 });
    const margin = r.factors.find(f => f.key === "margin");
    expect(margin.score).toBe(30);
    expect(margin.max).toBe(30);
    expect(r.factors).toHaveLength(4);
  });
  it("clamp: valores extremos no rompen el rango 0-100", () => {
    const hi = businessHealthScore({ netMarginPct: 999, revenueDeltaPct: 999, deadStockPct: -50, debtRatio: -1 });
    expect(hi.score).toBeLessThanOrEqual(100);
    const lo = businessHealthScore({ netMarginPct: -999, revenueDeltaPct: -999, deadStockPct: 999, debtRatio: 999 });
    expect(lo.score).toBeGreaterThanOrEqual(0);
  });
});

describe("deadStockPct", () => {
  const now = new Date("2026-06-23T12:00:00").getTime();
  it("0% si todo se vendió reciente", () => {
    const products = [{ id: "a", stock: 5 }, { id: "b", stock: 3 }];
    const sales = [{ date: "2026-06-20", items: [{ productId: "a" }, { productId: "b" }] }];
    expect(deadStockPct(products, sales, 60, now)).toBe(0);
  });
  it("50% si la mitad no rotó", () => {
    const products = [{ id: "a", stock: 5 }, { id: "b", stock: 3 }];
    const sales = [{ date: "2026-06-20", items: [{ productId: "a" }] }];
    expect(deadStockPct(products, sales, 60, now)).toBe(50);
  });
  it("ignora productos sin stock", () => {
    const products = [{ id: "a", stock: 0 }, { id: "b", stock: 3 }];
    const sales = [{ date: "2026-06-20", items: [{ productId: "b" }] }];
    expect(deadStockPct(products, sales, 60, now)).toBe(0);
  });
  it("0% si no hay stock", () => {
    expect(deadStockPct([], [], 60, now)).toBe(0);
  });
  it("venta vieja no cuenta como rotación", () => {
    const products = [{ id: "a", stock: 5 }];
    const sales = [{ date: "2026-01-01", items: [{ productId: "a" }] }];
    expect(deadStockPct(products, sales, 60, now)).toBe(100);
  });
});
