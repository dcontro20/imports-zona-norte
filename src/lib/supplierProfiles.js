// src/lib/supplierProfiles.js
//
// Funciones PURAS para gestión de perfiles de proveedores, diccionario de
// aliases aprendidos y historial de listas procesadas.
//
// Tres colecciones que viven en Firestore (a través de useFirebaseSync):
//
//   supplierProfiles: {
//     id, name, color, contactPhone, contactName, country, currency,
//     defaultLeadDays, defaultSupplierCommPercent, defaultPaseroPercent,
//     defaultEnvioCostARS, notes, createdAt, isDeleted
//   }
//
//   supplierAliases: {
//     id, supplierId, rawText (normalizado), productId,
//     createdAt, hits (uso acumulado)
//   }
//
//   supplierLists: {
//     id, supplierId, processedAt, fileName, mode (spreadsheet|pdf|text),
//     items: [{ brand, model, flavor, puffs, qty, priceUSD, raw, matchedProductId }],
//     totalItems, totalUSD, saved (true si terminó en Purchase),
//     purchaseId (si saved), isDeleted
//   }

import { normalize } from "./fuzzyMatch.js";

// Palette de colores para identificar proveedores visualmente.
// NO usamos navy (#1E2B4A) — ese es el color del brand.
// Elegidos para máxima discriminación entre proveedores y armonía con cream+navy.
export const SUPPLIER_COLORS = [
  "#0F6B5C", // teal profundo
  "#B07A1F", // gold/amber cálido
  "#5B3592", // purple
  "#1F5DB8", // blue medio
  "#C73E8F", // pink magenta
  "#B83232", // red ladrillo
  "#0EA5E9", // sky bright
  "#F97316", // orange brillante
  "#7C3AED", // violet
];

