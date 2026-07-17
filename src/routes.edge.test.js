import { describe, it, expect } from "vitest";
import {
  pendingWholesaleOrders, groupOrdersByZone, resolveStop, routeTotals, moveStop,
} from "./routes.js";
import { generateRouteSheet } from "./lib/routeSheet.js";

// TANDA B.5 — edge cases de rutas. No debe romper con paradas raras.

describe("B.5 routeTotals — bordes", () => {
  it("ruta sin paradas → todo 0", () => {
    expect(routeTotals({ stops: [] }, [])).toEqual({ totalUnits: 0, totalARS: 0, stops: 0 });
  });
  it("ruta sin stops (undefined) no rompe", () => {
    expect(routeTotals({}, [])).toEqual({ totalUnits: 0, totalARS: 0, stops: 0 });
    expect(routeTotals(null, [])).toEqual({ totalUnits: 0, totalARS: 0, stops: 0 });
  });
  it("parada con pedido inexistente cuenta 0, no rompe", () => {
    const route = { stops: [{ orderId: "zzz" }, { orderId: "s1" }] };
    const sales = [{ id: "s1", total: 5000, items: [{ qty: 2 }] }];
    const t = routeTotals(route, sales);
    expect(t.totalARS).toBe(5000);
    expect(t.totalUnits).toBe(2);
    expect(t.stops).toBe(2);
  });
});

describe("B.5 resolveStop — pedido borrado/inexistente", () => {
  it("orderId inexistente → sale null, sin crash", () => {
    const r = resolveStop({ clientId: "c1", orderId: "zzz" }, { clients: [{ id: "c1", name: "Kiosco" }], sales: [] });
    expect(r.sale).toBeNull();
    expect(r.units).toBe(0);
    expect(r.totalARS).toBe(0);
    expect(r.name).toBe("Kiosco");
  });
  it("cliente inexistente → name fallback 'Cliente'", () => {
    const r = resolveStop({ clientId: "zzz", orderId: "s1" }, { clients: [], sales: [{ id: "s1", total: 100, items: [] }] });
    expect(r.name).toBe("Cliente");
    expect(r.totalARS).toBe(100);
  });
});

describe("B.5 pendingWholesaleOrders / groupOrdersByZone — bordes", () => {
  it("sin ventas → vacío", () => {
    expect(pendingWholesaleOrders([])).toEqual([]);
    expect(groupOrdersByZone([], [])).toEqual([]);
  });
  it("pedidos de distintas zonas se agrupan aparte", () => {
    const clients = [{ id: "c1", zone: "Palermo" }, { id: "c2", zone: "Tigre" }];
    const orders = [
      { id: "o1", clientId: "c1", total: 100, items: [{ qty: 1 }] },
      { id: "o2", clientId: "c2", total: 200, items: [{ qty: 2 }] },
    ];
    const g = groupOrdersByZone(orders, clients);
    expect(g.map(z => z.zone).sort()).toEqual(["Palermo", "Tigre"]);
    expect(g.find(z => z.zone === "Tigre").totalARS).toBe(200);
  });
});

describe("B.5 moveStop — bordes", () => {
  it("array vacío no rompe", () => {
    expect(moveStop([], 0, -1)).toEqual([]);
  });
  it("índice fuera de rango devuelve igual", () => {
    const stops = [{ orderId: "a", order: 0 }];
    expect(moveStop(stops, 5, 1).map(s => s.orderId)).toEqual(["a"]);
  });
});

describe("B.5 generateRouteSheet — bordes", () => {
  it("ruta sin paradas → header + total 0, sin crash", () => {
    const sheet = generateRouteSheet({ name: "Vacía", date: "2026-07-14", stops: [] }, { clients: [], sales: [] });
    expect(sheet).toContain("HOJA DE RUTA — Vacía");
    expect(sheet).toContain("TOTAL: 0u");
  });
  it("parada con pedido inexistente no rompe la hoja", () => {
    const route = { name: "R", date: "2026-07-14", stops: [{ clientId: "c1", orderId: "zzz", order: 0, status: "pendiente" }] };
    const sheet = generateRouteSheet(route, { clients: [{ id: "c1", businessName: "Kiosco" }], sales: [] });
    expect(sheet).toContain("Kiosco");
    expect(sheet).toContain("A cobrar: $0");
  });
});
