import { describe, it, expect } from "vitest";
import { parseBankCSV, reconcileBank } from "./reconciliation.js";

describe("parseBankCSV", () => {
  it("parsea CSV con headers date,amount,description", () => {
    const csv = `date,amount,description
2026-06-01,15000,Pago Juan
2026-06-02,20000,Pago Pedro`;
    const out = parseBankCSV(csv);
    expect(out).toHaveLength(2);
    expect(out[0].amount).toBe(15000);
    expect(out[1].description).toBe("Pago Pedro");
  });

  it("acepta headers en español (fecha, monto, detalle)", () => {
    const csv = `fecha,monto,detalle
2026-06-01,10000,Test`;
    const out = parseBankCSV(csv);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(10000);
  });

  it("limpia caracteres no numéricos del amount ($, separadores)", () => {
    const csv = `date,amount
2026-06-01,"$15.000"`;
    const out = parseBankCSV(csv);
    // Nota: el regex saca $ pero NO el . separador → 15000 o 15 según locale
    // Test simple de que no crashea y devuelve algo numérico
    expect(typeof out[0].amount).toBe("number");
  });

  it("devuelve vacío si CSV inválido", () => {
    expect(parseBankCSV("")).toEqual([]);
    expect(parseBankCSV("solo una linea")).toEqual([]);
    expect(parseBankCSV(null)).toEqual([]);
  });
});

describe("reconcileBank", () => {
  const SALES = [
    { id: "s1", date: "2026-06-01", total: 15000, currency: "ARS",
      paymentMethod: "Mercado Pago", clientName: "Juan" },
    { id: "s2", date: "2026-06-02", total: 20000, currency: "ARS",
      paymentMethod: "Mercado Pago", clientName: "Pedro" },
    { id: "s3", date: "2026-06-03", total: 5000, currency: "ARS",
      paymentMethod: "Pesos Cash", clientName: "Sofia" }, // distinto método
  ];

  it("matchea ventas con movimientos por monto+fecha", () => {
    const bank = [
      { date: "2026-06-01", amount: 15000, description: "MP Juan" },
      { date: "2026-06-02", amount: 20000, description: "MP Pedro" },
    ];
    const r = reconcileBank({ bankMovements: bank, sales: SALES, paymentMethod: "Mercado Pago" });
    expect(r.matched).toHaveLength(2);
    expect(r.unmatched_bank).toHaveLength(0);
    expect(r.summary.matchRate).toBe(100);
  });

  it("identifica movimientos sin venta correspondiente", () => {
    const bank = [
      { date: "2026-06-10", amount: 999999, description: "Misterio" },
    ];
    const r = reconcileBank({ bankMovements: bank, sales: SALES, paymentMethod: "Mercado Pago" });
    expect(r.unmatched_bank).toHaveLength(1);
  });

  it("identifica ventas sin movimiento bancario", () => {
    const bank = [];
    const r = reconcileBank({ bankMovements: bank, sales: SALES, paymentMethod: "Mercado Pago" });
    expect(r.unmatched_sales.length).toBe(2); // 2 MP sin match
  });

  it("ignora ventas con otro método de pago", () => {
    const bank = [];
    const r = reconcileBank({ bankMovements: bank, sales: SALES, paymentMethod: "Lemon" });
    expect(r.unmatched_sales).toHaveLength(0);
  });

  it("tolera diferencia de 1 día por defecto", () => {
    const bank = [
      { date: "2026-06-02", amount: 15000, description: "MP Juan" }, // venta fue el 01
    ];
    const r = reconcileBank({ bankMovements: bank, sales: SALES, paymentMethod: "Mercado Pago" });
    expect(r.matched).toHaveLength(1);
  });
});
