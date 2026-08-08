// wholesale.edge.test.js — TANDA B.1, edge cases del margen del pedido.
// (F6 Pricing Engine: los edges de resolveTierPrice / mínimos por tier /
// volumeDiscount / applyPct se retiraron junto con las funciones.)
import { describe, it, expect } from "vitest";
import { orderMargin } from "./wholesale.js";

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
