import { describe, it, expect } from "vitest";
import { categorizeExpense, withdrawalAccount, aggregateByAccount, ACCOUNTS } from "./chartOfAccounts.js";

describe("categorizeExpense", () => {
  it("clasifica envíos en 5.2.01", () => {
    expect(categorizeExpense({ category: "Envío a CABA" })).toBe("5.2.01");
    expect(categorizeExpense({ category: "Logística" })).toBe("5.2.01");
  });

  it("clasifica marketing en 5.2.02", () => {
    expect(categorizeExpense({ category: "Marketing IG" })).toBe("5.2.02");
    expect(categorizeExpense({ description: "Ads Facebook" })).toBe("5.2.02");
  });

  it("clasifica servicios en 5.2.03", () => {
    expect(categorizeExpense({ category: "Internet" })).toBe("5.2.03");
    expect(categorizeExpense({ description: "Hosting vercel" })).toBe("5.2.03");
  });

  it("default a otros (5.2.99) si no matchea", () => {
    expect(categorizeExpense({ category: "Cosa rara" })).toBe("5.2.99");
    expect(categorizeExpense(null)).toBe("5.2.99");
  });
});

describe("withdrawalAccount", () => {
  it("garantía → 5.3.02", () => {
    expect(withdrawalAccount({ withdrawType: "Garantía" })).toBe("5.3.02");
  });
  it("regalo → 5.3.03", () => {
    expect(withdrawalAccount({ withdrawType: "Regalo" })).toBe("5.3.03");
    expect(withdrawalAccount({ withdrawType: "Cortesía" })).toBe("5.3.03");
  });
  it("consumo propio (default) → 5.3.01", () => {
    expect(withdrawalAccount({ withdrawType: "Consumo propio" })).toBe("5.3.01");
    expect(withdrawalAccount({})).toBe("5.3.01");
  });
});

describe("aggregateByAccount", () => {
  it("suma revenue de ventas en 4.1.01", () => {
    const totals = aggregateByAccount({
      sales: [{ total: 50000, currency: "ARS" }],
      exchangeRate: 1000,
    });
    expect(totals["4.1.01"]).toBe(50000);
  });

  it("convierte USD a ARS", () => {
    const totals = aggregateByAccount({
      sales: [{ total: 20, currency: "USD", exchangeRate: 1500 }],
      exchangeRate: 1000,
    });
    expect(totals["4.1.01"]).toBe(30000);
  });

  it("agrupa gastos por categoría correcta", () => {
    const totals = aggregateByAccount({
      expenses: [
        { category: "Envío", amountARS: 5000 },
        { category: "Marketing", amountARS: 8000 },
        { category: "Misceláneo", amountARS: 3000 },
      ],
    });
    expect(totals["5.2.01"]).toBe(5000);
    expect(totals["5.2.02"]).toBe(8000);
    expect(totals["5.2.99"]).toBe(3000);
  });

  it("ignora borrados", () => {
    const totals = aggregateByAccount({
      sales: [
        { total: 10000, currency: "ARS" },
        { total: 99999, currency: "ARS", isDeleted: true },
      ],
    });
    expect(totals["4.1.01"]).toBe(10000);
  });
});

describe("ACCOUNTS", () => {
  it("todas tienen code, name, type, group", () => {
    Object.values(ACCOUNTS).forEach(a => {
      expect(a.code).toBeTruthy();
      expect(a.name).toBeTruthy();
      expect(a.type).toBeTruthy();
      expect(a.group).toBeTruthy();
    });
  });
});
