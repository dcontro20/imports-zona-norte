// src/lib/fiscalReport.js
//
// Reporte fiscal mensual exportable. Genera un CSV con resumen consolidado
// del período (mes/trimestre/año) en formato amigable para contador externo.
//
// Estructura:
//   Sección 1: Resumen ejecutivo (revenue, COGS, gastos, neto)
//   Sección 2: Detalle de gastos por cuenta
//   Sección 3: Detalle de mermas por tipo
//   Sección 4: Listado completo de ventas (opcional)
//
// Funciones PURAS.

import { generateIncomeStatement } from "./financialStatements.js";
import { ACCOUNTS } from "./chartOfAccounts.js";
import { safeRate } from "../helpers.js";

function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells) {
  return cells.map(csvEscape).join(",");
}

// Genera el reporte completo como string CSV.
export function generateFiscalReportCSV({
  sales = [], expenses = [], withdrawals = [], products = [],
  from, to, exchangeRate = 1,
  includeSalesDetail = true,
} = {}) {
  const stmt = generateIncomeStatement({ sales, expenses, withdrawals, products, from, to, exchangeRate });
  const lines = [];

  // === HEADER ===
  lines.push(csvRow(["Reporte Fiscal IZN — Imports Zona Norte"]));
  lines.push(csvRow([`Período: ${from || "inicio"} a ${to || "hoy"}`]));
  lines.push(csvRow([`Generado: ${new Date().toISOString().slice(0, 10)}`]));
  lines.push("");

  // === SECCIÓN 1: RESUMEN ===
  lines.push(csvRow(["=== RESUMEN ==="]));
  lines.push(csvRow(["Concepto", "Monto ARS"]));
  lines.push(csvRow(["Ingresos por ventas", stmt.income.revenue]));
  lines.push(csvRow(["Costo de mercadería vendida", -stmt.cogs]));
  lines.push(csvRow(["MARGEN BRUTO", stmt.grossProfit]));
  lines.push(csvRow([`Margen bruto %`, `${stmt.grossMarginPct}%`]));
  lines.push(csvRow(["Gastos operativos", -stmt.opex.total]));
  lines.push(csvRow(["Mermas", -stmt.shrinkage.total]));
  lines.push(csvRow(["RESULTADO NETO", stmt.netResult]));
  lines.push(csvRow([`Margen neto %`, `${stmt.netMarginPct}%`]));
  lines.push("");

  // === SECCIÓN 2: GASTOS DETALLADOS ===
  lines.push(csvRow(["=== DETALLE DE GASTOS POR CUENTA ==="]));
  lines.push(csvRow(["Cuenta", "Nombre", "Monto ARS"]));
  stmt.opex.lines.forEach(l => {
    lines.push(csvRow([l.code, l.name, l.amount]));
  });
  lines.push("");

  // === SECCIÓN 3: MERMAS ===
  lines.push(csvRow(["=== MERMAS POR TIPO ==="]));
  lines.push(csvRow(["Cuenta", "Nombre", "Monto ARS"]));
  stmt.shrinkage.lines.forEach(l => {
    lines.push(csvRow([l.code, l.name, l.amount]));
  });
  lines.push("");

  // === SECCIÓN 4: LISTADO DE VENTAS (opcional) ===
  if (includeSalesDetail) {
    lines.push(csvRow(["=== LISTADO COMPLETO DE VENTAS ==="]));
    lines.push(csvRow(["Fecha", "Cliente", "Canal", "Método", "Moneda", "Total", "Total ARS"]));
    const periodSales = (sales || []).filter(s => {
      if (!s || s.isDeleted || !s.date) return false;
      const d = s.date.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    }).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    periodSales.forEach(s => {
      const cur = s.currency || "ARS";
      const total = Number(s.total) || 0;
      const rate = safeRate(s.exchangeRate || exchangeRate);
      const ars = (cur === "USD" || cur === "USDT") ? total * rate : total;
      lines.push(csvRow([
        s.date?.slice(0, 10) || "",
        s.clientName || "Sin cliente",
        s.channel || "",
        s.paymentMethod || (s.payments?.[0]?.method) || "",
        cur,
        total,
        Math.round(ars),
      ]));
    });
    lines.push("");
  }

  return lines.join("\n");
}

// Genera y triggea descarga del CSV en el browser.
export function downloadFiscalReport(opts = {}) {
  if (typeof document === "undefined") return null;
  const csv = generateFiscalReportCSV(opts);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const periodLabel = `${opts.from || "inicio"}_a_${opts.to || "hoy"}`.replace(/[^\d\-_a]/g, "");
  a.download = `IZN_ReporteFiscal_${periodLabel}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return csv;
}
