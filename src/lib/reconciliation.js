// src/lib/reconciliation.js
//
// Conciliación bancaria: cruza ventas con un CSV de movimientos de la cuenta
// (Mercado Pago / Lemon). Detecta diferencias.
//
// Parsea CSV simple: date,amount,description
// Match: misma fecha (±1 día) + monto exacto (tolerancia $1) + opcional ref
//
// Devuelve { matched, unmatched_bank, unmatched_sales, summary }
//
// Funciones PURAS.

const MS_PER_DAY = 86400000;

// Parsea CSV plano. Usa coma como separador, primera línea = headers.
// Headers esperados (case-insensitive): date|fecha, amount|monto, description|descripcion|detalle
export function parseBankCSV(csvText) {
  if (!csvText || typeof csvText !== "string") return [];
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const dateIdx = headers.findIndex(h => /date|fecha/.test(h));
  const amountIdx = headers.findIndex(h => /amount|monto|importe/.test(h));
  const descIdx = headers.findIndex(h => /desc|detalle|concepto/.test(h));
  if (dateIdx < 0 || amountIdx < 0) return [];

  return lines.slice(1).map((line, i) => {
    const parts = line.split(",").map(p => p.trim());
    return {
      id: `bank-${i}`,
      date: parts[dateIdx] || "",
      amount: Number((parts[amountIdx] || "0").replace(/[^\d.-]/g, "")) || 0,
      description: descIdx >= 0 ? parts[descIdx] : "",
    };
  }).filter(b => b.date && Number.isFinite(b.amount));
}

// Filtra ventas que se PAGARON con el método indicado (MP/Lemon/etc.)
// y devuelve sus totales en ARS con fecha normalizada.
function eligibleSalesForReconcile(sales, paymentMethod, exchangeRate) {
  const rate = Number(exchangeRate) || 1;
  return (sales || [])
    .filter(s => {
      if (!s || s.isDeleted) return false;
      // Ventas con ese método de pago (en payments[] o paymentMethod legacy)
      const payments = s.payments || (s.paymentMethod ? [{ method: s.paymentMethod, amount: s.total }] : []);
      return payments.some(p => (p.method || "").toLowerCase().includes(paymentMethod.toLowerCase()));
    })
    .map(s => {
      const payments = s.payments || [{ method: s.paymentMethod, amount: s.total }];
      const relevant = payments.filter(p => (p.method || "").toLowerCase().includes(paymentMethod.toLowerCase()));
      const amount = relevant.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const cur = s.currency || "ARS";
      const ars = (cur === "USD" || cur === "USDT") ? amount * rate : amount;
      return {
        id: s.id,
        date: (s.date || "").slice(0, 10),
        amount: Math.round(ars),
        clientName: s.clientName || "",
      };
    });
}

// === RECONCILIACIÓN ===
export function reconcileBank({
  bankMovements = [],
  sales = [],
  paymentMethod = "Mercado Pago",
  exchangeRate = 1,
  toleranceARS = 1,
  toleranceDays = 1,
} = {}) {
  const eligible = eligibleSalesForReconcile(sales, paymentMethod, exchangeRate);
  const matched = [];
  const unmatched_bank = [];
  const usedSaleIds = new Set();

  bankMovements.forEach(bm => {
    // Buscar venta que matchee (mismo día ±N, monto cercano, no ya usada)
    const bmDate = new Date(bm.date).getTime();
    const candidate = eligible.find(s => {
      if (usedSaleIds.has(s.id)) return false;
      if (Math.abs(s.amount - Math.abs(bm.amount)) > toleranceARS) return false;
      const sDate = new Date(s.date).getTime();
      if (!Number.isFinite(sDate) || !Number.isFinite(bmDate)) return false;
      const diffDays = Math.abs((bmDate - sDate) / MS_PER_DAY);
      return diffDays <= toleranceDays;
    });

    if (candidate) {
      usedSaleIds.add(candidate.id);
      matched.push({ bank: bm, sale: candidate });
    } else {
      unmatched_bank.push(bm);
    }
  });

  const unmatched_sales = eligible.filter(s => !usedSaleIds.has(s.id));

  const totalBank = bankMovements.reduce((s, b) => s + Math.abs(b.amount), 0);
  const totalSales = eligible.reduce((s, e) => s + e.amount, 0);
  const totalMatched = matched.reduce((s, m) => s + m.sale.amount, 0);

  return {
    matched,
    unmatched_bank,
    unmatched_sales,
    summary: {
      bankCount: bankMovements.length,
      salesCount: eligible.length,
      matchedCount: matched.length,
      matchRate: bankMovements.length > 0 ? Math.round((matched.length / bankMovements.length) * 100) : 0,
      totalBank: Math.round(totalBank),
      totalSales: Math.round(totalSales),
      totalMatched: Math.round(totalMatched),
      diffARS: Math.round(totalBank - totalSales),
    },
  };
}
