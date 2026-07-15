import { describe, it, expect } from "vitest";
import { migrateToWholesaleModel } from "./wholesaleMigration.js";

// TANDA C.4 — idempotencia real: correr la migración DOS veces seguidas no debe
// cambiar nada la segunda vez ni duplicar campos.

describe("C.4 migrateToWholesaleModel — idempotente al correr 2x", () => {
  const clients = [{ id: "c1", name: "Ana" }, { id: "c2", name: "Kiosco", type: "mayorista" }];
  const sales = [
    { id: "s1", total: 100 },
    { id: "s2", saleType: "mayorista", fulfillmentStatus: "cobrado", total: 50 },
  ];

  it("2da corrida: didChange=false y salida idéntica a la 1ra", () => {
    const first = migrateToWholesaleModel(clients, sales);
    expect(first.didChange).toBe(true);

    const second = migrateToWholesaleModel(first.clients, first.sales);
    expect(second.didChange).toBe(false);
    expect(second.changed).toEqual({ clients: 0, sales: 0 });
    // La 2da corrida devuelve exactamente la misma data (sin duplicar ni re-pisar).
    expect(second.clients).toEqual(first.clients);
    expect(second.sales).toEqual(first.sales);
  });

  it("no duplica campos ni pisa valores ya seteados", () => {
    const first = migrateToWholesaleModel(clients, sales);
    // c2 ya era mayorista → sigue mayorista; s2 ya cobrado → sigue cobrado
    expect(first.clients.find(c => c.id === "c2").type).toBe("mayorista");
    expect(first.sales.find(s => s.id === "s2").fulfillmentStatus).toBe("cobrado");
    // c1 y s1 recibieron defaults
    expect(first.clients.find(c => c.id === "c1").type).toBe("minorista");
    expect(first.sales.find(s => s.id === "s1").saleType).toBe("minorista");
    expect(first.sales.find(s => s.id === "s1").fulfillmentStatus).toBe("entregado");
  });

  it("3 corridas seguidas convergen (estable)", () => {
    let r = migrateToWholesaleModel(clients, sales);
    r = migrateToWholesaleModel(r.clients, r.sales);
    const third = migrateToWholesaleModel(r.clients, r.sales);
    expect(third.didChange).toBe(false);
  });
});
