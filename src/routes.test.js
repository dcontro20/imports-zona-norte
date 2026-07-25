import { describe, it, expect } from "vitest";
import {
  pendingWholesaleOrders, groupOrdersByZone, buildRouteStops,
  resolveStop, routeTotals, moveStop, optimizeStops,
  expectedPayMethod, routeTotalsByExpectedMethod,
} from "./routes.js";
import { generateRouteSheet } from "./lib/routeSheet.js";

const clients = [
  { id: "c1", businessName: "Kiosco A", zone: "Palermo", address: "Calle 1" },
  { id: "c2", businessName: "Maxi B", zone: "Palermo", address: "Calle 2" },
  { id: "c3", businessName: "Drug C", zone: "Caballito", address: "Calle 3" },
];
const sales = [
  { id: "s1", saleType: "mayorista", clientId: "c1", total: 10000, fulfillmentStatus: "pendiente", date: "2026-07-10", items: [{ productId: "p1", qty: 5, name: "Elfbar Sandía" }] },
  { id: "s2", saleType: "mayorista", clientId: "c2", total: 20000, fulfillmentStatus: "pendiente", date: "2026-07-11", items: [{ productId: "p2", qty: 10, name: "Lost Mary Blue" }] },
  { id: "s3", saleType: "mayorista", clientId: "c3", total: 5000, fulfillmentStatus: "entregado", date: "2026-07-09", items: [{ qty: 3 }] }, // ya entregado → no pendiente
  { id: "s4", saleType: "mayorista", clientId: "c1", total: 9000, routeId: "r1", fulfillmentStatus: "armado", date: "2026-07-12", items: [{ qty: 2 }] }, // ya en ruta
  { id: "s5", saleType: "minorista", clientId: "c1", total: 3000, date: "2026-07-12", items: [{ qty: 1 }] }, // minorista
];

describe("pendingWholesaleOrders", () => {
  it("solo mayoristas sin ruta y no entregados/cobrados", () => {
    const p = pendingWholesaleOrders(sales);
    expect(p.map(s => s.id)).toEqual(["s1", "s2"]); // s3 entregado, s4 con ruta, s5 minorista
  });
  it("ordena por fecha asc", () => {
    const p = pendingWholesaleOrders(sales);
    expect(new Date(p[0].date) <= new Date(p[1].date)).toBe(true);
  });
});

describe("groupOrdersByZone", () => {
  it("agrupa por zona con unidades y total", () => {
    const g = groupOrdersByZone(pendingWholesaleOrders(sales), clients);
    const palermo = g.find(z => z.zone === "Palermo");
    expect(palermo.orders).toHaveLength(2);
    expect(palermo.units).toBe(15); // 5 + 10
    expect(palermo.totalARS).toBe(30000);
  });
  it("cliente sin zona cae en 'Sin zona'", () => {
    const g = groupOrdersByZone([{ id: "x", clientId: "zzz", total: 100, items: [] }], clients);
    expect(g[0].zone).toBe("Sin zona");
  });
});

describe("buildRouteStops", () => {
  it("crea paradas con order incremental y status pendiente", () => {
    const stops = buildRouteStops(pendingWholesaleOrders(sales));
    expect(stops).toHaveLength(2);
    expect(stops[0]).toMatchObject({ clientId: "c1", orderId: "s1", order: 0, status: "pendiente" });
    expect(stops[1].order).toBe(1);
  });
});

describe("resolveStop", () => {
  it("junta cliente + venta", () => {
    const r = resolveStop({ clientId: "c1", orderId: "s1" }, { clients, sales });
    expect(r.name).toBe("Kiosco A");
    expect(r.address).toBe("Calle 1");
    expect(r.units).toBe(5);
    expect(r.totalARS).toBe(10000);
  });
});

describe("routeTotals", () => {
  it("suma unidades y ARS de las paradas", () => {
    const route = { stops: [{ orderId: "s1" }, { orderId: "s2" }] };
    const t = routeTotals(route, sales);
    expect(t.totalUnits).toBe(15);
    expect(t.totalARS).toBe(30000);
    expect(t.stops).toBe(2);
  });
});

describe("moveStop", () => {
  const stops = [{ orderId: "a", order: 0 }, { orderId: "b", order: 1 }, { orderId: "c", order: 2 }];
  it("sube una parada y re-indexa order", () => {
    const r = moveStop(stops, 2, -1);
    expect(r.map(s => s.orderId)).toEqual(["a", "c", "b"]);
    expect(r.map(s => s.order)).toEqual([0, 1, 2]);
  });
  it("no hace nada en los bordes", () => {
    expect(moveStop(stops, 0, -1).map(s => s.orderId)).toEqual(["a", "b", "c"]);
    expect(moveStop(stops, 2, 1).map(s => s.orderId)).toEqual(["a", "b", "c"]);
  });
});

