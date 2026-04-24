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
  reverseSaleBalanceDelta,
  validateWithdrawalForm,
  calcAccountBalance,
} from "./calcs.js";
import {
  ACCOUNT_METHOD_MAP, payMethodToAccountId, normalizeType,
} from "./components/cash/shared.js";

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

describe("reverseSaleBalanceDelta", () => {
  it("returns 0 for null/undefined sale", () => {
    expect(reverseSaleBalanceDelta(null)).toBe(0);
    expect(reverseSaleBalanceDelta(undefined)).toBe(0);
  });

  it("returns 0 for sale without balance impact", () => {
    expect(reverseSaleBalanceDelta({ total: 1000 })).toBe(0);
  });

  it("adds debtAmount back when client owed money", () => {
    const sale = { debtAmount: 500, debtDirection: "clientOwes" };
    expect(reverseSaleBalanceDelta(sale)).toBe(500);
  });

  it("ignores debtAmount if direction is not clientOwes", () => {
    const sale = { debtAmount: 500, debtDirection: "weOwe" };
    expect(reverseSaleBalanceDelta(sale)).toBe(0);
  });

  it("adds creditUsed back (client had credit consumed)", () => {
    const sale = { creditUsed: 200 };
    expect(reverseSaleBalanceDelta(sale)).toBe(200);
  });

  it("subtracts changeAmount if change was given as credit", () => {
    const sale = { changeAmount: 100, changeMethod: "credit" };
    expect(reverseSaleBalanceDelta(sale)).toBe(-100);
  });

  it("ignores changeAmount if method is not credit", () => {
    const sale = { changeAmount: 100, changeMethod: "MP Diego" };
    expect(reverseSaleBalanceDelta(sale)).toBe(0);
  });

  it("combines all three effects correctly", () => {
    // Cliente debía 500, usó 200 de crédito, y recibió 100 como crédito
    // Revertir: +500 (deuda) +200 (crédito usado) -100 (crédito dado) = 600
    const sale = {
      debtAmount: 500, debtDirection: "clientOwes",
      creditUsed: 200,
      changeAmount: 100, changeMethod: "credit",
    };
    expect(reverseSaleBalanceDelta(sale)).toBe(600);
  });
});

