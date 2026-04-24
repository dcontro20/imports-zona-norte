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

// Clave diaria ISO (YYYY-MM-DD) — ideal para comparar/indexar por día.
// Nota: `new Date(d).toDateString()` también funciona como clave única por día
// pero es menos portable. Usar esta salvo que necesites el formato legible.
export const dayKey = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
};

// Clave mensual "YYYY-MM" respetando zona local.
export const monthKey = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};

// Formatea ISO como "DD/MM/YY HH:MM" (solo si tiene parte de hora).
// Fallback silencioso a formatDate si el string no tiene T.
export const formatDateTime = (iso) => {
  if (!iso) return "—";
  const s = String(iso);
  const datePart = formatDate(s);
  const timeMatch = s.match(/T(\d{2}:\d{2})/);
  return timeMatch ? `${datePart} ${timeMatch[1]}` : datePart;
};

// Guarda contra exchangeRate = 0 / undefined / null / NaN.
// Devuelve el rate numérico si es > 0, sino 0. Usado tanto en multiplicaciones
// (× rate → devuelve 0 "no puedo convertir") como en divisiones protegidas
// (usar siempre `safeRate(r) > 0 ? ars / r : 0` para evitar Infinity/NaN).
export const safeRate = (r) => {
  const n = Number(r);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
