import { describe, it, expect } from "vitest";
import {
  clientWholesaleSales, expectedRepurchase, clientsAtRisk,
  rankByProfitability, productsByZone, wholesaleKpis, committedUnits, plByChannel,
} from "./wholesaleIntelligence.js";

const NOW = new Date("2026-07-14T12:00:00Z").getTime();
const ago = (d) => new Date(NOW - d * 86400000).toISOString();

const products = [
  { id: "p1", brand: "Elfbar", model: "BC", flavor: "Sandía", costUSDT: 6 },
  { id: "p2", brand: "Lost Mary", model: "BM", flavor: "Blue", costUSDT: 4 },
];
const clients = [
  { id: "c1", type: "mayorista", zone: "Palermo", name: "Kiosco A" },
  { id: "c2", type: "mayorista", zone: "Caballito", name: "Maxi B" },
  { id: "c3", type: "minorista", zone: "Palermo", name: "Retail" },
];
// c1: pedidos cada ~15d, último hace 40d → atrasado. c2: reciente.
const sales = [
  { id: "s1", saleType: "mayorista", clientId: "c1", total: 20000, exchangeRate: 1000, date: ago(70), items: [{ productId: "p1", qty: 10, costUSDTAtSale: 6 }] },
  { id: "s2", saleType: "mayorista", clientId: "c1", total: 20000, exchangeRate: 1000, date: ago(55), items: [{ productId: "p1", qty: 10, costUSDTAtSale: 6 }] },
  { id: "s3", saleType: "mayorista", clientId: "c1", total: 20000, exchangeRate: 1000, date: ago(40), items: [{ productId: "p1", qty: 10, costUSDTAtSale: 6 }] },
  { id: "s4", saleType: "mayorista", clientId: "c2", total: 8000, exchangeRate: 1000, date: ago(3), fulfillmentStatus: "pendiente", items: [{ productId: "p2", qty: 5, costUSDTAtSale: 4 }] },
  { id: "s5", saleType: "minorista", clientId: "c3", total: 3000, exchangeRate: 1000, date: ago(2), items: [{ productId: "p1", qty: 1, costUSDTAtSale: 6 }] },
];

describe("clientWholesaleSales", () => {
  it("solo mayoristas del cliente, ordenadas desc", () => {
    const cs = clientWholesaleSales(clients[0], sales);
    expect(cs.map(s => s.id)).toEqual(["s3", "s2", "s1"]);
  });
});

describe("expectedRepurchase", () => {
  it("detecta atraso según cadencia (~15d, último hace 40d)", () => {
    const r = expectedRepurchase(clients[0], sales, NOW);
    expect(r.orders).toBe(3);
    expect(r.avgDaysBetween).toBe(15);
    expect(r.status).toBe("atrasado");
    expect(r.overdueDays).toBeGreaterThan(0);
  });
  it("cliente reciente no está atrasado", () => {
    const r = expectedRepurchase(clients[1], sales, NOW);
    expect(r.status).not.toBe("atrasado");
  });
  it("null si no tiene pedidos mayoristas", () => {
    expect(expectedRepurchase({ id: "zzz", type: "mayorista" }, sales, NOW)).toBeNull();
  });
});

describe("clientsAtRisk", () => {
  it("lista kioscos con recompra atrasada y >=2 pedidos", () => {
    const risk = clientsAtRisk(clients, sales, NOW);
    expect(risk.map(r => r.client.id)).toContain("c1");
    expect(risk.map(r => r.client.id)).not.toContain("c2");
  });
});

describe("rankByProfitability", () => {
  it("calcula revenue, cogs y margen por cliente", () => {
    const rank = rankByProfitability(clients, sales, { products, sinceDays: 365, now: NOW });
    const c1 = rank.find(r => r.client.id === "c1");
    // 3 pedidos × (rev 20000, cogs 10*6*1000=60000?) — ojo: cogs > revenue en este fixture
    expect(c1.orders).toBe(3);
    expect(c1.revenueARS).toBe(60000); // 3 × 20000
    expect(c1.cogsARS).toBe(180000);   // 3 × (10 × 6 × 1000)
    expect(c1.marginARS).toBe(-120000);
  });
  it("excluye clientes sin pedidos en el período", () => {
    const rank = rankByProfitability(clients, sales, { products, sinceDays: 5, now: NOW });
    expect(rank.map(r => r.client.id)).not.toContain("c1"); // último hace 40d
    expect(rank.map(r => r.client.id)).toContain("c2");      // hace 3d
  });
});

describe("productsByZone", () => {
  it("agrupa unidades por zona y producto (top)", () => {
    const byZone = productsByZone(clients, sales, products);
    expect(byZone["Palermo"][0].productId).toBe("p1");
    expect(byZone["Palermo"][0].qty).toBe(30); // 3 pedidos × 10 (c1); retail no cuenta
    expect(byZone["Caballito"][0].productId).toBe("p2");
  });
});

describe("wholesaleKpis", () => {
  it("KPIs del período (30d): activos, recompra, ticket, facturación por canal", () => {
    const k = wholesaleKpis(clients, sales, [{ id: "pr1" }], { periodDays: 30, now: NOW });
    expect(k.activos).toBe(2);           // c1, c2
    expect(k.enPipeline).toBe(1);
    expect(k.recompraMes).toBe(1);       // solo c2 compró en 30d
    expect(k.facturacionMayorista).toBe(8000); // s4
    expect(k.facturacionMinorista).toBe(3000); // s5
    expect(k.ticketB2B).toBe(8000);
  });
});

describe("committedUnits", () => {
  it("suma unidades de pedidos mayoristas no entregados", () => {
    expect(committedUnits(sales)).toBe(5); // s4 pendiente (5u); s1-s3 sin fulfillmentStatus no cuentan
  });
});

describe("plByChannel", () => {
  it("P&L mayorista vs minorista en el período", () => {
    const pl = plByChannel(sales, { products, periodDays: 30, now: NOW });
    expect(pl.mayorista.revenueARS).toBe(8000);  // s4
    expect(pl.mayorista.cogsARS).toBe(20000);    // 5 × 4 × 1000
    expect(pl.minorista.revenueARS).toBe(3000);  // s5
    expect(pl.mayorista.orders).toBe(1);
  });
});