describe("validateWithdrawalForm", () => {
  const products = [
    { id: "p1", brand: "Elfbar", model: "TE", flavor: "Apple", stock: 10 },
    { id: "p2", brand: "Elfbar", model: "TE", flavor: "Mint", stock: 0 },
  ];
  const validForm = {
    productId: "p1", qty: 2, person: "Diego", withdrawType: "Consumo propio",
  };

  it("rejects empty form", () => {
    expect(validateWithdrawalForm(null)).toBeTruthy();
    expect(validateWithdrawalForm({})).toMatch(/producto/i);
  });

  it("rejects unknown productId", () => {
    const r = validateWithdrawalForm({ ...validForm, productId: "xxx" }, products);
    expect(r).toMatch(/no existe/i);
  });

  it("rejects missing person", () => {
    const r = validateWithdrawalForm({ ...validForm, person: "" }, products);
    expect(r).toMatch(/quién/i);
  });

  it("rejects missing withdrawType", () => {
    const r = validateWithdrawalForm({ ...validForm, withdrawType: "" }, products);
    expect(r).toMatch(/tipo/i);
  });

  it("rejects qty = 0 or negative", () => {
    expect(validateWithdrawalForm({ ...validForm, qty: 0 }, products)).toMatch(/cantidad/i);
    expect(validateWithdrawalForm({ ...validForm, qty: -1 }, products)).toMatch(/cantidad/i);
  });

  it("rejects qty exceeding stock", () => {
    const r = validateWithdrawalForm({ ...validForm, qty: 50 }, products);
    expect(r).toMatch(/Stock insuficiente/);
  });

  it("accepts valid Consumo propio", () => {
    expect(validateWithdrawalForm(validForm, products)).toBeNull();
  });

  it("requires failedProductId for garantías", () => {
    const r = validateWithdrawalForm({
      ...validForm, withdrawType: "Cambio por garantía",
    }, products);
    expect(r).toMatch(/falló/i);
  });

  it("requires failureReason for garantías", () => {
    const r = validateWithdrawalForm({
      ...validForm, withdrawType: "Cambio por garantía", failedProductId: "p1",
    }, products);
    expect(r).toMatch(/razón/i);
  });

  it("requires notes when failureReason is Otro", () => {
    const r = validateWithdrawalForm({
      ...validForm, withdrawType: "Cambio por garantía", failedProductId: "p1",
      failureReason: "Otro", failureNotes: "x",
    }, products);
    expect(r).toMatch(/Describí/i);
  });

  it("accepts full valid garantía", () => {
    const r = validateWithdrawalForm({
      ...validForm, withdrawType: "Cambio por garantía",
      failedProductId: "p1", failureReason: "No enciende",
    }, products);
    expect(r).toBeNull();
  });

  it("also accepts legacy string 'Garantía / Devolución'", () => {
    const r = validateWithdrawalForm({
      ...validForm, withdrawType: "Garantía / Devolución",
      failedProductId: "p1", failureReason: "No enciende",
    }, products);
    expect(r).toBeNull();
  });

  it("rejects missing linkedSale when referenced in garantía", () => {
    const r = validateWithdrawalForm({
      ...validForm, withdrawType: "Cambio por garantía",
      failedProductId: "p1", failureReason: "No enciende",
      linkedSaleId: "nonexistent",
    }, products, []);
    expect(r).toMatch(/venta vinculada/i);
  });

  it("rejects if failedProductId is not in the linkedSale", () => {
    const sales = [{ id: "s1", items: [{ productId: "p2" }] }];
    const r = validateWithdrawalForm({
      ...validForm, withdrawType: "Cambio por garantía",
      failedProductId: "p1", failureReason: "No enciende",
      linkedSaleId: "s1",
    }, products, sales);
    expect(r).toMatch(/no aparece en la venta/i);
  });

  it("accepts if failedProductId matches a linkedSale item", () => {
    const sales = [{ id: "s1", items: [{ productId: "p1" }, { productId: "p2" }] }];
    const r = validateWithdrawalForm({
      ...validForm, withdrawType: "Cambio por garantía",
      failedProductId: "p1", failureReason: "No enciende",
      linkedSaleId: "s1",
    }, products, sales);
    expect(r).toBeNull();
  });

  it("rejects if linkedSale was soft-deleted", () => {
    const sales = [{ id: "s1", isDeleted: true }];
    const r = validateWithdrawalForm({
      ...validForm, withdrawType: "Cambio por garantía",
      failedProductId: "p1", failureReason: "No enciende",
      linkedSaleId: "s1",
    }, products, sales);
    expect(r).toMatch(/venta vinculada/i);
  });

  it("rejects missing linkedClient", () => {
    const r = validateWithdrawalForm({
      ...validForm, linkedClientId: "xxx",
    }, products, [], []);
    expect(r).toMatch(/cliente vinculado/i);
  });

  it("rejects future dates", () => {
    const r = validateWithdrawalForm({
      ...validForm, date: "2026-05-01",
    }, products, [], [], "2026-04-24");
    expect(r).toMatch(/futuras/i);
  });

  it("accepts today's date", () => {
    const r = validateWithdrawalForm({
      ...validForm, date: "2026-04-24",
    }, products, [], [], "2026-04-24");
    expect(r).toBeNull();
  });
});