// Asigna color determinístico al perfil basado en su nombre. Mismo nombre =
// mismo color en todas las vistas — refuerza identidad visual.
// Si hay colores libres (no usados por otros perfiles), elige entre esos.
export function pickSupplierColor(name, takenColors = []) {
  if (!name) return SUPPLIER_COLORS[0];
  let hash = 0;
  for (const c of String(name)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const untaken = SUPPLIER_COLORS.filter(c => !takenColors.includes(c));
  const pool = untaken.length > 0 ? untaken : SUPPLIER_COLORS;
  return pool[hash % pool.length];
}

// ============================================================================
// PROFILES — CRUD
// ============================================================================

export const emptySupplierProfile = () => ({
  id: "",
  name: "",
  color: SUPPLIER_COLORS[0],
  contactPhone: "",
  contactName: "",
  country: "Paraguay",
  currency: "USD",
  defaultLeadDays: 30,
  defaultSupplierCommPercent: 10,
  defaultPaseroPercent: 5,
  defaultEnvioCostARS: 0,
  notes: "",
  createdAt: new Date().toISOString(),
  isDeleted: false,
});

// Crea un perfil desde un nombre. Asigna color automático.
export function buildSupplierProfile(name, existingProfiles = []) {
  const taken = existingProfiles.filter(p => !p.isDeleted).map(p => p.color);
  return {
    ...emptySupplierProfile(),
    name: String(name || "").trim(),
    color: pickSupplierColor(name, taken),
    createdAt: new Date().toISOString(),
  };
}

// Devuelve solo perfiles activos.
export function activeProfiles(profiles) {
  return (profiles || []).filter(p => p && !p.isDeleted);
}

// Busca un perfil por nombre exacto (case-insensitive, sin tildes).
export function findProfileByName(profiles, name) {
  if (!name) return null;
  const n = normalize(name);
  return (profiles || []).find(p => !p.isDeleted && normalize(p.name) === n) || null;
}

// ============================================================================
// STATS por perfil de proveedor (calculados desde purchases + lists)
// ============================================================================

// Computa stats agregados de un proveedor: total comprado, número de pedidos,
// lead time promedio real, último pedido. Usa los Purchases existentes
// (mismo path que Purchases.jsx).
export function computeSupplierStats(profile, purchases = [], lists = []) {
  if (!profile) return null;
  const sup = profile.name;
  const myPurchases = (purchases || []).filter(p =>
    !p.isDeleted && p.supplier && normalize(p.supplier) === normalize(sup)
  );
  const myLists = (lists || []).filter(l =>
    !l.isDeleted && (l.supplierId === profile.id || normalize(l.supplierName || "") === normalize(sup))
  );

  const totalUSDT = myPurchases.reduce((s, p) => s + (Number(p.totalUSDT) || 0), 0);
  const totalARS = myPurchases.reduce((s, p) => s + (Number(p.totalCostARS) || 0), 0);
  const totalUnits = myPurchases.reduce((s, p) => s + (Number(p.totalItems) || 0), 0);
  const orderCount = myPurchases.length;
  const verifiedCount = myPurchases.filter(p => p.status === "verificado").length;
  const pendingCount = myPurchases.filter(p => p.status !== "verificado").length;
  const reliability = orderCount > 0 ? Math.round((verifiedCount / orderCount) * 100) : null;

  // Lead time promedio: timestamp de pedido → de recibido
  const leadTimes = [];
  myPurchases.forEach(p => {
    const hist = p.statusHistory || [];
    const orderedAt = hist.find(h => h.status === "pedido")?.timestamp || p.date;
    const receivedAt = hist.find(h => h.status === "recibido")?.timestamp;
    if (orderedAt && receivedAt) {
      const days = (new Date(receivedAt) - new Date(orderedAt)) / 86400000;
      if (days >= 0 && days < 365) leadTimes.push(days);
    }
  });
  const avgLeadTime = leadTimes.length > 0
    ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length)
    : null;

  // Último pedido + último monto
  const sorted = [...myPurchases].sort((a, b) => new Date(b.date) - new Date(a.date));
  const lastPurchase = sorted[0] || null;
  const lastList = [...myLists].sort((a, b) =>
    new Date(b.processedAt) - new Date(a.processedAt)
  )[0] || null;

  // Spend por mes últimos 6 meses (sparkline)
  const now = new Date();
  const monthly = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { month: key, total: 0 };
  });
  myPurchases.forEach(p => {
    const d = new Date(p.date);
    if (!Number.isFinite(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const slot = monthly.find(m => m.month === key);
    if (slot) slot.total += Number(p.totalCostARS) || 0;
  });

  return {
    totalUSDT,
    totalARS,
    totalUnits,
    orderCount,
    pendingCount,
    verifiedCount,
    reliability,
    avgLeadTime,
    lastPurchase,
    lastList,
    listCount: myLists.length,
    monthly,
  };
}

// ============================================================================
// ALIASES — diccionario aprendido
// ============================================================================
//
// Cada vez que el usuario corrige manualmente un match (acepta un candidato
// alternativo) o agrega un producto nuevo, se guarda como alias para que la
// próxima vez que aparezca el mismo string, el sistema lo mapee directo
// con confianza alta sin pasar por fuzzy match.
//
// La key del alias es el texto del proveedor NORMALIZADO (lower, sin tildes,
// sin signos, espacios colapsados). Eso minimiza falsos negativos por
// variaciones de formato.

// Genera la key normalizada que se usa como índice del alias.
export function aliasKey(rawText, supplierId = null) {
  const n = normalize(rawText || "");
  return supplierId ? `${supplierId}::${n}` : n;
}

// Crea un nuevo alias en memoria. NO escribe a Firestore — eso lo hace el setter.
export function buildAlias(supplierId, rawText, productId) {
  return {
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    supplierId: supplierId || null,
    rawText: String(rawText || "").trim(),
    rawKey: normalize(rawText || ""),
    productId,
    createdAt: new Date().toISOString(),
    hits: 1,
  };
}

// Busca un alias para un raw text dado. Si supplierId está presente, prioriza
// aliases de ese supplier; si no encuentra, hace fallback a aliases globales.
export function findAlias(aliases, rawText, supplierId = null) {
  if (!rawText || !Array.isArray(aliases)) return null;
  const key = normalize(rawText);
  if (!key) return null;
  if (supplierId) {
    const sup = aliases.find(a => !a.isDeleted && a.supplierId === supplierId && a.rawKey === key);
    if (sup) return sup;
  }
  return aliases.find(a => !a.isDeleted && !a.supplierId && a.rawKey === key)
    || aliases.find(a => !a.isDeleted && a.rawKey === key)
    || null;
}

// Inserta o actualiza un alias en la lista. Si ya existe el mismo
// (rawKey + supplierId) y apunta al mismo producto, incrementa hits.
// Si apunta a otro producto, reemplaza (el más reciente gana).
export function upsertAlias(aliases, alias) {
  if (!alias || !alias.rawKey) return aliases || [];
  const list = aliases || [];
  const existingIdx = list.findIndex(a =>
    !a.isDeleted &&
    a.rawKey === alias.rawKey &&
    (a.supplierId || null) === (alias.supplierId || null)
  );
  if (existingIdx >= 0) {
    const existing = list[existingIdx];
    const updated = {
      ...existing,
      productId: alias.productId,
      hits: (existing.hits || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    const next = [...list];
    next[existingIdx] = updated;
    return next;
  }
  return [alias, ...list];
}

// ============================================================================
// LISTAS — historial
// ============================================================================

// Construye una entrada de lista a partir de los items parseados.
// items: array de items enriquecidos (con bestMatch)
export function buildListEntry(supplierId, supplierName, items, mode, fileName = "") {
  const totalItems = items.length;
  const totalUSD = items.reduce((s, it) => s + ((Number(it.qty) || 0) * (Number(it.priceUSD) || 0)), 0);
  const compactItems = items.map(it => ({
    brand: it.brand || (it.bestMatch?.product?.brand) || null,
    model: it.model || (it.bestMatch?.product?.model) || null,
    flavor: it.flavor || (it.bestMatch?.product?.flavor) || null,
    puffs: it.puffs || (it.bestMatch?.product?.puffs) || null,
    qty: Number(it.qty) || 0,
    priceUSD: Number(it.priceUSD) || 0,
    raw: it.raw || "",
    matchedProductId: it.bestMatch?.product?.id || null,
    confidence: it.confidence || "low",
  }));
  return {
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    supplierId: supplierId || null,
    supplierName: supplierName || "",
    processedAt: new Date().toISOString(),
    fileName: fileName || "",
    mode: mode || "spreadsheet",
    items: compactItems,
    totalItems,
    totalUSD,
    saved: false,
    purchaseId: null,
    isDeleted: false,
  };
}

// Marca una lista como "guardada" (porque terminó en un Purchase).
export function markListSaved(lists, listId, purchaseId) {
  return (lists || []).map(l =>
    l.id === listId ? { ...l, saved: true, purchaseId } : l
  );
}

// ============================================================================
// PRICE HISTORY (lecturas derivadas)
// ============================================================================

// Para un producto y proveedor dados, devuelve el historial de precios USD
// que ese proveedor te ofreció a lo largo del tiempo. Sirve para detectar
// cambios de precio.
export function priceHistoryForProductInSupplier(lists, supplierId, productId) {
  if (!productId) return [];
  return (lists || [])
    .filter(l => !l.isDeleted && l.supplierId === supplierId)
    .flatMap(l => (l.items || [])
      .filter(it => it.matchedProductId === productId && it.priceUSD > 0)
      .map(it => ({ date: l.processedAt, priceUSD: it.priceUSD })))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Detecta si el precio en la lista actual cambió significativamente vs el
// histórico de este proveedor para el mismo producto.
//   prevPrice: el más reciente histórico (excluyendo el de la lista actual)
//   currentPrice: el de la lista actual
//   changePct: % de cambio (positivo = subió)
export function detectPriceChange(history, currentPrice, threshold = 5) {
  if (!history || history.length === 0 || !currentPrice) return null;
  const prev = history[history.length - 1];
  if (!prev || !prev.priceUSD) return null;
  const changePct = ((currentPrice - prev.priceUSD) / prev.priceUSD) * 100;
  if (Math.abs(changePct) < threshold) return null;
  return {
    prevPrice: prev.priceUSD,
    currentPrice,
    changePct: Math.round(changePct * 10) / 10,
    direction: changePct > 0 ? "up" : "down",
    prevDate: prev.date,
  };
}
