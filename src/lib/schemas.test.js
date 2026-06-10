import { describe, it, expect } from "vitest";
import { ProductSchema, SaleSchema, ClientSchema, ExpenseSchema, validateSoft, validateBatch } from "./schemas.js";

describe("ProductSchema", () => {
  it("acepta producto válido", () => {
    const r = validateSoft(ProductSchema, { id: "p1", brand: "Elfbar", priceUSD: 20, stock: 5 });
    expect(r.valid).toBe(true);
  });
  it("requiere id y brand", () => {
    const r = validateSoft(ProductSchema, { brand: "X" });
    expect(r.valid).toBe(false);
  });
  it("coerce strings numéricos a number", () => {
    const r = validateSoft(ProductSchema, { id: "p1", brand: "X", priceUSD: "25.5", stock: "3" });
    expect(r.valid).toBe(true);
    expect(r.data.priceUSD).toBe(25.5);
    expect(r.data.stock).toBe(3);
  });
  it("permite campos extra (passthrough)", () => {
    const r = validateSoft(ProductSchema, { id: "p1", brand: "X", customField: "valor" });
    expect(r.valid).toBe(true);
  });
});

describe("SaleSchema", () => {
  it("acepta venta válida con items", () => {
    const r = validateSoft(SaleSchema, {
      id: "s1", date: "2026-06-01", total: 50000, currency: "ARS",
      items: [{ productId: "p1", qty: 1 }],
    });
    expect(r.valid).toBe(true);
  });
  it("rechaza currency inválida", () => {
    const r = validateSoft(SaleSchema, { id: "s1", date: "2026-06-01", total: 100, currency: "EUR" });
    expect(r.valid).toBe(false);
  });
  it("default currency = ARS", () => {
    const r = validateSoft(SaleSchema, { id: "s1", date: "2026-06-01", total: 100 });
    expect(r.valid).toBe(true);
    expect(r.data.currency).toBe("ARS");
  });
});

describe("ClientSchema", () => {
  it("acepta cliente válido con tier vip", () => {
    const r = validateSoft(ClientSchema, { id: "c1", name: "Juan", tier: "vip" });
    expect(r.valid).toBe(true);
  });
  it("default tier = regular", () => {
    const r = validateSoft(ClientSchema, { id: "c1", name: "Juan" });
    expect(r.data.tier).toBe("regular");
  });
});

describe("ExpenseSchema", () => {
  it("acepta gasto válido", () => {
    expect(validateSoft(ExpenseSchema, { id: "e1", date: "2026-06-01", amountARS: 5000 }).valid).toBe(true);
  });
});

describe("validateBatch", () => {
  it("clasifica items en valid/invalid", () => {
    const items = [
      { id: "p1", brand: "X" },     // válido
      { id: "p2", brand: "Y" },     // válido
      { brand: "Z" },                // inválido (sin id)
    ];
    const r = validateBatch(ProductSchema, items);
    expect(r.totalChecked).toBe(3);
    expect(r.valid).toBe(2);
    expect(r.invalid).toBe(1);
  });

  it("handles array vacío", () => {
    const r = validateBatch(ProductSchema, []);
    expect(r.totalChecked).toBe(0);
  });
});
