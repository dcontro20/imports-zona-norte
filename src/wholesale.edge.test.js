import { describe, it, expect } from "vitest";
import {
  resolveTierPrice, hasTierPrice, minOrderForTier, validateOrderMinimum,
  volumeDiscount, applyPct, orderMargin,
} from "./wholesale.js";

// TANDA B.1 — edge cases de pricing por tier. Objetivo: ninguna cuenta debe dar
// NaN/Infinity ni romper con entradas raras. NO se toca la lógica.

describe("B.1 resolveTierPrice — bordes", () => {
  it("producto sin priceByChannel → precio base", () => {
    expect(resolveTierPrice({ priceUSD: 12 }, "A")).toBe(12);
    expect(resolveTierPrice({ priceUSD: 12, priceByChannel: {} }, "B")).toBe(12);
  });
  it("tier vacío o inválido → precio base", () => {
    expect(resolveTierPrice({ priceUSD: 12 }, "")).toBe(12);
    expect(resolveTierPrice({ priceUSD: 12 }, "X")).toBe(12);
    expect(resolveTierPrice({ priceUSD: 12 }, undefined)).toBe(12);
  });
  it("precio 0 → 0 (no rompe, no NaN)", () => {
    expect(resolveTierPrice({ priceUSD: 0, priceByChannel: { mayorista_a: 0 } }, "A")).toBe(0);
    expect(resolveTierPrice({ priceUSD: 0 }, "B")).toBe(0);
  });
  it("producto sin priceUSD → 0", () => {
    expect(resolveTierPrice({}, "A")).toBe(0);
    expect(Number.isNaN(resolveTierPrice({}, "A"))).toBe(false);
  });
});

describe("B.1 hasTierPrice — bordes", () => {
  it("precio 0 no cuenta como override válido", () => {
    expect(hasTierPrice({ priceByChannel: { mayorista_a: 0 } }, "A")).toBe(false);
  });
  it("sin producto/tier", () => {
    expect(hasTierPrice(undefined, "A")).toBe(false);
    expect(hasTierPrice({ priceByChannel: {} }, undefined)).toBe(false);
  });
});

describe("B.1 validateOrderMinimum — bordes exactos", () => {
  it("cantidad exacta al mínimo pasa (>=)", () => {
    const cfg = { A: { minUnits: 24, minARS: 0 } };
    expect(validateOrderMinimum({ tier: "A", totalUnits: 24 }, cfg).ok).toBe(true);
    expect(validateOrderMinimum({ tier: "A", totalUnits: 23 }, cfg).ok).toBe(false);
  });
  it("ARS exacto al mínimo pasa", () => {
    const cfg = { A: { minUnits: 0, minARS: 50000 } };
    expect(validateOrderMinimum({ tier: "A", totalARS: 50000 }, cfg).ok).toBe(true);
    expect(validateOrderMinimum({ tier: "A", totalARS: 49999 }, cfg).ok).toBe(false);
  });
  it("tier sin config → sin mínimo", () => {
    expect(validateOrderMinimum({ tier: "Z", totalUnits: 0 }, {}).ok).toBe(true);
  });
});

describe("B.1 volumeDiscount — breakpoints exactos", () => {
  it("justo en 24 / 60 / 120", () => {
    expect(volumeDiscount(24).pct).toBe(3);
    expect(volumeDiscount(60).pct).toBe(6);
    expect(volumeDiscount(120).pct).toBe(10);
  });
  it("uno menos que el breakpoint", () => {
    expect(volumeDiscount(23).pct).toBe(0);
    expect(volumeDiscount(59).pct).toBe(3);
    expect(volumeDiscount(119).pct).toBe(6);
  });
  it("cantidad fraccionaria", () => {
    expect(volumeDiscount(23.9).pct).toBe(0);
    expect(volumeDiscount(24.5).pct).toBe(3);
  });
});

describe("B.1 applyPct — bordes", () => {
  it("precio 0 → 0", () => {
    expect(applyPct(0, 10)).toBe(0);
  });
  it("descuento 0 → precio intacto", () => {
    expect(applyPct(10, 0)).toBe(10);
  });
});

describe("B.1 orderMargin — no NaN/Infinity", () => {
  it("producto sin costo → margen 100%, no NaN", () => {
    const m = orderMargin({ lines: [{ product: { priceUSD: 10 }, qty: 5, unitPriceUSD: 10 }] });
    expect(m.totalCostUSD).toBe(0);
    expect(m.marginPct).toBe(100);
    expect(Number.isNaN(m.marginPct)).toBe(false);
  });
  it("qty 0 → línea en 0, marginPct 0 (no división por cero)", () => {
    const m = orderMargin({ lines: [{ product: { costUSDT: 5 }, qty: 0, unitPriceUSD: 10 }] });
    expect(m.totalRevenueUSD).toBe(0);
    expect(m.marginPct).toBe(0);
    expect(Number.isFinite(m.marginPct)).toBe(true);
  });
  it("qty fraccionaria calcula proporcional", () => {
    const m = orderMargin({ lines: [{ product: { costUSDT: 4 }, qty: 2.5, unitPriceUSD: 10 }] });
    expect(m.totalRevenueUSD).toBe(25);
    expect(m.totalCostUSD).toBe(10);
  });
  it("unitPrice 0 (regalo) con costo → margen negativo controlado, no NaN", () => {
    const m = orderMargin({ lines: [{ product: { costUSDT: 5 }, qty: 2, unitPriceUSD: 0 }] });
    expect(m.totalRevenueUSD).toBe(0);
    // revenue 0 → marginPct guardado en 0 (no -Infinity)
    expect(Number.isFinite(m.marginPct)).toBe(true);
  });
  it("línea sin product no rompe", () => {
    const m = orderMargin({ lines: [{ qty: 3, unitPriceUSD: 10 }] });
    expect(m.totalRevenueUSD).toBe(30);
    expect(m.totalCostUSD).toBe(0);
  });
});