describe("calcAccountBalance", () => {
  const ctx = {
    initialBalances: { mpDiego: 1000, lemonPesos: 0, lemonUSDT: 50, usdCash: 0, pesosCash: 0, mpGustavo: 0 },
    accountMethodMap: ACCOUNT_METHOD_MAP,
    payMethodToAccountId,
    normalizeType,
  };

  it("starts with initial balance when no movements", () => {
    expect(calcAccountBalance("mpDiego", { ...ctx, sales: [], purchases: [], cashMovements: [] })).toBe(1000);
  });

  it("adds sale payment to the matching MP account", () => {
    const sales = [{ id: "s1", paymentMethod: "Mercado Pago", mpAccount: "MP Diego", total: 500 }];
    expect(calcAccountBalance("mpDiego", { ...ctx, sales, purchases: [], cashMovements: [] })).toBe(1500);
    // MP Gustavo no se afecta
    expect(calcAccountBalance("mpGustavo", { ...ctx, sales, purchases: [], cashMovements: [] })).toBe(0);
  });

  it("skips soft-deleted sales", () => {
    const sales = [
      { id: "s1", paymentMethod: "Mercado Pago", mpAccount: "MP Diego", total: 500 },
      { id: "s2", paymentMethod: "Mercado Pago", mpAccount: "MP Diego", total: 300, isDeleted: true },
    ];
    expect(calcAccountBalance("mpDiego", { ...ctx, sales, purchases: [], cashMovements: [] })).toBe(1500);
  });

  it("handles multi-payment sales", () => {
    const sales = [{
      id: "s1",
      payments: [
        { method: "Mercado Pago", mpAccount: "MP Diego", amount: 200 },
        { method: "Lemon", amount: 300 },
      ],
    }];
    expect(calcAccountBalance("mpDiego", { ...ctx, sales, purchases: [], cashMovements: [] })).toBe(1200);
    expect(calcAccountBalance("lemonPesos", { ...ctx, sales, purchases: [], cashMovements: [] })).toBe(300);
  });

  it("subtracts change when method is not credit", () => {
    const sales = [{ id: "s1", paymentMethod: "Pesos Cash", total: 1000, changeAmount: 100, changeMethod: "Pesos Cash" }];
    // +1000 por la venta, -100 por el vuelto = +900
    expect(calcAccountBalance("pesosCash", { ...ctx, sales, purchases: [], cashMovements: [] })).toBe(900);
  });

  it("does NOT subtract change when method is credit", () => {
    const sales = [{ id: "s1", paymentMethod: "Pesos Cash", total: 1000, changeAmount: 100, changeMethod: "credit" }];
    // +1000, sin descuento (el crédito queda como saldo del cliente, no afecta caja)
    expect(calcAccountBalance("pesosCash", { ...ctx, sales, purchases: [], cashMovements: [] })).toBe(1000);
  });

  it("subtracts verified purchases USDT from lemonUSDT", () => {
    const purchases = [
      { id: "p1", status: "verificado", totalUSDT: 10 },
      { id: "p2", status: "pedido", totalUSDT: 20 }, // no afecta (no verificado)
    ];
    // inicial 50 - 10 = 40
    expect(calcAccountBalance("lemonUSDT", { ...ctx, sales: [], purchases, cashMovements: [] })).toBe(40);
  });

  it("transfer movement: -from, +to", () => {
    const cashMovements = [{ id: "m1", type: "transfer", from: "mpDiego", to: "lemonPesos", amount: 200 }];
    expect(calcAccountBalance("mpDiego", { ...ctx, sales: [], purchases: [], cashMovements })).toBe(800);
    expect(calcAccountBalance("lemonPesos", { ...ctx, sales: [], purchases: [], cashMovements })).toBe(200);
  });

  it("crypto_buy: pesos → USDT conversion", () => {
    const cashMovements = [{ id: "m1", type: "crypto_buy", from: "lemonPesos", to: "lemonUSDT", amount: 140000, amountUSDT: 100 }];
    const base = { ...ctx, initialBalances: { ...ctx.initialBalances, lemonPesos: 200000 } };
    expect(calcAccountBalance("lemonPesos", { ...base, sales: [], purchases: [], cashMovements })).toBe(60000);
    expect(calcAccountBalance("lemonUSDT", { ...base, sales: [], purchases: [], cashMovements })).toBe(150); // 50 + 100 USDT
  });

  it("conciliation_adjust: applies delta to named account", () => {
    const cashMovements = [{ id: "m1", type: "conciliation_adjust", account: "mpDiego", delta: -50 }];
    expect(calcAccountBalance("mpDiego", { ...ctx, sales: [], purchases: [], cashMovements })).toBe(950);
  });

  it("ignores daily_close entries (snapshot-only, no ledger impact)", () => {
    const cashMovements = [{ id: "m1", type: "daily_close", from: "mpDiego", amount: 999 }];
    expect(calcAccountBalance("mpDiego", { ...ctx, sales: [], purchases: [], cashMovements })).toBe(1000);
  });
});
