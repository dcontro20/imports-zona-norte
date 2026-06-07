import { describe, it, expect } from "vitest";
import { realProductIds, filterRealProducts, realProductsCount } from "./realProducts.js";

const CATALOG = [
  // Reales (con stock)
  { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon", stock: 5 },
  { id: "p2", brand: "Lost Mary", model: "BM", flavor: "Cherry", stock: 3 },
  // Real (sin stock pero apareció en venta histórica)
  { id: "p3", brand: "Geek", model: "Pulse", flavor: "Mango", stock: 0 },
  // Real (sin stock pero apareció en compra verificada)
  { id: "p4", brand: "Ignite", model: "V300", flavor: "Banana", stock: 0 },
  // FANTASMA del catálogo: stock 0, nunca vendido, nunca comprado
  { id: "p5", brand: "Nikbar", model: "X", flavor: "Vanilla", stock: 0 },
  { id: "p6", brand: "Supreme", model: "Y", flavor: "Tropical", stock: 0 },
  // Borrado (no cuenta nunca)
  { id: "p7", brand: "X", model: "Z", flavor: "Z", stock: 10, isDeleted: true },
];

const SALES = [
  { id: "s1", isDeleted: false, items: [{ productId: "p3", qty: 2 }] },
  { id: "s2", isDeleted: false, items: [{ productId: "p1", qty: 1 }] },
  { id: "s3", isDeleted: true, items: [{ productId: "p5", qty: 1 }] }, // venta borrada NO cuenta
];

const PURCHASES = [
  { id: "pu1", isDeleted: false, status: "verificado", items: [{ productId: "p4", qty: 5 }] },
  { id: "pu2", isDeleted: false, status: "pendiente", items: [{ productId: "p6", qty: 3 }] }, // no verificada NO cuenta
];

describe("realProductIds", () => {
  it("incluye productos con stock > 0", () => {
    const ids = realProductIds(CATALOG, [], []);
    expect(ids.has("p1")).toBe(true);
    expect(ids.has("p2")).toBe(true);
  });

  it("incluye productos vendidos aunque hoy estén en 0", () => {
    const ids = realProductIds(CATALOG, SALES, []);
    expect(ids.has("p3")).toBe(true);
  });

  it("incluye productos comprados (compra verificada) aunque hoy estén en 0", () => {
    const ids = realProductIds(CATALOG, [], PURCHASES);
    expect(ids.has("p4")).toBe(true);
  });

  it("EXCLUYE productos fantasma del catálogo (stock 0 + nunca vendidos/comprados)", () => {
    const ids = realProductIds(CATALOG, SALES, PURCHASES);
    expect(ids.has("p5")).toBe(false);
    expect(ids.has("p6")).toBe(false); // compra pendiente no lo hace real
  });

  it("EXCLUYE productos borrados aunque tengan stock", () => {
    const ids = realProductIds(CATALOG, [], []);
    expect(ids.has("p7")).toBe(false);
  });

  it("EXCLUYE ventas borradas para el cálculo", () => {
    const ids = realProductIds(CATALOG, SALES, []);
    expect(ids.has("p5")).toBe(false); // s3 está borrada
  });

  it("handles inputs vacíos sin romper", () => {
    expect(realProductIds([], [], []).size).toBe(0);
    expect(realProductIds(null, null, null).size).toBe(0);
  });
});

describe("filterRealProducts", () => {
  it("devuelve solo productos reales", () => {
    const real = filterRealProducts(CATALOG, SALES, PURCHASES);
    const ids = real.map(p => p.id);
    expect(ids).toContain("p1");
    expect(ids).toContain("p2");
    expect(ids).toContain("p3");
    expect(ids).toContain("p4");
    expect(ids).not.toContain("p5"); // fantasma
    expect(ids).not.toContain("p6"); // compra no verificada
    expect(ids).not.toContain("p7"); // borrado
  });
});

describe("realProductsCount", () => {
  it("cuenta solo reales", () => {
    expect(realProductsCount(CATALOG, SALES, PURCHASES)).toBe(4);
  });

  it("cuenta 0 si no hay nada real", () => {
    const fantasmaOnly = [
      { id: "x1", brand: "X", model: "Y", flavor: "Z", stock: 0 },
    ];
    expect(realProductsCount(fantasmaOnly, [], [])).toBe(0);
  });
});
