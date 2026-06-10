import { describe, it, expect } from "vitest";
import { generateIncomeStatement, generateBalanceSheet, generateCashFlow } from "./financialStatements.js";

const PRODUCTS = [
  { id: "p1", priceUSD: 20, costUSDT: 10, stock: 5 },
  { id: "p2", priceUSD: 15, costUSDT: 8, stock: 3 },
];

const SALES = [
  { date: "2026-06-05", total: 20000, currency: "ARS", exchangeRate: 1000,
    items: [{ productId: "p1", qty: 1, priceUSD: 20 }] },
  { date: "2026-06-10", total: 15000, currency: "ARS", exchangeRate: 1000,
    items: [{ productId: "p2", qty: 1, priceUSD: 15 }] },
  { date: "2026-05-15", total: 99999, currency: "ARS" }, // fuera del período
];

const EXPENSES = [
  { date: "2026-06-03", category: "Envío", amountARS: 5000 },
  { date: "2026-06-08", category: "Marketing", amountARS: 8000 },
];

const WITHDRAWALS = [
  { date: "2026-06-07", withdrawType: "Garantía", costEstimateARS: 3000 },
];

describe("generateIncomeStatement", () => {
  it("calcula revenue, COGS, gross profit, opex, neto", () => {
    const is = generateIncomeStatement({
      sales: SALES, expenses: EXPENSES, withdrawals: WITHDRAWALS, products: PRODUCTS,
      from: "2026-06-01", to: "2026-06-30", exchangeRate: 1000,
    });
    expect(is.income.revenue).toBe(35000);
    // COGS = (10 + 8) × 1000 = 18000
    expect(is.cogs).toBe(18000);
    expect(is.grossProfit).toBe(17000);
    expect(is.opex.total).toBe(13000); // 5k + 8k
    expect(is.shrinkage.total).toBe(3000); // garantía
    expect(is.netResult).toBe(17000 - 13000 - 3000);
  });

  it("opex.lines agrupado por cuenta y ordenado desc", () => {
    const is = generateIncomeStatement({
      sales: SALES, expenses: EXPENSES, products: PRODUCTS,
      from: "2026-06-01", to: "2026-06-30", exchangeRate: 1000,
    });
    expect(is.opex.lines.length).toBeGreaterThan(0);
    // El más grande primero
    for (let i = 1; i < is.opex.lines.length; i++) {
      expect(is.opex.lines[i].amount).toBeLessThanOrEqual(is.opex.lines[i - 1].amount);
    }
  });

  it("filtra correctamente por período", () => {
    const is = generateIncomeStatement({
      sales: SALES, products: PRODUCTS,
      from: "2026-05-01", to: "2026-05-31", exchangeRate: 1000,
    });
    expect(is.income.revenue).toBe(99999);
  });
});

describe("generateBalanceSheet", () => {
  it("suma cash en distintas monedas convertido a ARS", () => {
    const bs = generateBalanceSheet({
      products: [], cashARS: 100000, cashUSD: 50, cashUSDT: 100, exchangeRate: 1000,
    });
    expect(bs.assets.current.cash).toBe(250000); // 100k + 50k + 100k
  });

  it("activo = cash + cuentas a cobrar + stock a costo", () => {
    const clients = [{ id: "c1", balance: -10000 }]; // me debe 10k
    const bs = generateBalanceSheet({
      products: PRODUCTS, clients, cashARS: 100000, exchangeRate: 1000,
    });
    // stock = 5×10 + 3×8 = 74 USD × 1000 = 74000
    expect(bs.assets.current.inventory).toBe(74000);
    expect(bs.assets.current.accountsReceivable).toBe(10000);
    expect(bs.assets.total).toBe(100000 + 10000 + 74000);
  });

  it("pasivo = créditos a clientes (balance positivo)", () => {
    const clients = [{ id: "c1", balance: 5000 }, { id: "c2", balance: -3000 }];
    const bs = generateBalanceSheet({ products: [], clients });
    expect(bs.liabilities.current.clientCreditsOwed).toBe(5000);
  });

  it("patrimonio = activo - pasivo", () => {
    const bs = generateBalanceSheet({
      products: [], clients: [{ balance: 5000 }], cashARS: 100000,
    });
    expect(bs.equity).toBe(100000 - 5000);
  });
});

describe("generateCashFlow", () => {
  it("inflows = ventas, outflows = compras verificadas + gastos", () => {
    const purchases = [
      { date: "2026-06-10", status: "verificado", totalUSDT: 100 },
      { date: "2026-06-15", status: "pendiente", totalUSDT: 9999 }, // no cuenta
    ];
    const cf = generateCashFlow({
      sales: SALES, expenses: EXPENSES, purchases,
      from: "2026-06-01", to: "2026-06-30", exchangeRate: 1000,
    });
    expect(cf.operating.inflows.salesCollections).toBe(35000);
    expect(cf.operating.outflows.toSuppliers).toBe(100000); // 100 × 1000
    expect(cf.operating.outflows.operatingExpenses).toBe(13000);
    expect(cf.netCashFlow).toBe(35000 - 100000 - 13000);
  });
});
