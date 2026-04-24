import { CURRENCIES } from "./constants.js";
export const loadData = (key, fallback) => {
  try {
    const d = localStorage.getItem(`vapestock_${key}`);
    return d ? JSON.parse(d) : fallback;
  } catch { return fallback; }
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const formatDate = (d) => {
  if (!d) return "—";
  // Fix: date-only strings "YYYY-MM-DD" are parsed as UTC midnight,
  // which shifts back 1 day in Argentina (UTC-3). Append T12:00 to force local parse.
  const str = String(d);
  const date = str.length === 10 ? new Date(str + "T12:00:00") : new Date(str);
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};
export const formatMoney = (n, cur = "ARS") => `${CURRENCIES[cur] || "$"}${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// Guarda contra exchangeRate = 0 / undefined / null / NaN.
// Devuelve el rate numérico si es > 0, sino 0. Usado tanto en multiplicaciones
// (× rate → devuelve 0 "no puedo convertir") como en divisiones protegidas
// (usar siempre `safeRate(r) > 0 ? ars / r : 0` para evitar Infinity/NaN).
export const safeRate = (r) => {
  const n = Number(r);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
