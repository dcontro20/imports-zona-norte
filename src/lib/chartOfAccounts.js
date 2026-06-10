// src/lib/chartOfAccounts.js
//
// Plan de cuentas estandarizado tipo PCGA (Principios Contables Generalmente
// Aceptados). Sirve para que cualquier contador externo entienda los EEFF.
//
// Estructura jerárquica:
//   1. ACTIVO
//      1.1 Activo corriente (caja, cuentas por cobrar, stock)
//      1.2 Activo no corriente (equipos — si aplica)
//   2. PASIVO
//      2.1 Pasivo corriente (deudas a proveedores, créditos a clientes)
//   3. PATRIMONIO
//      3.1 Capital + resultados acumulados + del ejercicio
//   4. INGRESOS
//      4.1 Por ventas (revenue)
//   5. EGRESOS
//      5.1 Costo de mercadería vendida (COGS)
//      5.2 Gastos operativos (OpEx) — clasificados por subcategoría
//      5.3 Mermas (consumo propio, garantías, regalos)
//
// Función pura mapCategoryToAccount() para clasificar gastos libres en
// cuentas estándar.

export const ACCOUNTS = {
  // ACTIVO
  "1.1.01": { code: "1.1.01", name: "Caja Pesos", type: "asset", group: "1.1" },
  "1.1.02": { code: "1.1.02", name: "Mercado Pago", type: "asset", group: "1.1" },
  "1.1.03": { code: "1.1.03", name: "Lemon (Pesos)", type: "asset", group: "1.1" },
  "1.1.04": { code: "1.1.04", name: "Lemon (USDT)", type: "asset", group: "1.1" },
  "1.1.05": { code: "1.1.05", name: "Caja USD", type: "asset", group: "1.1" },
  "1.1.10": { code: "1.1.10", name: "Cuentas a cobrar (clientes)", type: "asset", group: "1.1" },
  "1.1.20": { code: "1.1.20", name: "Bienes de cambio (stock)", type: "asset", group: "1.1" },

  // PASIVO
  "2.1.01": { code: "2.1.01", name: "Cuentas a pagar (proveedores)", type: "liability", group: "2.1" },
  "2.1.05": { code: "2.1.05", name: "Créditos a clientes (vuelto)", type: "liability", group: "2.1" },

  // PATRIMONIO
  "3.1.01": { code: "3.1.01", name: "Capital", type: "equity", group: "3.1" },
  "3.1.02": { code: "3.1.02", name: "Resultados acumulados", type: "equity", group: "3.1" },
  "3.1.03": { code: "3.1.03", name: "Resultado del ejercicio", type: "equity", group: "3.1" },

  // INGRESOS (revenue)
  "4.1.01": { code: "4.1.01", name: "Ventas", type: "income", group: "4.1" },
  "4.1.02": { code: "4.1.02", name: "Ventas mayoristas", type: "income", group: "4.1" },

  // EGRESOS — COGS
  "5.1.01": { code: "5.1.01", name: "Costo de mercadería vendida", type: "cogs", group: "5.1" },

  // EGRESOS — OpEx por categoría
  "5.2.01": { code: "5.2.01", name: "Logística (envíos, fletes)", type: "opex", group: "5.2" },
  "5.2.02": { code: "5.2.02", name: "Marketing y publicidad", type: "opex", group: "5.2" },
  "5.2.03": { code: "5.2.03", name: "Servicios (internet, hosting, etc.)", type: "opex", group: "5.2" },
  "5.2.04": { code: "5.2.04", name: "Honorarios profesionales", type: "opex", group: "5.2" },
  "5.2.05": { code: "5.2.05", name: "Insumos / packaging", type: "opex", group: "5.2" },
  "5.2.06": { code: "5.2.06", name: "Movilidad / combustible", type: "opex", group: "5.2" },
  "5.2.07": { code: "5.2.07", name: "Comisiones (MP, pasarelas)", type: "opex", group: "5.2" },
  "5.2.99": { code: "5.2.99", name: "Otros gastos operativos", type: "opex", group: "5.2" },

  // EGRESOS — Mermas
  "5.3.01": { code: "5.3.01", name: "Mermas — consumo propio", type: "shrinkage", group: "5.3" },
  "5.3.02": { code: "5.3.02", name: "Mermas — garantías y devoluciones", type: "shrinkage", group: "5.3" },
  "5.3.03": { code: "5.3.03", name: "Mermas — regalos / cortesías", type: "shrinkage", group: "5.3" },
};

// Mapa categoría libre → cuenta estandarizada. Usado para clasificar
// gastos ya cargados con sus textos libres.
const CATEGORY_MAP = {
  "envío": "5.2.01", "envios": "5.2.01", "flete": "5.2.01", "logística": "5.2.01", "logistica": "5.2.01",
  "marketing": "5.2.02", "publicidad": "5.2.02", "anuncio": "5.2.02", "ads": "5.2.02",
  "internet": "5.2.03", "hosting": "5.2.03", "servicio": "5.2.03", "vercel": "5.2.03", "firebase": "5.2.03",
  "honorario": "5.2.04", "contador": "5.2.04", "abogado": "5.2.04",
  "insumo": "5.2.05", "packaging": "5.2.05", "bolsa": "5.2.05",
  "movilidad": "5.2.06", "combustible": "5.2.06", "uber": "5.2.06", "taxi": "5.2.06", "nafta": "5.2.06",
  "comisión": "5.2.07", "comision": "5.2.07", "fee": "5.2.07",
  // Mermas explícitas: detectadas por type en withdrawals (no por categoría)
};

// Categoriza un gasto libre. Devuelve el código de cuenta más cercano.
export function categorizeExpense(expense) {
  if (!expense) return "5.2.99";
  const haystack = `${expense.category || ""} ${expense.description || ""}`.toLowerCase();
  for (const [keyword, code] of Object.entries(CATEGORY_MAP)) {
    if (haystack.includes(keyword)) return code;
  }
  return "5.2.99"; // otros
}

// Devuelve la cuenta a la que mapea una merma según su withdrawType
export function withdrawalAccount(withdrawal) {
  const t = (withdrawal?.withdrawType || "").toLowerCase();
  if (t.includes("garant")) return "5.3.02";
  if (t.includes("regal") || t.includes("cortes")) return "5.3.03";
  return "5.3.01"; // consumo propio (default)
}

// Agrupa todas las transacciones del período en cuentas y devuelve el balance.
// Útil para generar Estado de Resultados / Balance.
export function aggregateByAccount({ sales = [], expenses = [], withdrawals = [], exchangeRate = 1 } = {}) {
  const totals = {};
  const add = (code, amount) => {
    totals[code] = (totals[code] || 0) + amount;
  };

  // Ventas → 4.1.01
  (sales || []).forEach(s => {
    if (!s || s.isDeleted) return;
    const t = Number(s.total) || 0;
    const cur = s.currency || "ARS";
    const rate = Number(s.exchangeRate || exchangeRate) || 1;
    const ars = (cur === "USD" || cur === "USDT") ? t * rate : t;
    add("4.1.01", ars);
  });

  // Gastos → según categoría
  (expenses || []).forEach(e => {
    if (!e || e.isDeleted) return;
    const code = categorizeExpense(e);
    add(code, Number(e.amountARS) || 0);
  });

  // Mermas → según tipo (valor estimado en ARS)
  (withdrawals || []).forEach(w => {
    if (!w || w.isDeleted) return;
    const code = withdrawalAccount(w);
    add(code, Number(w.costEstimateARS) || 0);
  });

  return totals;
}
