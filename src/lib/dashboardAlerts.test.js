import { describe, it, expect } from "vitest";
import { generateDashboardAlerts } from "./dashboardAlerts.js";

const NOW = new Date("2026-06-15T12:00:00");
const RATE = 1000;

// Catálogo con un MIX: reales + fantasmas
const PRODUCTS = [
  // Reales con stock
  { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon", stock: 5, priceUSD: 25, costUSDT: 12 },
  { id: "p2", brand: "Lost Mary", model: "BM", flavor: "Cherry", stock: 2, priceUSD: 18, costUSDT: 10 }, // stock bajo
  // Real agotado con demanda reciente
  { id: "p3", brand: "Geek", model: "Pulse", flavor: "Mango", stock: 0, priceUSD: 20, costUSDT: 10 },
  // FANTASMAS del catálogo (nunca tuviste)
  { id: "p100", brand: "Nikbar", model: "X", flavor: "Vanilla", stock: 0 },
  { id: "p101", brand: "Supreme", model: "Y", flavor: "Tropical", stock: 0 },
  { id: "p102", brand: "Z", model: "Z", flavor: "Z", stock: 0 },
];

const SALES = [
  // p1 vendido recientemente
  { id: "s1", date: "2026-06-14T10:00", isDeleted: false, items: [{ productId: "p1", qty: 2 }] },
  // p3 vendido también (genera la alerta urgente de agotado con demanda)
  { id: "s2", date: "2026-06-13T10:00", isDeleted: false, items: [{ productId: "p3", qty: 1 }] },
];

const PURCHASES = [
  { id: "pu1", status: "verificado", isDeleted: false, items: [{ productId: "p1", qty: 10 }] },
];

const CLIENTS = [
  { id: "c1", name: "Juan", balance: -80000 }, // deuda
  { id: "c2", name: "Pedro", balance: 0 },
];

const SETTINGS = {
  lowStockThreshold: 3,
  willRunOutDays: 7,
  staleProductDays: 60,
  debtTotalAlertARS: 50000,
};

describe("generateDashboardAlerts", () => {
  it("NO cuenta el catálogo fantasma como agotados (fix del bug ruidoso)", () => {
    const alerts = generateDashboardAlerts({
      products: PRODUCTS, sales: SALES, purchases: PURCHASES,
      clients: CLIENTS, settings: SETTINGS, exchangeRate: RATE, now: NOW,
    });
    // El catálogo tiene 6 productos, pero solo p1, p2, p3 son reales. Las
    // alertas de stock NO deberían mencionar p100/p101/p102.
    const allText = JSON.stringify(alerts);
    expect(allText).not.toContain("p100");
    expect(allText).not.toContain("Nikbar");
    expect(allText).not.toContain("Supreme");
  });

  it("genera alerta urgente para agotado con demanda reciente", () => {
    const alerts = generateDashboardAlerts({
      products: PRODUCTS, sales: SALES, purchases: PURCHASES,
      clients: CLIENTS, settings: SETTINGS, exchangeRate: RATE, now: NOW,
    });
    const popular = alerts.urgent.find(a => a.title.includes("agotado") && a.title.includes("demanda"));
    expect(popular).toBeTruthy();
    expect(popular.action.page).toBe("procurement");
  });

  it("genera alerta urgente para deuda total grande", () => {
    const alerts = generateDashboardAlerts({
      products: PRODUCTS, sales: SALES, purchases: PURCHASES,
      clients: CLIENTS, settings: SETTINGS, exchangeRate: RATE, now: NOW,
    });
    const deuda = alerts.urgent.find(a => a.title.includes("deuda"));
    expect(deuda).toBeTruthy();
    expect(deuda.action.page).toBe("clients");
  });

  it("genera alerta semana para stock bajo", () => {
    const alerts = generateDashboardAlerts({
      products: PRODUCTS, sales: SALES, purchases: PURCHASES,
      clients: CLIENTS, settings: SETTINGS, exchangeRate: RATE, now: NOW,
    });
    const lowStock = alerts.week.find(a => a.title.includes("stock bajo"));
    expect(lowStock).toBeTruthy();
    expect(lowStock.action.page).toBe("procurement");
  });

  it("cada alerta tiene level, title y action con page", () => {
    const alerts = generateDashboardAlerts({
      products: PRODUCTS, sales: SALES, purchases: PURCHASES,
      clients: CLIENTS, settings: SETTINGS, exchangeRate: RATE, now: NOW,
    });
    [...alerts.urgent, ...alerts.week, ...alerts.opportunity].forEach(a => {
      expect(a.level).toBeTruthy();
      expect(a.title).toBeTruthy();
      expect(a.action?.page).toBeTruthy();
      expect(a.action?.label).toBeTruthy();
    });
  });

  it("totalCount suma los 3 buckets", () => {
    const alerts = generateDashboardAlerts({
      products: PRODUCTS, sales: SALES, purchases: PURCHASES,
      clients: CLIENTS, settings: SETTINGS, exchangeRate: RATE, now: NOW,
    });
    expect(alerts.totalCount).toBe(
      alerts.urgent.length + alerts.week.length + alerts.opportunity.length
    );
  });

  it("handles inputs vacíos sin romper", () => {
    const alerts = generateDashboardAlerts({});
    expect(alerts.urgent).toEqual([]);
    expect(alerts.week).toEqual([]);
    expect(alerts.opportunity).toEqual([]);
    expect(alerts.totalCount).toBe(0);
  });
});
