import { CURRENCIES } from "./constants.js";
import { saveToFirestore } from "./firebase.js";

export const loadData = (key, fallback) => {
  try {
    const d = localStorage.getItem(`vapestock_${key}`);
    return d ? JSON.parse(d) : fallback;
  } catch { return fallback; }
};

export const saveData = (key, data) => {
  try { localStorage.setItem(`vapestock_${key}`, JSON.stringify(data)); } catch {}
  saveToFirestore(key, data);
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const formatDate = (d) => new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
export const formatMoney = (n, cur = "ARS") => `${CURRENCIES[cur] || "$"}${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
