import { describe, it, expect } from "vitest";
import {
  calcTotalRevenue,
  calcTotalCosts,
  calcTotalExpenses,
  calcConsumoValue,
  calcNetProfit,
  calcPartnerBalances,
  formatMoney,
} from "./calcs.js";

const RATE = 1400; // ARS per USD

describe("calcTotalRevenue", () => {
  it("sums ARS sales", () => {
    const sales = [
      { total: 10000, currency: "ARS" },
      { total: 20000, currency: "ARS" },
    ];
    expect(calcTotalRevenue(sales, RATE)).toBe(30000);
  });

  it("converts USD sales to ARS", () => {
    const sales = [{ total: 100, currency: "USD" }];
    expect(calcTotalRevenue(sales, RATE)).toBe(140000);
  });

  it("converts USDT sales to ARS", () => {
    const sales = [{ total: 50, currency: "USDT" }];
    expect(calcTotalRevenue(sales, RATE)).toBe(70000);
  });

  it("handles mixed currencies", () => {
    const sales = [
      { total: 10000, currency: "ARS" },
      { total: 100, currency: "USD" },
      { total: 50, currency: "USDT" },
    ];
    expect(calcTotalRevenue(sales, RATE)).toBe(10000 + 140000 + 70000);
  });

  it("defaults to ARS when currency is missing", () => {
    const sales = [{ total: 5000 }];
    expect(calcTotalRevenue(sales, RATE)).toBe(5000);
  });

  it("handles empty array", () => {
    expect(calcTotalRevenue([], RATE)).toBe(0);
  });

  it("handles null totals", () => {
    const sales = [{ total: null, currency: "ARS" }];
    expect(calcTotalRevenue(sales, RATE)).toBe(0);
  });
});

describe("calcTotalCosts", () => {
  it("sums totalCostARS from purchases", () => {
    const purchases = [{ totalCostARS: 50000 }, { totalCostARS: 30000 }];
    expect(calcTotalCosts(purchases)).toBe(80000);
  });

  it("handles missing totalCostARS", () => {
    const purchases = [{ totalCostARS: 10000 }, {}];
    expect(calcTotalCosts(purchases)).toBe(10000);
  });
});

describe("calcTotalExpenses", () => {
  it("sums amountARS from expenses", () => {
    const expenses = [{ amountARS: 5000 }, { amountARS: 3000 }];
    expect(calcTotalExpenses(expenses)).toBe(8000);
  });
});

describe("calcConsumoValue", () => {
  it("multiplies costEstimateUSD sum by exchange rate", () => {
    const withdrawals = [{ costEstimateUSD: 10 }, { costEstimateUSD: 5 }];
    expect(calcConsumoValue(withdrawals, RATE)).toBe(15 * RATE);
  });

  it("handles empty array", () => {
    expect(calcConsumoValue([], RATE)).toBe(0);
  });
});

describe("calcNetProfit", () => {
  it("calculates revenue - costs - expenses - consumo", () => {
    const sales = [{ total: 100000, currency: "ARS" }];
    const purchases = [{ totalCostARS: 40000 }];
    const expenses = [{ amountARS: 10000 }];
    const withdrawals = [{ costEstimateUSD: 5 }]; // 5 * 1400 = 7000
    expect(calcNetProfit(sales, purchases, expenses, withdrawals, RATE)).toBe(100000 - 40000 - 10000 - 7000);
  });

  it("can be negative", () => {
    const sales = [{ total: 10000, currency: "ARS" }];
    const purchases = [{ totalCostARS: 50000 }];
    expect(calcNetProfit(sales, purchases, [], [], RATE)).toBe(-40000);
  });
});

describe("calcPartnerBalances", () => {
  const sales = [{ total: 200000, currency: "ARS" }];
  const purchases = [{ totalCostARS: 80000 }];
  const expenses = [{ amountARS: 20000 }];
  const withdrawals = []; // no consumo
  // Net = 200000 - 80000 - 20000 = 100000
  // Half = 50000 each

  it("splits profit 50/50 with no withdrawals", () => {
    const result = calcPartnerBalances(sales, purchases, expenses, withdrawals, [], RATE);
    expect(result.netProfit).toBe(100000);
    expect(result.halfProfit).toBe(50000);
    expect(result.diegoBalance).toBe(50000);
    expect(result.gustavoBalance).toBe(50000);
    expect(result.profitRemaining).toBe(100000);
  });

  it("subtracts ARS withdrawals correctly", () => {
    const pw = [
      { person: "Diego", amount: 30000, currency: "ARS" },
      { person: "Gustavo", amount: 20000, currency: "ARS" },
    ];
    const result = calcPartnerBalances(sales, purchases, expenses, withdrawals, pw, RATE);
    expect(result.diegoTotal).toBe(30000);
    expect(result.gustavoTotal).toBe(20000);
    expect(result.diegoBalance).toBe(50000 - 30000);
    expect(result.gustavoBalance).toBe(50000 - 20000);
    expect(result.profitRemaining).toBe(100000 - 50000);
  });

  it("converts USD withdrawals to ARS", () => {
    const pw = [{ person: "Diego", amount: 50, currency: "USD" }];
    const result = calcPartnerBalances(sales, purchases, expenses, withdrawals, pw, RATE);
    expect(result.diegoTotal).toBe(50 * RATE);
    expect(result.diegoBalance).toBe(50000 - 50 * RATE);
  });

  it("excludes soft-deleted withdrawals", () => {
    const pw = [
      { person: "Diego", amount: 10000, currency: "ARS" },
      { person: "Diego", amount: 99999, currency: "ARS", isDeleted: true },
    ];
    const result = calcPartnerBalances(sales, purchases, expenses, withdrawals, pw, RATE);
    expect(result.diegoTotal).toBe(10000);
  });

  it("handles negative balance (over-withdrawn)", () => {
    const pw = [{ person: "Diego", amount: 80000, currency: "ARS" }];
    const result = calcPartnerBalances(sales, purchases, expenses, withdrawals, pw, RATE);
    expect(result.diegoBalance).toBe(50000 - 80000);
    expect(result.diegoBalance).toBeLessThan(0);
  });
});

describe("formatMoney", () => {
  it("formats ARS with $ symbol", () => {
    expect(formatMoney(10000)).toMatch(/^\$/);
  });

  it("formats USD with US$ symbol", () => {
    expect(formatMoney(100, "USD")).toMatch(/^US\$/);
  });

  it("formats USDT with ₮ symbol", () => {
    expect(formatMoney(100, "USDT")).toMatch(/^₮/);
  });

  it("handles null/undefined", () => {
    expect(formatMoney(null)).toMatch(/^\$0/);
    expect(formatMoney(undefined)).toMatch(/^\$0/);
  });
});
