import { describe, it, expect } from "vitest";
import {
  expectedRepurchase, rankByProfitability, plByChannel, wholesaleKpis, committedUnits,
} from "./wholesaleIntelligence.js";

// TANDA B.4 — edge cases de P&L / ranking / KPIs. Ninguna cuenta debe dar
// NaN/Infinity. NO se toca la lógica.

const NOW = new Date("2026-07-14T12:00:00Z").getTime();
const ago = (d) => new Date(NOW - d * 86400000).toISOString();

describe("B.4 COGS — fallbacks y rate raro", () => {
  it("venta sin costUSDTAtSale usa el costo del producto (fallback)", () => {
    const clients = [{ id: "c1", type: "mayorista" }];
    const products = [{ id: "p1", costUSDT: 5 }];
    const sales = [{ id: "s1", saleType: "mayorista", clientId: "c1", total: 10000, exchangeRate: 1000, date: ago(1), items: [{ productId: "p1", qty: 4 }] }];
    const rank = rankByProfitability(clients, sales, { products, sinceDays: 30, now: NOW });
    expect(rank[0].cogsARS).toBe(20000); // 4 × 5 × 1000 (del producto)
  });
  it("rate 0 → COGS 0, sin NaN/Infinity", () => {
    const clients = [{ id: "c1", type: "mayorista" }];
    const sales = [{ id: "s1", saleType: "mayorista", clientId: "c1", total: 10000, exchangeRate: 0, date: ago(1), items: [{ productId: "p1", qty: 4, costUSDTAtSale: 5 }] }];
    const rank = rankByProfitability(clients, sales, { products: [], sinceDays: 30, now: NOW });
    expect(rank[0].cogsARS).toBe(0);
    expect(Number.isFinite(rank[0].marginARS)).toBe(true);
    expect(Number.isFinite(rank[0].marginPct)).toBe(true);
  });
  it("rate faltante (undefined) → COGS 0, sin NaN", () => {
    const clients = [{ id: "c1", type: "mayorista" }];
    const sales = [{ id: "s1", saleType: "mayorista", clientId: "c1", total: 5000, date: ago(1), items: [{ productId: "p1", qty: 2, costUSDTAtSale: 4 }] }];
    const rank = rankByProfitability(clients, sales, { products: [], sinceDays: 30, now: NOW });
    expect(Number.isNaN(rank[0].cogsARS)).toBe(false);
  });
});

describe("B.4 rankByProfitability — bordes", () => {
  it("cliente con 1 sola venta rankea igual", () => {
    const clients = [{ id: "c1", type: "mayorista" }];
    const sales = [{ id: "s1", saleType: "mayorista", clientId: "c1", total: 8000, exchangeRate: 1000, date: ago(1), items: [{ qty: 2, costUSDTAtSale: 2 }] }];
    const rank = rankByProfitability(clients, sales, { products: [], sinceDays: 30, now: NOW });
    expect(rank).toHaveLength(1);
    expect(rank[0].orders).toBe(1);
  });
  it("sin ventas en el período → ranking vacío", () => {
    const clients = [{ id: "c1", type: "mayorista" }];
    const sales = [{ id: "s1", saleType: "mayorista", clientId: "c1", total: 8000, date: ago(200), items: [] }];
    expect(rankByProfitability(clients, sales, { sinceDays: 30, now: NOW })).toEqual([]);
  });
});

describe("B.4 plByChannel — revenue 0 y sin ventas", () => {
  it("período sin ventas mayoristas → 0s, margen% 0 (sin división por cero)", () => {
    const pl = plByChannel([], { products: [], periodDays: 30, now: NOW });
    expect(pl.mayorista).toEqual({ revenueARS: 0, cogsARS: 0, marginARS: 0, marginPct: 0, orders: 0 });
    expect(Number.isFinite(pl.mayorista.marginPct)).toBe(true);
  });
  it("solo minoristas → mayorista queda en 0", () => {
    const sales = [{ id: "s1", saleType: "minorista", total: 3000, exchangeRate: 1000, date: ago(1), items: [] }];
    const pl = plByChannel(sales, { products: [], periodDays: 30, now: NOW });
    expect(pl.mayorista.revenueARS).toBe(0);
    expect(pl.minorista.revenueARS).toBe(3000);
  });
});

describe("B.4 wholesaleKpis / committedUnits — bordes", () => {
  it("sin data → KPIs en 0, ticket 0 (sin división por cero)", () => {
    const k = wholesaleKpis([], [], [], { periodDays: 30, now: NOW });
    expect(k.ticketB2B).toBe(0);
    expect(k.facturacionMayorista).toBe(0);
    expect(Number.isFinite(k.ticketB2B)).toBe(true);
  });
  it("committedUnits ignora entregados/cobrados", () => {
    const sales = [
      { saleType: "mayorista", fulfillmentStatus: "armado", items: [{ qty: 3 }] },
      { saleType: "mayorista", fulfillmentStatus: "entregado", items: [{ qty: 5 }] },
      { saleType: "mayorista", fulfillmentStatus: "cobrado", items: [{ qty: 7 }] },
    ];
    expect(committedUnits(sales)).toBe(3);
  });
});

describe("B.4 expectedRepurchase — bordes", () => {
  it("un solo pedido → sin cadencia, status al_dia", () => {
    const c = { id: "c1", type: "mayorista" };
    const sales = [{ id: "s1", saleType: "mayorista", clientId: "c1", total: 100, date: ago(5), items: [] }];
    const r = expectedRepurchase(c, sales, NOW);
    expect(r.avgDaysBetween).toBeNull();
    expect(r.status).toBe("al_dia");
  });
});
