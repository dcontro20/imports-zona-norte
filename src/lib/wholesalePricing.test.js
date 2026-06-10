import { describe, it, expect } from "vitest";
import { wholesaleDiscountForUnits, effectiveDiscountForClient, suggestWholesale } from "./wholesalePricing.js";

describe("wholesaleDiscountForUnits", () => {
  it("0% para <10u", () => {
    expect(wholesaleDiscountForUnits(5).discountPct).toBe(0);
    expect(wholesaleDiscountForUnits(9).discountPct).toBe(0);
  });
  it("10% desde 10u", () => {
    expect(wholesaleDiscountForUnits(10).discountPct).toBe(10);
    expect(wholesaleDiscountForUnits(15).discountPct).toBe(10);
  });
  it("15% desde 20u", () => {
    expect(wholesaleDiscountForUnits(20).discountPct).toBe(15);
    expect(wholesaleDiscountForUnits(50).discountPct).toBe(15);
  });
});

describe("effectiveDiscountForClient", () => {
  it("cliente regular sigue las reglas de unidades", () => {
    expect(effectiveDiscountForClient({ tier: "regular" }, 5).discountPct).toBe(0);
    expect(effectiveDiscountForClient({ tier: "regular" }, 15).discountPct).toBe(10);
  });

  it("cliente mayorista tiene mín 10% aunque pida poco", () => {
    expect(effectiveDiscountForClient({ tier: "mayorista" }, 2).discountPct).toBe(10);
  });

  it("cliente vip también tiene mín 10%", () => {
    expect(effectiveDiscountForClient({ tier: "vip" }, 2).discountPct).toBe(10);
  });

  it("mayorista que pide 20+ sube a 15%", () => {
    expect(effectiveDiscountForClient({ tier: "mayorista" }, 25).discountPct).toBe(15);
  });
});

describe("suggestWholesale", () => {
  it("sugiere para pedidos >=10u", () => {
    const s = suggestWholesale({ tier: "regular" }, 12);
    expect(s).toBeTruthy();
    expect(s.discountPct).toBe(10);
  });

  it("no sugiere para pedidos chicos sin tier", () => {
    expect(suggestWholesale({ tier: "regular" }, 3)).toBeNull();
  });

  it("razón distinta para cliente mayorista vs pedido grande", () => {
    expect(suggestWholesale({ tier: "mayorista" }, 5).reason).toMatch(/mayorista/);
    expect(suggestWholesale({ tier: "regular" }, 12).reason).toMatch(/Pedido/);
  });
});
