import { describe, it, expect } from "vitest";
import { calcPoints, getRewardStatus, clientsCloseToReward, REWARDS } from "./loyalty.js";

const NOW = new Date("2026-06-15T12:00:00");

const CLIENTS = [
  { id: "c1", name: "Juan", tier: "regular" },
  { id: "c2", name: "Pedro", tier: "vip" },
  { id: "c3", name: "Lucía", tier: "diamante" },
  { id: "c4", name: "Sin", tier: "regular" },
  { id: "c5", name: "Inactivo", tier: "regular", inactive: true },
];

const SALES = [
  // Juan regular: 50000 ARS → 10 puntos base
  { clientId: "c1", date: "2026-06-01", total: 50000, currency: "ARS", items: [] },
  // Pedro VIP: 40000 ARS → 8 base + 2 bonus = 10, x1.5 = 15
  { clientId: "c2", date: "2026-06-05", total: 40000, currency: "ARS", items: [] },
  // Lucía diamante: 25000 ARS → 5 base, x2 = 10
  { clientId: "c3", date: "2026-06-10", total: 25000, currency: "ARS", items: [] },
];

describe("calcPoints", () => {
  it("calcula puntos base = floor(ARS / 5000)", () => {
    const pts = calcPoints(CLIENTS[0], SALES);
    expect(pts.base).toBe(10); // 50k/5k=10
    // Juan tiene ticket 50k >= 30k → bonus 2, total = (10+2)*1 = 12
    expect(pts.total).toBe(12);
  });

  it("suma bonus por ticket >= 30k", () => {
    const pts = calcPoints(CLIENTS[1], SALES);
    expect(pts.bonus).toBe(2);
  });

  it("aplica multiplicador VIP (x1.5)", () => {
    const pts = calcPoints(CLIENTS[1], SALES);
    expect(pts.multiplier).toBe(1.5);
    // 40k / 5k = 8 base + 2 bonus = 10 * 1.5 = 15
    expect(pts.total).toBe(15);
  });

  it("aplica multiplicador diamante (x2)", () => {
    const pts = calcPoints(CLIENTS[2], SALES);
    expect(pts.multiplier).toBe(2);
    // 25k / 5k = 5 base * 2 = 10
    expect(pts.total).toBe(10);
  });

  it("cliente sin compras devuelve 0", () => {
    expect(calcPoints(CLIENTS[3], SALES).total).toBe(0);
  });

  it("ignora ventas borradas", () => {
    const salesWithDeleted = [...SALES, { clientId: "c1", total: 999999, isDeleted: true }];
    const pts = calcPoints(CLIENTS[0], salesWithDeleted);
    expect(pts.total).toBe(12); // no debe sumar la borrada
  });
});

describe("getRewardStatus", () => {
  it("sin puntos: no claimable, próximo = 10 pts", () => {
    const s = getRewardStatus(0);
    expect(s.claimable).toBeNull();
    expect(s.next.points).toBe(10);
    expect(s.pointsToNext).toBe(10);
  });

  it("con 10 pts: puede 5%, próximo = 25 pts", () => {
    const s = getRewardStatus(10);
    expect(s.claimable.value).toBe(5);
    expect(s.next.points).toBe(25);
    expect(s.pointsToNext).toBe(15);
  });

  it("con 50 pts: regalo, sin próximo", () => {
    const s = getRewardStatus(50);
    expect(s.claimable.kind).toBe("gift");
    expect(s.next).toBeNull();
  });

  it("con 60 pts: claimable sigue siendo gift, no más reward", () => {
    const s = getRewardStatus(60);
    expect(s.claimable.kind).toBe("gift");
    expect(s.next).toBeNull();
  });
});

describe("clientsCloseToReward", () => {
  it("encuentra clientes con 75-99% de progreso al próximo reward", () => {
    // Juan tiene 10 pts → próximo es 25 pts → 40% → NO está cerca
    // Para que Juan aparezca close, necesitaría 19-24 pts (75-99% de 25)
    const closeSales = [
      { clientId: "c1", date: "2026-06-01", total: 100000, currency: "ARS", items: [] }, // 20 pts
    ];
    const close = clientsCloseToReward(CLIENTS, closeSales);
    expect(close.length).toBe(1);
    expect(close[0].client.id).toBe("c1");
    expect(close[0].progress).toBeGreaterThanOrEqual(75);
  });

  it("EXCLUYE clientes inactivos aunque estén cerca", () => {
    const sales = [
      { clientId: "c5", date: "2026-06-01", total: 100000, currency: "ARS", items: [] },
    ];
    const close = clientsCloseToReward(CLIENTS, sales);
    expect(close.find(c => c.client.id === "c5")).toBeFalsy();
  });
});

describe("REWARDS", () => {
  it("están ordenados de menor a mayor puntos", () => {
    for (let i = 1; i < REWARDS.length; i++) {
      expect(REWARDS[i].points).toBeGreaterThan(REWARDS[i - 1].points);
    }
  });
});
