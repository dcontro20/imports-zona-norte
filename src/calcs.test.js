import { describe, it, expect } from "vitest";
import {
  calcTotalRevenue,
  calcTotalRevenueUSD,
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

  it("uses per-sale exchangeRate when available", () => {
    const sales = [
      { total: 100, currency: "USD", exchangeRate: 1200 },
      { total: 100, currency: "USD", exchangeRate: 1500 },
    ];
    expect(calcTotalRevenue(sales, RATE)).toBe(100 * 1200 + 100 * 1500);
  });

  it("falls back to provided rate when sale has no exchangeRate", () => {
    const sales = [{ total: 100, currency: "USD" }];
    expect(calcTotalRevenue(sales, RATE)).toBe(100 * RATE);
  });
});

describe("calcTotalRevenueUSD", () => {
  it("converts ARS to USD using per-sale rate", () => {
    const sales = [{ total: 140000, currency: "ARS", exchangeRate: 1400 }];
    expect(calcTotalRevenueUSD(sales, RATE)).toBe(100);
  });

  it("keeps USD as-is", () => {
    const sales = [{ total: 50, currency: "USD" }];
    expect(calcTotalRevenueUSD(sales, RATE)).toBe(50);
  });

  it("falls back to provided rate", () => {
    const sales = [{ total: 14000, currency: "ARS" }];
    expect(calcTotalRevenueUSD(sales, RATE)).toBe(10);
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
  it("multiplies costEstimateUSD sum by exchange rate (legacy data)", () => {
    const withdrawals = [{ costEstimateUSD: 10 }, { costEstimateUSD: 5 }];
    expect(calcConsumoValue(withdrawals, RATE)).toBe(15 * RATE);
  });

  it("prefers costRealUSD over costEstimateUSD when present", () => {
    const withdrawals = [{ costRealUSD: 8, costEstimateUSD: 18 }];
    expect(calcConsumoValue(withdrawals, RATE)).toBe(8 * RATE);
  });

  it("falls back to costEstimateUSD when costRealUSD is missing", () => {
    const withdrawals = [{ costEstimateUSD: 12 }];
    expect(calcConsumoValue(withdrawals, RATE)).toBe(12 * RATE);
  });

  it("excludes soft-deleted withdrawals", () => {
    const withdrawals = [
      { costRealUSD: 10 },
      { costRealUSD: 99, isDeleted: true },
    ];
    expect(calcConsumoValue(withdrawals, RATE)).toBe(10 * RATE);
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
    expect(result.netProfitComun).toBe(100000);
    expect(result.halfProfit).toBe(50000);
    expect(result.diegoBalance).toBe(50000);
    expect(result.gustavoBalance).toBe(50000);
    expect(result.profitRemaining).toBe(100000);
  });

  it("subtracts ARS partner withdrawals correctly", () => {
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

  it("converts USD partner withdrawals to ARS", () => {
    const pw = [{ person: "Diego", amount: 50, currency: "USD" }];
    const result = calcPartnerBalances(sales, purchases, expenses, withdrawals, pw, RATE);
    expect(result.diegoTotal).toBe(50 * RATE);
    expect(result.diegoBalance).toBe(50000 - 50 * RATE);
  });

  it("excludes soft-deleted partner withdrawals", () => {
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

  // ============================================
  // NUEVO: consumo personal individual vs mermas comunes
  // ============================================

  it("consumo personal de Diego se imputa 100% a Diego, NO 50/50", () => {
    // Diego se fumó algo que costó 10 USD = 14000 ARS
    const w = [{ withdrawType: "Consumo propio", person: "Diego", costRealUSD: 10 }];
    const result = calcPartnerBalances(sales, purchases, expenses, w, [], RATE);

    // Pozo común NO se reduce por consumo personal → halfProfit sigue siendo 50000
    expect(result.netProfitComun).toBe(100000);
    expect(result.halfProfit).toBe(50000);
    expect(result.mermasComunes).toBe(0);

    // Diego absorbe 100% el consumo, Gustavo queda intacto
    expect(result.consumoDiego).toBe(14000);
    expect(result.consumoGustavo).toBe(0);
    expect(result.diegoBalance).toBe(50000 - 14000);
    expect(result.gustavoBalance).toBe(50000);
  });

  it("consumo personal de Gustavo se imputa 100% a Gustavo", () => {
    const w = [{ withdrawType: "Consumo propio", person: "Gustavo", costRealUSD: 7 }];
    const result = calcPartnerBalances(sales, purchases, expenses, w, [], RATE);
    expect(result.consumoDiego).toBe(0);
    expect(result.consumoGustavo).toBe(7 * RATE);
    expect(result.diegoBalance).toBe(50000);
    expect(result.gustavoBalance).toBe(50000 - 7 * RATE);
  });

  it("garantías y regalos sí afectan el pozo común 50/50", () => {
    const w = [
      { withdrawType: "Garantía / Devolución", person: "Diego", costRealUSD: 10 },
      { withdrawType: "Regalo / Canje", person: "Gustavo", costRealUSD: 5 },
    ];
    const result = calcPartnerBalances(sales, purchases, expenses, w, [], RATE);
    // mermas comunes = (10 + 5) * 1400 = 21000
    expect(result.mermasComunes).toBe(21000);
    // pozo común = 100000 - 21000 = 79000 → half = 39500 c/u
    expect(result.netProfitComun).toBe(79000);
    expect(result.halfProfit).toBe(39500);
    expect(result.consumoDiego).toBe(0);
    expect(result.consumoGustavo).toBe(0);
    expect(result.diegoBalance).toBe(39500);
    expect(result.gustavoBalance).toBe(39500);
  });

  it("mix de consumo personal + garantías + retiros", () => {
    const w = [
      { withdrawType: "Consumo propio", person: "Diego", costRealUSD: 10 },     // 14000 a Diego
      { withdrawType: "Consumo propio", person: "Gustavo", costRealUSD: 3 },    // 4200 a Gustavo
      { withdrawType: "Garantía / Devolución", person: "Diego", costRealUSD: 5 }, // 7000 común
    ];
    const pw = [
      { person: "Diego", amount: 20000, currency: "ARS" },
    ];
    const result = calcPartnerBalances(sales, purchases, expenses, w, pw, RATE);
    expect(result.mermasComunes).toBe(7000);
    expect(result.netProfitComun).toBe(100000 - 7000); // = 93000
    expect(result.halfProfit).toBe(46500);
    expect(result.consumoDiego).toBe(14000);
    expect(result.consumoGustavo).toBe(4200);
    expect(result.diegoBalance).toBe(46500 - 14000 - 20000); // = 12500
    expect(result.gustavoBalance).toBe(46500 - 4200);        // = 42300
  });

  it("ignora consumo personal de socios eliminados (soft-deleted)", () => {
    const w = [
      { withdrawType: "Consumo propio", person: "Diego", costRealUSD: 10 },
      { withdrawType: "Consumo propio", person: "Diego", costRealUSD: 999, isDeleted: true },
    ];
    const result = calcPartnerBalances(sales, purchases, expenses, w, [], RATE);
    expect(result.consumoDiego).toBe(10 * RATE);
  });

  it("netProfit total incluye consumo personal (la merma sigue siendo plata perdida)", () => {
    const w = [
      { withdrawType: "Consumo propio", person: "Diego", costRealUSD: 10 },
      { withdrawType: "Garantía / Devolución", person: "Diego", costRealUSD: 5 },
    ];
    const result = calcPartnerBalances(sales, purchases, expenses, w, [], RATE);
    // netProfit total = 100000 - mermasComunes(7000) - consumoDiego(14000) - consumoGustavo(0) = 79000
    expect(result.netProfit).toBe(79000);
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
