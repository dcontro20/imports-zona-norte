import { describe, it, expect } from "vitest";
import {
  buildClientStats, classifyClient, predictNextPurchase,
  clientAlerts, segmentBreakdown, clientsToReach,
} from "./clientIntelligence.js";

const NOW = new Date("2026-06-23T12:00:00").getTime();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString().slice(0, 10);

describe("buildClientStats", () => {
  const clients = [{ id: "c1", name: "Ana", tier: "vip", balance: -5000 }];
  const sales = [
    { clientId: "c1", date: daysAgo(2), total: 10000, currency: "ARS" },
    { clientId: "c1", date: daysAgo(12), total: 20000, currency: "ARS" },
    { clientId: "c1", date: daysAgo(22), total: 5000, currency: "ARS" },
  ];
  it("calcula count, total, cadencia y recencia", () => {
    const [st] = buildClientStats(clients, sales, 1, NOW);
    expect(st.salesCount).toBe(3);
    expect(st.totalSpentARS).toBe(35000);
    expect(st.daysSinceLast).toBe(2);
    expect(st.avgDaysBetween).toBe(10); // (22-2)/2
    expect(st.tier).toBe("vip");
    expect(st.balance).toBe(-5000);
  });
  it("convierte USD a ARS con rate", () => {
    const [st] = buildClientStats(
      [{ id: "c1", name: "Ana" }],
      [{ clientId: "c1", date: daysAgo(1), total: 100, currency: "USD" }],
      1400, NOW
    );
    expect(st.totalSpentARS).toBe(140000);
  });
  it("cliente sin compras", () => {
    const [st] = buildClientStats([{ id: "c9", name: "Nadie" }], [], 1, NOW);
    expect(st.salesCount).toBe(0);
    expect(st.daysSinceLast).toBe(null);
    expect(st.avgDaysBetween).toBe(null);
  });
});

describe("classifyClient", () => {
  it("activo si compró dentro de su cadencia", () => {
    expect(classifyClient({ salesCount: 4, avgDaysBetween: 10, daysSinceLast: 8 }, NOW)).toBe("activo");
  });
  it("en_riesgo si pasó ~2x la cadencia", () => {
    expect(classifyClient({ salesCount: 4, avgDaysBetween: 10, daysSinceLast: 20 }, NOW)).toBe("en_riesgo");
  });
  it("dormido si pasó mucho", () => {
    expect(classifyClient({ salesCount: 4, avgDaysBetween: 10, daysSinceLast: 40 }, NOW)).toBe("dormido");
  });
  it("nuevo si 1 compra reciente, dormido si vieja", () => {
    expect(classifyClient({ salesCount: 1, daysSinceLast: 10 }, NOW)).toBe("nuevo");
    expect(classifyClient({ salesCount: 1, daysSinceLast: 90 }, NOW)).toBe("dormido");
  });
  it("sin_compras", () => {
    expect(classifyClient({ salesCount: 0 }, NOW)).toBe("sin_compras");
  });
});

describe("predictNextPurchase", () => {
  it("al_dia si todavía no toca", () => {
    const p = predictNextPurchase({ lastPurchase: { date: daysAgo(2) }, avgDaysBetween: 30 }, NOW);
    expect(p.status).toBe("al_dia");
  });
  it("atrasado si pasó la fecha esperada", () => {
    const p = predictNextPurchase({ lastPurchase: { date: daysAgo(60) }, avgDaysBetween: 30 }, NOW);
    expect(p.status).toBe("atrasado");
    expect(p.overdueDays).toBe(30);
  });
  it("null si no hay cadencia", () => {
    expect(predictNextPurchase({ lastPurchase: { date: daysAgo(2) } }, NOW)).toBe(null);
  });
});

describe("clientAlerts", () => {
  it("VIP que se enfría → alerta high", () => {
    const stats = [{ id: "c1", name: "Ana", tier: "vip", salesCount: 5, avgDaysBetween: 10, daysSinceLast: 25, balance: 0 }];
    const a = clientAlerts(stats, NOW);
    expect(a[0].type).toBe("vip_riesgo");
    expect(a[0].severity).toBe("high");
  });
  it("cliente recurrente que se enfría → reactivar", () => {
    const stats = [{ id: "c2", name: "Beto", tier: "regular", salesCount: 4, avgDaysBetween: 10, daysSinceLast: 22, balance: 0 }];
    const a = clientAlerts(stats, NOW);
    expect(a.some(x => x.type === "reactivar")).toBe(true);
  });
  it("deuda genera alerta", () => {
    const stats = [{ id: "c3", name: "Caro", tier: "regular", salesCount: 1, daysSinceLast: 5, balance: -8000 }];
    const a = clientAlerts(stats, NOW);
    expect(a.some(x => x.type === "deuda")).toBe(true);
  });
  it("ordena por severidad (high primero)", () => {
    const stats = [
      { id: "c3", name: "Caro", tier: "regular", salesCount: 1, daysSinceLast: 5, balance: -8000 },
      { id: "c1", name: "Ana", tier: "vip", salesCount: 5, avgDaysBetween: 10, daysSinceLast: 25, balance: 0 },
    ];
    const a = clientAlerts(stats, NOW);
    expect(a[0].severity).toBe("high");
  });
});

describe("segmentBreakdown / clientsToReach", () => {
  const stats = [
    { id: "a", name: "A", salesCount: 4, avgDaysBetween: 30, daysSinceLast: 2, totalSpentARS: 100, lastPurchase: { date: daysAgo(2) } },
    { id: "b", name: "B", salesCount: 4, avgDaysBetween: 10, daysSinceLast: 22, totalSpentARS: 500, lastPurchase: { date: daysAgo(22) } },
    { id: "c", name: "C", salesCount: 0 },
  ];
  it("cuenta segmentos", () => {
    const bd = segmentBreakdown(stats, NOW);
    expect(bd.activo).toBe(1);
    expect(bd.en_riesgo).toBe(1);
    expect(bd.sin_compras).toBe(1);
  });
  it("clientsToReach prioriza por valor y filtra los al_dia", () => {
    const reach = clientsToReach(stats, NOW);
    // B está atrasado (22d, cadencia 10) y vale más → primero. A está al día.
    expect(reach[0].id).toBe("b");
    expect(reach.find(x => x.id === "a")).toBeUndefined();
  });
});
