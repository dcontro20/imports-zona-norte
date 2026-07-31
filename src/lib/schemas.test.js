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

// === CRM de prospección (ciclo B3) ===
import { ProspectSchema, VisitSchema, RouteSchema, DiscoverySuppressedSchema } from "./schemas.js";

describe("ProspectSchema (B3)", () => {
  it("acepta un prospecto manual mínimo", () => {
    const r = validateSoft(ProspectSchema, { id: "p1", businessName: "Kiosco X" });
    expect(r.valid).toBe(true);
  });
  it("acepta un descubierto con todos sus extras (passthrough)", () => {
    const r = validateSoft(ProspectSchema, {
      id: "p2", businessName: "Kiosco Golden", zone: "Martínez",
      source: "descubrimiento", placeId: "PID_1", rating: 4.4, reviewsCount: 51,
      clavesIdentidad: ["nd:kiosco-golden|calle-1"], via: "google_maps",
      calificacion: { vendeCategoria: "si", actualizadoAt: "2026-07-31", actualizadoPor: "Diego" },
      lat: "-34.5", lng: -58.5,
    });
    expect(r.valid).toBe(true);
    expect(r.data.lat).toBe(-34.5);     // numLoose coerciona el string
    expect(r.data.placeId).toBe("PID_1");
  });
  it("sin businessName no hay prospecto", () => {
    expect(validateSoft(ProspectSchema, { id: "p3" }).valid).toBe(false);
  });
});

describe("VisitSchema (B3)", () => {
  it("acepta la visita real del sistema", () => {
    const r = validateSoft(VisitSchema, {
      id: "v1", targetId: "p1", targetType: "prospect",
      date: "2026-07-31T10:00:00Z", outcome: "interesado", notes: "", byUser: "Diego",
    });
    expect(r.valid).toBe(true);
  });
  it("sin targetId no hay bitácora que valga", () => {
    expect(validateSoft(VisitSchema, { id: "v2", outcome: "interesado" }).valid).toBe(false);
  });
});

describe("RouteSchema (B3)", () => {
  it("acepta ruta con paradas passthrough; stops defaultea a []", () => {
    const r = validateSoft(RouteSchema, {
      id: "r1", date: "2026-07-31", status: "planificada",
      stops: [{ saleId: "s1", clientId: "c1", status: "pendiente", orden: 1 }],
    });
    expect(r.valid).toBe(true);
    expect(validateSoft(RouteSchema, { id: "r2" }).data.stops).toEqual([]);
  });
});

describe("DiscoverySuppressedSchema (B3)", () => {
  it("acepta la entrada real de suprimirDescubierto", () => {
    const r = validateSoft(DiscoverySuppressedSchema, {
      id: "s1", nombre: "Kiosco Malo", direccion: "Calle 1", web: "",
      claves: ["nd:kiosco-malo|calle-1", "pid:XYZ"],
      motivo: "descartado en revisión", at: "2026-07-31", por: "Diego",
    });
    expect(r.valid).toBe(true);
  });
  it("sin id es inválida; claves defaultea a []", () => {
    expect(validateSoft(DiscoverySuppressedSchema, { nombre: "X" }).valid).toBe(false);
    expect(validateSoft(DiscoverySuppressedSchema, { id: "s2" }).data.claves).toEqual([]);
  });
});
