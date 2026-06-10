import { describe, it, expect } from "vitest";
import { generateFiscalReportCSV } from "./fiscalReport.js";

const PRODUCTS = [{ id: "p1", priceUSD: 20, costUSDT: 10 }];
const SALES = [
  { date: "2026-06-05", total: 20000, currency: "ARS", clientName: "Juan", channel: "WhatsApp",
    paymentMethod: "Mercado Pago", items: [{ productId: "p1", qty: 1, priceUSD: 20 }] },
  { date: "2026-06-10", total: 15, currency: "USD", exchangeRate: 1500, clientName: "Pedro",
    items: [{ productId: "p1", qty: 1 }] },
];
const EXPENSES = [{ date: "2026-06-03", category: "Envío", amountARS: 5000 }];

describe("generateFiscalReportCSV", () => {
  it("incluye header con nombre del negocio y período", () => {
    const csv = generateFiscalReportCSV({
      sales: SALES, expenses: EXPENSES, products: PRODUCTS,
      from: "2026-06-01", to: "2026-06-30", exchangeRate: 1000,
    });
    expect(csv).toContain("Reporte Fiscal IZN");
    expect(csv).toContain("2026-06-01");
    expect(csv).toContain("2026-06-30");
  });

  it("incluye sección RESUMEN con ingresos y neto", () => {
    const csv = generateFiscalReportCSV({
      sales: SALES, expenses: EXPENSES, products: PRODUCTS,
      from: "2026-06-01", to: "2026-06-30", exchangeRate: 1000,
    });
    expect(csv).toContain("RESUMEN");
    expect(csv).toContain("Ingresos por ventas");
    expect(csv).toContain("MARGEN BRUTO");
    expect(csv).toContain("RESULTADO NETO");
  });

  it("incluye listado de ventas si includeSalesDetail=true", () => {
    const csv = generateFiscalReportCSV({
      sales: SALES, expenses: EXPENSES, products: PRODUCTS,
      from: "2026-06-01", to: "2026-06-30", exchangeRate: 1000,
      includeSalesDetail: true,
    });
    expect(csv).toContain("LISTADO COMPLETO DE VENTAS");
    expect(csv).toContain("Juan");
    expect(csv).toContain("Pedro");
  });

  it("omite listado de ventas si includeSalesDetail=false", () => {
    const csv = generateFiscalReportCSV({
      sales: SALES, expenses: EXPENSES, products: PRODUCTS,
      from: "2026-06-01", to: "2026-06-30", exchangeRate: 1000,
      includeSalesDetail: false,
    });
    expect(csv).not.toContain("LISTADO COMPLETO");
  });

  it("escapa correctamente campos con comas", () => {
    const csv = generateFiscalReportCSV({
      sales: [
        { date: "2026-06-05", total: 1000, currency: "ARS", clientName: "Juan, Pedro y Cía", items: [] },
      ],
      from: "2026-06-01", to: "2026-06-30", exchangeRate: 1000,
    });
    expect(csv).toContain('"Juan, Pedro y Cía"');
  });
});