describe("optimizeStops (stub)", () => {
  it("devuelve las paradas sin cambios (no implementado a propósito)", () => {
    const stops = [{ orderId: "a", order: 0 }, { orderId: "b", order: 1 }];
    expect(optimizeStops(stops)).toEqual(stops);
  });
});

describe("generateRouteSheet", () => {
  const route = {
    name: "Martes zona norte", date: "2026-07-14", status: "planificada",
    stops: [
      { clientId: "c1", orderId: "s1", order: 0, status: "pendiente" },
      { clientId: "c2", orderId: "s2", order: 1, status: "entregado" },
    ],
  };
  it("incluye header, paradas ordenadas, items y totales", () => {
    const sheet = generateRouteSheet(route, { clients, sales });
    expect(sheet).toContain("HOJA DE RUTA — Martes zona norte");
    expect(sheet).toContain("Kiosco A");
    expect(sheet).toContain("Calle 1");
    expect(sheet).toContain("5x Elfbar Sandía");
    expect(sheet).toContain("✅"); // s2 entregado
    expect(sheet).toContain("TOTAL: 15u");
  });
  it("no crashea sin route", () => {
    expect(generateRouteSheet(null, { clients, sales })).toBe("");
  });
});

describe("expectedPayMethod (Tanda F)", () => {
  const salesPagos = [
    { id: "w1", saleType: "mayorista", clientId: "c1", total: 100, payments: [{ method: "Pesos Cash", amount: 100 }] },
    { id: "w2", saleType: "mayorista", clientId: "c1", total: 200, payments: [{ method: "Pesos Cash", amount: 100 }, { method: "Mercado Pago", amount: 100 }] },
    { id: "w3", saleType: "mayorista", clientId: "c2", total: 300, payments: [{ method: "Mercado Pago", amount: 300 }] },
    { id: "w4", saleType: "minorista", clientId: "c3", total: 50, payments: [{ method: "Lemon", amount: 50 }] },
  ];
  it("devuelve el método más frecuente de los pagos mayoristas del cliente", () => {
    expect(expectedPayMethod("c1", salesPagos)).toBe("Pesos Cash");
    expect(expectedPayMethod("c2", salesPagos)).toBe("Mercado Pago");
  });
  it("sin historial (o solo minorista) → null", () => {
    expect(expectedPayMethod("c3", salesPagos)).toBe(null);
    expect(expectedPayMethod("nadie", salesPagos)).toBe(null);
    expect(expectedPayMethod("c1", [])).toBe(null);
  });
});

describe("routeTotalsByExpectedMethod (Tanda F)", () => {
  const salesRuta = [
    // c1 cobra siempre en efectivo; pedido nuevo con 4000 pendientes (10000 - 6000 pagados)
    { id: "o1", saleType: "mayorista", clientId: "c1", total: 10000, payments: [{ method: "Pesos Cash", amount: 6000 }] },
    { id: "hist1", saleType: "mayorista", clientId: "c1", total: 500, payments: [{ method: "Pesos Cash", amount: 500 }] },
    // c2 sin historial de cobros: 20000 pendientes
    { id: "o2", saleType: "mayorista", clientId: "c2", total: 20000, payments: [] },
    // o3 ya cobrado entero → no aparece
    { id: "o3", saleType: "mayorista", clientId: "c3", total: 3000, payments: [{ method: "Lemon", amount: 3000 }] },
  ];
  const route = { stops: [
    { orderId: "o1", clientId: "c1", order: 1 },
    { orderId: "o2", clientId: "c2", order: 2 },
    { orderId: "o3", clientId: "c3", order: 3 },
  ] };
  it("agrupa lo PENDIENTE por método esperado, orden desc, sin cobrados", () => {
    const out = routeTotalsByExpectedMethod(route, salesRuta);
    expect(out).toEqual([
      { method: "Sin historial", totalARS: 20000, stops: 1 },
      { method: "Pesos Cash", totalARS: 4000, stops: 1 },
    ]);
  });
  it("ruta vacía / sin route → []", () => {
    expect(routeTotalsByExpectedMethod(null, salesRuta)).toEqual([]);
    expect(routeTotalsByExpectedMethod({ stops: [] }, salesRuta)).toEqual([]);
  });
});
