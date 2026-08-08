// wholesale.test.js — margen del pedido mayorista.
// (F6 Pricing Engine: los tests de resolveTierPrice / hasTierPrice / mínimos
// por tier / volumeDiscount / applyPct se retiraron junto con las funciones —
// el precio mayorista ahora lo deriva el motor y se cotiza por escalón.)
import { describe, it, expect } from "vitest";
import { orderMargin } from "./wholesale.js";

const prod = (over = {}) => ({
  id: "p1", brand: "Elfbar", model: "TE", flavor: "Menta", priceUSD: 12,
  costUSDT: 6, priceByChannel: { mayorista_a: 10, mayorista_b: 9, mayorista_c: 8 },
  ...over,
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
