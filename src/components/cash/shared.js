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
