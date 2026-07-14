import { describe, it, expect } from "vitest";
import {
  saleOutstanding, clientOutstanding, creditStatus, canChargeOnAccount,
  oldestUnpaidDays, isOverdue, allocatePayment, DEFAULT_CREDIT_TERM_DAYS,
} from "./creditAccount.js";

const NOW = new Date("2026-07-14T12:00:00Z").getTime();
const ago = (d) => new Date(NOW - d * 86400000).toISOString();

const client = { id: "c1", creditEnabled: true, creditLimitARS: 100000 };
const noCredit = { id: "c2", creditEnabled: false, creditLimitARS: 0 };

const sales = [
  { id: "s1", saleType: "mayorista", clientId: "c1", total: 30000, payments: [], date: ago(40) },        // impago viejo
  { id: "s2", saleType: "mayorista", clientId: "c1", total: 20000, payments: [{ amount: 20000 }], date: ago(5) }, // pagado
  { id: "s3", saleType: "mayorista", clientId: "c1", total: 15000, payments: [{ amount: 5000 }], date: ago(2) },  // parcial (falta 10000)
  { id: "s4", saleType: "minorista", clientId: "c1", total: 9999, payments: [], date: ago(1) },           // minorista no cuenta
  { id: "s5", saleType: "mayorista", clientId: "c2", total: 5000, payments: [], date: ago(1) },
];

describe("saleOutstanding", () => {
  it("total menos pagos, nunca negativo", () => {
    expect(saleOutstanding(sales[0])).toBe(30000);
    expect(saleOutstanding(sales[1])).toBe(0);
    expect(saleOutstanding(sales[2])).toBe(10000);
    expect(saleOutstanding({ total: 100, payments: [{ amount: 500 }] })).toBe(0);
  });
});

describe("clientOutstanding", () => {
  it("suma lo impago de las ventas mayoristas del cliente", () => {
    expect(clientOutstanding(client, sales)).toBe(40000); // 30000 + 10000 (s2 pagada, s4 minorista)
  });
  it("cliente sin deuda = 0", () => {
    expect(clientOutstanding({ id: "zzz" }, sales)).toBe(0);
  });
});

describe("creditStatus", () => {
  it("calcula owed/available/overLimit con crédito habilitado", () => {
    const st = creditStatus(client, sales);
    expect(st.enabled).toBe(true);
    expect(st.owedARS).toBe(40000);
    expect(st.availableARS).toBe(60000); // 100000 - 40000
    expect(st.overLimit).toBe(false);
  });
  it("sin crédito habilitado → available 0", () => {
    const st = creditStatus(noCredit, sales);
    expect(st.enabled).toBe(false);
    expect(st.availableARS).toBe(0);
    expect(st.owedARS).toBe(5000); // debe igual (se derivó de ventas), pero sin crédito habilitado
  });
  it("overLimit cuando debe más que el límite", () => {
    const st = creditStatus({ id: "c1", creditEnabled: true, creditLimitARS: 30000 }, sales);
    expect(st.overLimit).toBe(true);
  });
});

describe("canChargeOnAccount", () => {
  it("permite si crédito habilitado y no pasa el límite", () => {
    expect(canChargeOnAccount(client, sales, 50000)).toBe(true);  // 40000 + 50000 = 90000 <= 100000
    expect(canChargeOnAccount(client, sales, 70000)).toBe(false); // 110000 > 100000
  });
  it("nunca si el crédito está OFF (paga contra entrega)", () => {
    expect(canChargeOnAccount(noCredit, sales, 100)).toBe(false);
  });
});

describe("oldestUnpaidDays + isOverdue", () => {
  it("días de la venta impaga más vieja", () => {
    expect(oldestUnpaidDays(client, sales, NOW)).toBe(40); // s1
  });
  it("null si no debe nada", () => {
    expect(oldestUnpaidDays({ id: "zzz" }, sales, NOW)).toBeNull();
  });
  it("en mora si supera el plazo (default 30d)", () => {
    expect(isOverdue(client, sales, DEFAULT_CREDIT_TERM_DAYS, NOW)).toBe(true); // 40 >= 30
    expect(isOverdue(client, sales, 60, NOW)).toBe(false); // 40 < 60
  });
});

describe("allocatePayment", () => {
  it("aplica el pago a las ventas más viejas primero", () => {
    const { updates, leftover } = allocatePayment(client, sales, 35000);
    // s1 (30000) full, s3 (10000) recibe 5000 parcial
    expect(updates).toEqual([
      { saleId: "s1", amount: 30000, fullyPaid: true },
      { saleId: "s3", amount: 5000, fullyPaid: false },
    ]);
    expect(leftover).toBe(0);
  });
  it("sobrante si el pago supera lo adeudado", () => {
    const { updates, leftover } = allocatePayment(client, sales, 50000);
    expect(updates.reduce((s, u) => s + u.amount, 0)).toBe(40000);
    expect(leftover).toBe(10000);
  });
  it("sin deuda → sin updates", () => {
    expect(allocatePayment({ id: "zzz" }, sales, 1000)).toEqual({ updates: [], leftover: 1000 });
  });
});
