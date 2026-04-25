// Constantes compartidas por CashBox y sus sub-componentes.
// Centralizadas para evitar duplicación y permitir split en múltiples archivos.

import { T } from "../../theme.js";

export const INITIAL_BALANCES = {
  lemonPesos: 273646.62,
  lemonUSDT: 40.12,
  mpDiego: 0,
  mpGustavo: 0,
  usdCash: 0,
  pesosCash: 120000,
};

export const ACCOUNTS = [
  { id: "mpDiego",    label: "MP Diego",     short: "MP Diego",   currency: "ARS",  icon: "💜", accent: "#8B5CF6", sub: "Mercado Pago" },
  { id: "mpGustavo",  label: "MP Gustavo",   short: "MP Gustavo", currency: "ARS",  icon: "💙", accent: "#2383E2", sub: "Mercado Pago" },
  { id: "lemonPesos", label: "Lemon Pesos",  short: "Lemon $",    currency: "ARS",  icon: "🍋", accent: "#CB912F", sub: "Billetera Lemon" },
  { id: "lemonUSDT",  label: "Lemon USDT",   short: "Lemon ₮",    currency: "USDT", icon: "🪙", accent: "#16A34A", sub: "Crypto" },
  { id: "usdCash",    label: "USD Cash",     short: "USD",        currency: "USD",  icon: "💵", accent: "#0F7B6C", sub: "Efectivo físico" },
  { id: "pesosCash",  label: "Pesos Cash",   short: "Cash $",     currency: "ARS",  icon: "💰", accent: "#06B6D4", sub: "Efectivo físico" },
];

export const ACCOUNT_BY_ID = Object.fromEntries(ACCOUNTS.map(a => [a.id, a]));

// Movement types: 5 tipos con íconos
export const MOVEMENT_TYPES = [
  { key: "income",      label: "Ingreso",          desc: "Entra plata (no viene de una venta)",      icon: "⬇️", color: T.green,  requires: ["to", "amount"] },
  { key: "expense",     label: "Egreso",           desc: "Pago, retiro personal, gasto ocasional",   icon: "⬆️", color: T.red,    requires: ["from", "amount"] },
  { key: "transfer",    label: "Transferencia",    desc: "De una cuenta del negocio a otra",         icon: "🔁", color: T.blue,   requires: ["from", "to", "amount"] },
  { key: "crypto_buy",  label: "Compra crypto",    desc: "Pesos → USDT (típicamente Lemon → Lemon)", icon: "🪙", color: T.amber,  requires: ["from", "to", "amount", "amountUSDT"] },
  { key: "crypto_sell", label: "Venta crypto",     desc: "USDT → pesos",                             icon: "💸", color: T.purple, requires: ["from", "to", "amount", "amountUSDT"] },
];

export const TYPE_BY_KEY = Object.fromEntries(MOVEMENT_TYPES.map(t => [t.key, t]));

// Legacy backward-compat (deposit/withdrawal → income/expense)
export const normalizeType = (t) => ({ deposit: "income", withdrawal: "expense" })[t] || t;

// Estilos reutilizables para botones ghost/primary del módulo Caja.
// Usados tanto en CashBox.jsx como en MovementForm.jsx. Antes vivían
// solo en CashBox y al extraer MovementForm quedaron referenciados
// sin importar — causaba ReferenceError al abrir el form.
export const ghostBtn = () => ({
  padding: "8px 14px", borderRadius: 10, border: `1px solid ${T.border}`,
  background: T.card, color: T.textSub, fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
});

export const primaryBtn = () => ({
  padding: "10px 20px", borderRadius: 10, border: "none",
  background: T.primary, color: "#fff", fontSize: 14, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit", boxShadow: T.shadowSm,
});

// Umbral de "egreso grande" (ARS) que pide confirmación extra antes de guardar
export const LARGE_EXPENSE_THRESHOLD_ARS = 200000;

// Ventana de detección de duplicados en movimientos de caja (ms)
export const DUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutos

// Debounce del botón Registrar después de tocar para evitar doble submit
export const SUBMIT_DEBOUNCE_MS = 3000;

// Traduce un método de pago (Sales.jsx) al accountId de caja correspondiente.
// Devuelve "" si el método es desconocido — el caller debe guard contra eso.
export function payMethodToAccountId(method, mpAccount) {
  if (method === "Mercado Pago") return mpAccount === "MP Gustavo" ? "mpGustavo" : "mpDiego";
  if (method === "Lemon") return "lemonPesos";
  if (method === "USDT") return "lemonUSDT";
  if (method === "USD Cash") return "usdCash";
  if (method === "Pesos Cash") return "pesosCash";
  return "";
}

// Matchers: qué payment method corresponde a qué cuenta.
// Usado por calcAccountBalance para sumar la porción de cada venta a la cuenta.
export const ACCOUNT_METHOD_MAP = {
  mpDiego: (p) => p.method === "Mercado Pago" && p.mpAccount === "MP Diego",
  mpGustavo: (p) => p.method === "Mercado Pago" && p.mpAccount === "MP Gustavo",
  lemonPesos: (p) => p.method === "Lemon",
  lemonUSDT: (p) => p.method === "USDT",
  usdCash: (p) => p.method === "USD Cash",
  pesosCash: (p) => p.method === "Pesos Cash",
};
