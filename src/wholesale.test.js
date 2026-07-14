import { describe, it, expect } from "vitest";
import {
  resolveTierPrice, hasTierPrice,
  minOrderForTier, validateOrderMinimum,
  volumeDiscount, applyPct, DEFAULT_VOLUME_BREAKS,
  orderMargin,
} from "./wholesale.js";

const prod = (over = {}) => ({
  id: "p1", brand: "Elfbar", model: "BC10000", flavor: "Watermelon",
  priceUSD: 12, priceARS: 16980, costUSDT: 6,
  priceByChannel: { mayorista_a: 10, mayorista_b: 9, mayorista_c: 8 },
  ...over,
});

describe("resolveTierPrice", () => {
  it("devuelve el precio de la lista del tier (A/B/C)", () => {
    expect(resolveTierPrice(prod(), "A")).toBe(10);
    expect(resolveTierPrice(prod(), "B")).toBe(9);
    expect(resolveTierPrice(prod(), "C")).toBe(8);
  });
  it("es case-insensitive en el tier", () => {
    expect(resolveTierPrice(prod(), "a")).toBe(10);
  });
  it("cae al precio base si el tier no tiene lista", () => {
    const p = prod({ priceByChannel: { mayorista_a: 10 } });
    expect(resolveTierPrice(p, "B")).toBe(12); // fallback priceUSD
  });
  it("tier inválido → precio base", () => {
    expect(resolveTierPrice(prod(), null)).toBe(12);
    expect(resolveTierPrice(prod(), "Z")).toBe(12);
  });
  it("soporta ARS", () => {
    const p = prod({ priceByChannel: {} });
    expect(resolveTierPrice(p, "A", "ARS")).toBe(16980);
  });
  it("no crashea sin producto", () => {
    expect(resolveTierPrice(null, "A")).toBe(0);
  });
});

describe("hasTierPrice", () => {
  it("true si hay override para el tier", () => {
    expect(hasTierPrice(prod(), "A")).toBe(true);
  });
  it("false si no hay override", () => {
    expect(hasTierPrice(prod({ priceByChannel: {} }), "A")).toBe(false);
    expect(hasTierPrice(null, "A")).toBe(false);
  });
});

describe("minOrderForTier + validateOrderMinimum", () => {
  it("default sin mínimos (opt-in)", () => {
    expect(minOrderForTier("A")).toEqual({ minUnits: 0, minARS: 0 });
    expect(validateOrderMinimum({ tier: "A", totalUnits: 1, totalARS: 100 }).ok).toBe(true);
  });
  it("valida mínimo de unidades cuando está configurado", () => {
    const cfg = { A: { minUnits: 24, minARS: 0 }, B: { minUnits: 0, minARS: 0 }, C: { minUnits: 0, minARS: 0 } };
    const r = validateOrderMinimum({ tier: "A", totalUnits: 10 }, cfg);
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toContain("24u");
  });
  it("valida mínimo en ARS", () => {
    const cfg = { A: { minUnits: 0, minARS: 50000 } };
    const r = validateOrderMinimum({ tier: "A", totalARS: 20000 }, cfg);
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toContain("Mínimo");
  });
  it("ok cuando cumple ambos mínimos", () => {
    const cfg = { A: { minUnits: 10, minARS: 5000 } };
    expect(validateOrderMinimum({ tier: "A", totalUnits: 12, totalARS: 8000 }, cfg).ok).toBe(true);
  });
});

describe("volumeDiscount (complemento opcional)", () => {
  it("0% por debajo del primer break", () => {
    expect(volumeDiscount(5).pct).toBe(0);
  });
  it("aplica el break más alto alcanzado", () => {
    expect(volumeDiscount(24).pct).toBe(3);
    expect(volumeDiscount(60).pct).toBe(6);
    expect(volumeDiscount(200).pct).toBe(10);
  });
  it("respeta breaks custom", () => {
    const breaks = [{ minUnits: 0, pct: 0 }, { minUnits: 50, pct: 20 }];
    expect(volumeDiscount(50, breaks).pct).toBe(20);
    expect(volumeDiscount(49, breaks).pct).toBe(0);
  });
  it("no crashea con 0 o negativos", () => {
    expect(volumeDiscount(0).pct).toBe(0);
    expect(volumeDiscount(-5).pct).toBe(0);
  });
  it("DEFAULT_VOLUME_BREAKS está ordenado y arranca en 0", () => {
    expect(DEFAULT_VOLUME_BREAKS[0].minUnits).toBe(0);
  });
});

describe("applyPct", () => {
  it("aplica descuento correctamente", () => {
    expect(applyPct(100, 10)).toBe(90);
    expect(applyPct(10, 3)).toBe(9.7);
  });
  it("clamp a [0,100] y sin producto = 0", () => {
    expect(applyPct(100, -5)).toBe(100);
    expect(applyPct(100, 150)).toBe(0);
    expect(applyPct(null, 10)).toBe(0);
  });
});

describe("orderMargin", () => {
  it("calcula margen por línea y total", () => {
    const lines = [
      { product: prod({ costUSDT: 6 }), qty: 10, unitPriceUSD: 10 }, // rev 100, cost 60, margin 40 (40%)
      { product: prod({ id: "p2", costUSDT: 4, avgCostUSDT: 0 }), qty: 5, unitPriceUSD: 8 }, // rev 40, cost 20, margin 20 (50%)
    ];
    const m = orderMargin({ lines });
    expect(m.totalRevenueUSD).toBe(140);
    expect(m.totalCostUSD).toBe(80);
    expect(m.totalMarginUSD).toBe(60);
    expect(m.marginPct).toBeCloseTo(42.9, 1);
    expect(m.totalUnits).toBe(15);
    expect(m.perLine[0].marginPct).toBe(40);
    expect(m.perLine[1].marginPct).toBe(50);
  });
  it("usa avgCostUSDT si existe (costo real ponderado)", () => {
    const lines = [{ product: prod({ costUSDT: 6, avgCostUSDT: 5 }), qty: 10, unitPriceUSD: 10 }];
    const m = orderMargin({ lines });
    expect(m.totalCostUSD).toBe(50); // usa avg 5, no manual 6
  });
  it("no crashea con lista vacía", () => {
    const m = orderMargin({ lines: [] });
    expect(m.totalRevenueUSD).toBe(0);
    expect(m.marginPct).toBe(0);
  });
});
