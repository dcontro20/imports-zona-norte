import { describe, it, expect } from "vitest";
import {
  saleOutstanding, clientOutstanding, creditStatus, canChargeOnAccount,
  oldestUnpaidDays, isOverdue, allocatePayment, DEFAULT_CREDIT_TERM_DAYS,
} from "./creditAccount.js";

// TANDA B.2 — edge cases de cuenta corriente. NO se toca la lógica.

const NOW = new Date("2026-07-14T12:00:00Z").getTime();
const ago = (d) => new Date(NOW - d * 86400000).toISOString();

describe("B.2 saleOutstanding — bordes", () => {
  it("pago mayor que el total → 0 (no negativo)", () => {
    expect(saleOutstanding({ total: 100, payments: [{ amount: 500 }] })).toBe(0);
  });
  it("pago exacto → 0", () => {
    expect(saleOutstanding({ total: 100, payments: [{ amount: 100 }] })).toBe(0);
  });
  it("venta borrada → 0", () => {
    expect(saleOutstanding({ total: 100, payments: [], isDeleted: true })).toBe(0);
  });
  it("sin total → 0, no NaN", () => {
    expect(saleOutstanding({ payments: [] })).toBe(0);
    expect(Number.isNaN(saleOutstanding({}))).toBe(false);
  });
  it("payments con amount no numérico no rompe", () => {
    expect(saleOutstanding({ total: 100, payments: [{ amount: "abc" }] })).toBe(100);
  });
});

describe("B.2 clientOutstanding — bordes", () => {
  it("cliente sin ventas → 0", () => {
    expect(clientOutstanding({ id: "c1" }, [])).toBe(0);
  });
  it("null client → 0", () => {
    expect(clientOutstanding(null, [{ saleType: "mayorista", clientId: "c1", total: 100, payments: [] }])).toBe(0);
  });
});

describe("B.2 canChargeOnAccount — borde exacto del límite", () => {
  const c = { id: "c1", creditEnabled: true, creditLimitARS: 100000 };
  const sales = [{ id: "s1", saleType: "mayorista", clientId: "c1", total: 40000, payments: [], date: ago(1) }];
  it("pedido == disponible exacto → permitido (<=)", () => {
    expect(canChargeOnAccount(c, sales, 60000)).toBe(true);  // 40000+60000 = 100000
    expect(canChargeOnAccount(c, sales, 60001)).toBe(false); // 100001 > límite
  });
  it("sin crédito habilitado → nunca", () => {
    expect(canChargeOnAccount({ id: "c1", creditEnabled: false, creditLimitARS: 999999 }, sales, 1)).toBe(false);
  });
});

describe("B.2 creditStatus — bordes", () => {
  it("límite negativo se clampa a 0", () => {
    const st = creditStatus({ creditEnabled: true, creditLimitARS: -5000 }, []);
    expect(st.limitARS).toBe(0);
    expect(st.availableARS).toBe(0);
  });
});

describe("B.2 mora — borde exacto de 30 días", () => {
  const c = { id: "c1" };
  it("exactamente 30 días → en mora (>=)", () => {
    const sales = [{ id: "s1", saleType: "mayorista", clientId: "c1", total: 100, payments: [], date: ago(30) }];
    expect(oldestUnpaidDays(c, sales, NOW)).toBe(30);
    expect(isOverdue(c, sales, DEFAULT_CREDIT_TERM_DAYS, NOW)).toBe(true);
  });
  it("29 días → no en mora", () => {
    const sales = [{ id: "s1", saleType: "mayorista", clientId: "c1", total: 100, payments: [], date: ago(29) }];
    expect(isOverdue(c, sales, DEFAULT_CREDIT_TERM_DAYS, NOW)).toBe(false);
  });
  it("debe pero está pago → no en mora", () => {
    const sales = [{ id: "s1", saleType: "mayorista", clientId: "c1", total: 100, payments: [{ amount: 100 }], date: ago(90) }];
    expect(isOverdue(c, sales, DEFAULT_CREDIT_TERM_DAYS, NOW)).toBe(false);
  });
});

describe("B.2 allocatePayment — bordes", () => {
  const c = { id: "c1" };
  const sales = [
    { id: "s1", saleType: "mayorista", clientId: "c1", total: 10000, payments: [], date: ago(30) },
    { id: "s2", saleType: "mayorista", clientId: "c1", total: 10000, payments: [], date: ago(10) },
  ];
  it("pago 0 → sin updates", () => {
    expect(allocatePayment(c, sales, 0)).toEqual({ updates: [], leftover: 0 });
  });
  it("pago que cubre 1.5 ventas → primera full, segunda parcial", () => {
    const { updates, leftover } = allocatePayment(c, sales, 15000);
    expect(updates).toEqual([
      { saleId: "s1", amount: 10000, fullyPaid: true },
      { saleId: "s2", amount: 5000, fullyPaid: false },
    ]);
    expect(leftover).toBe(0);
  });
  it("pago mayor que todo lo adeudado → leftover positivo, no sobre-aplica", () => {
    const { updates, leftover } = allocatePayment(c, sales, 25000);
    expect(updates.reduce((s, u) => s + u.amount, 0)).toBe(20000);
    expect(leftover).toBe(5000);
    expect(updates.every(u => u.fullyPaid)).toBe(true);
  });
  it("reparte más viejas primero", () => {
    const { updates } = allocatePayment(c, sales, 3000);
    expect(updates[0].saleId).toBe("s1"); // ago(30) es más vieja
  });
});
