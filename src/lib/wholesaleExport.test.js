import { describe, it, expect } from "vitest";
import { toCSV, kioscosToCSV, prospectsToCSV, routeToCSV } from "./wholesaleExport.js";

describe("toCSV", () => {
  it("arma header + filas", () => {
    expect(toCSV(["a", "b"], [[1, 2], [3, 4]])).toBe("a,b\n1,2\n3,4");
  });
  it("escapa comas, comillas y saltos de línea", () => {
    expect(toCSV(["x"], [['a,b'], ['c"d'], ["e\nf"]])).toBe('x\n"a,b"\n"c""d"\n"e\nf"');
  });
});

describe("kioscosToCSV", () => {
  const clients = [
    { id: "c1", type: "mayorista", businessName: "Kiosco B", name: "Beto", businessType: "kiosco", wholesaleTier: "A", zone: "Palermo", phone: "11", creditEnabled: true, creditLimitARS: 50000, pipelineStage: "activo" },
    { id: "c2", type: "mayorista", businessName: "Almacén A", name: "Ana", creditEnabled: false },
    { id: "c3", type: "minorista", name: "Retail" }, // excluido
    { id: "c4", type: "mayorista", name: "Borrado", isDeleted: true }, // excluido
  ];
  it("incluye solo mayoristas activos, ordenados por comercio", () => {
    const csv = kioscosToCSV(clients);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("Comercio");
    expect(lines[1]).toContain("Almacén A"); // orden alfabético
    expect(lines[2]).toContain("Kiosco B");
    expect(lines).toHaveLength(3); // header + 2 mayoristas
  });
  it("refleja crédito y límite", () => {
    const csv = kioscosToCSV(clients);
    expect(csv).toContain("sí,50000");
    expect(csv).toMatch(/Almacén A.*no,/);
  });
});

describe("prospectsToCSV", () => {
  const prospects = [
    { id: "p1", businessName: "Prosp X", zone: "Tigre", pipelineStage: "contactado", source: "mapa", foundAt: "2026-07-01T10:00:00Z" },
    { id: "p2", businessName: "Conv Y", convertedClientId: "c9" }, // excluido
    { id: "p3", businessName: "Del Z", isDeleted: true }, // excluido
  ];
  it("incluye solo prospectos activos sin convertir", () => {
    const csv = prospectsToCSV(prospects);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2); // header + 1
    expect(csv).toContain("Prosp X");
    expect(csv).toContain("2026-07-01");
    expect(csv).not.toContain("Conv Y");
    expect(csv).not.toContain("Del Z");
  });
});

describe("routeToCSV (Tanda F)", () => {
  const clients = [
    { id: "c1", businessName: "Kiosco A", zone: "Palermo", address: "Calle 1" },
    { id: "c2", businessName: "Maxi B", zone: "Tigre", address: "Calle 2" },
  ];
  const sales = [
    { id: "o1", saleType: "mayorista", clientId: "c1", total: 10000, orderNote: "después de las 18h", fulfillmentStatus: "en_ruta", payments: [], items: [{ qty: 5 }] },
    { id: "o2", saleType: "mayorista", clientId: "c2", total: 8000, fulfillmentStatus: "cobrado", payments: [{ method: "Pesos Cash", amount: 8000 }], items: [{ qty: 3 }] },
  ];
  const route = { stops: [
    { orderId: "o2", clientId: "c2", order: 2, status: "entregado" },
    { orderId: "o1", clientId: "c1", order: 1, status: "pendiente" },
  ] };
  it("una fila por parada en orden de reparto, con estado, pendiente y nota", () => {
    const csv = routeToCSV(route, { clients, sales });
    const rows = csv.split("\n");
    expect(rows[0]).toContain("Orden,Cliente");
    expect(rows[1]).toContain("1,Kiosco A,Calle 1,Palermo,5,10000,10000,Pendiente,");
    expect(rows[1]).toContain("18h"); // la nota del pedido viaja al CSV
    expect(rows[2]).toContain("2,Maxi B,Calle 2,Tigre,3,8000,0,Cobrado");
  });
  it("ruta vacía → solo header", () => {
    expect(routeToCSV({ stops: [] }, { clients, sales }).split("\n").length).toBe(1);
  });
});
