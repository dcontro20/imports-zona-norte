import { describe, it, expect } from "vitest";
import { migrateToWholesaleModel } from "./wholesaleMigration.js";

describe("migrateToWholesaleModel", () => {
  it("setea type=minorista en clientes sin type", () => {
    const { clients, changed } = migrateToWholesaleModel(
      [{ id: "c1", name: "Ana" }, { id: "c2", name: "Beto" }], []
    );
    expect(clients.every(c => c.type === "minorista")).toBe(true);
    expect(changed.clients).toBe(2);
  });

  it("no pisa el type ya seteado (idempotente)", () => {
    const { clients, changed } = migrateToWholesaleModel(
      [{ id: "c1", name: "Kiosco X", type: "kiosco" }, { id: "c2", name: "Ana", type: "minorista" }], []
    );
    expect(clients[0].type).toBe("kiosco");
    expect(clients[1].type).toBe("minorista");
    expect(changed.clients).toBe(0);
  });

  it("setea saleType + fulfillmentStatus en ventas viejas", () => {
    const { sales, changed } = migrateToWholesaleModel([], [
      { id: "s1", date: "2026-01-01", total: 100 },
    ]);
    expect(sales[0].saleType).toBe("minorista");
    expect(sales[0].fulfillmentStatus).toBe("entregado");
    expect(changed.sales).toBe(1);
  });

  it("respeta campos parciales ya presentes en ventas", () => {
    const { sales, changed } = migrateToWholesaleModel([], [
      { id: "s1", saleType: "mayorista", date: "2026-07-01" }, // le falta fulfillment
      { id: "s2", saleType: "minorista", fulfillmentStatus: "cobrado" }, // completo
    ]);
    expect(sales[0].saleType).toBe("mayorista"); // no lo pisa
    expect(sales[0].fulfillmentStatus).toBe("entregado"); // completa el que falta
    expect(sales[1]).toEqual({ id: "s2", saleType: "minorista", fulfillmentStatus: "cobrado" }); // intacto
    expect(changed.sales).toBe(1); // solo s1 cambió
  });

  it("didChange=false cuando no hay nada que migrar", () => {
    const res = migrateToWholesaleModel(
      [{ id: "c1", type: "minorista" }],
      [{ id: "s1", saleType: "minorista", fulfillmentStatus: "entregado" }]
    );
    expect(res.didChange).toBe(false);
    expect(res.changed).toEqual({ clients: 0, sales: 0 });
  });

  it("didChange=true si algo cambió", () => {
    const res = migrateToWholesaleModel([{ id: "c1", name: "Ana" }], []);
    expect(res.didChange).toBe(true);
  });

  it("no crashea con arrays vacíos o undefined", () => {
    const res = migrateToWholesaleModel();
    expect(res.clients).toEqual([]);
    expect(res.sales).toEqual([]);
    expect(res.didChange).toBe(false);
  });

  it("preserva el resto de los campos del cliente y la venta", () => {
    const { clients, sales } = migrateToWholesaleModel(
      [{ id: "c1", name: "Ana", phone: "123", balance: 50 }],
      [{ id: "s1", total: 999, items: [{ productId: "p1", qty: 2 }] }]
    );
    expect(clients[0]).toMatchObject({ name: "Ana", phone: "123", balance: 50, type: "minorista" });
    expect(sales[0]).toMatchObject({ total: 999, saleType: "minorista", fulfillmentStatus: "entregado" });
    expect(sales[0].items).toHaveLength(1);
  });
});
