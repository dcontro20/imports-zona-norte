import { describe, it, expect } from "vitest";
import { getClientInsights } from "./clientInsights.js";

const RATE = 1000;
const now = new Date("2026-06-01T12:00:00Z");
const daysBefore = (n) => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10);

const PRODUCTS = [
  { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon" },
  { id: "p2", brand: "Lost Mary", model: "BM", flavor: "Cherry" },
];
const CLIENT = { id: "c1", name: "Mariano", tier: "vip" };

describe("getClientInsights", () => {
  it("returns isNew for client with no sales", () => {
    const r = getClientInsights(CLIENT, [], PRODUCTS, { now, exchangeRate: RATE });
    expect(r.isNew).toBe(true);
    expect(r.orderCount).toBe(0);
    expect(r.tier).toBe("vip");
  });

  it("computes totals, ticket and last purchase", () => {
    const sales = [
      { clientId: "c1", date: daysBefore(40), currency: "ARS", total: 30000, items: [{ productId: "p1", qty: 2 }] },
      { clientId: "c1", date: daysBefore(10), currency: "ARS", total: 20000, items: [{ productId: "p1", qty: 1 }, { productId: "p2", qty: 1 }] },
    ];
    const r = getClientInsights(CLIENT, sales, PRODUCTS, { now, exchangeRate: RATE });
    expect(r.orderCount).toBe(2);
    expect(r.totalSpentARS).toBe(50000);
    expect(r.avgTicketARS).toBe(25000);
    expect(r.daysSinceLast).toBe(10);
    expect(r.lastPurchaseDate).toBe(daysBefore(10));
  });

  it("computes purchase frequency", () => {
    const sales = [
      { clientId: "c1", date: daysBefore(60), currency: "ARS", total: 10000, items: [] },
      { clientId: "c1", date: daysBefore(40), currency: "ARS", total: 10000, items: [] },
      { clientId: "c1", date: daysBefore(20), currency: "ARS", total: 10000, items: [] },
    ];
    const r = getClientInsights(CLIENT, sales, PRODUCTS, { now, exchangeRate: RATE });
    expect(r.avgDaysBetween).toBe(20); // gaps of 20 and 20
  });

  it("flags isDue when overdue vs frequency", () => {
    const sales = [
      { clientId: "c1", date: daysBefore(50), currency: "ARS", total: 10000, items: [] },
      { clientId: "c1", date: daysBefore(30), currency: "ARS", total: 10000, items: [] }, // freq ~20, last 30d ago > 24
    ];
    const r = getClientInsights(CLIENT, sales, PRODUCTS, { now, exchangeRate: RATE });
    expect(r.isDue).toBe(true);
  });

  it("ranks top products", () => {
    const sales = [
      { clientId: "c1", date: daysBefore(10), currency: "ARS", total: 10000, items: [{ productId: "p1", qty: 5 }, { productId: "p2", qty: 1 }] },
    ];
    const r = getClientInsights(CLIENT, sales, PRODUCTS, { now, exchangeRate: RATE });
    expect(r.topProducts[0].product.id).toBe("p1");
    expect(r.topProducts[0].qty).toBe(5);
  });

  it("converts USD sales with rate", () => {
    const sales = [
      { clientId: "c1", date: daysBefore(10), currency: "USD", exchangeRate: 1000, total: 30, items: [] },
    ];
    const r = getClientInsights(CLIENT, sales, PRODUCTS, { now, exchangeRate: RATE });
    expect(r.totalSpentARS).toBe(30000);
  });

  it("ignores other clients and deleted sales", () => {
    const sales = [
      { clientId: "c2", date: daysBefore(5), currency: "ARS", total: 99999, items: [] },
      { clientId: "c1", date: daysBefore(5), currency: "ARS", total: 10000, isDeleted: true, items: [] },
    ];
    const r = getClientInsights(CLIENT, sales, PRODUCTS, { now, exchangeRate: RATE });
    expect(r.orderCount).toBe(0);
  });
});
