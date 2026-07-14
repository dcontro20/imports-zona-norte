// src/wholesale.js
//
// Motor de pricing MAYORISTA (pivote a venta mayorista). Funciones PURAS.
//
// MODELO (acordado con Diego):
//   - Precio base del cliente mayorista = su LISTA POR TIER (A/B/C), guardada en
//     product.priceByChannel.mayorista_a/b/c. Cada tier es su propia lista, NO un
//     "% sobre minorista".
//   - Descuento por VOLUMEN = complemento OPCIONAL escalonado, DESACOPLADO del tier
//     del cliente. Breakpoints parametrizables. Diego decide si lo aplica encima
//     del precio de tier (default: no se aplica salvo que se pida).
//
// Reusa el motor de pricing existente (resolveChannelPrice) y el costeo real
// (getProductCostUSDT) para no duplicar lógica.

import { resolveChannelPrice } from "./pricing.js";
import { getProductCostUSDT } from "./finance.js";

// ---------------------------------------------------------------------------
// PRECIO POR TIER
// ---------------------------------------------------------------------------

// Precio unitario del producto para un tier mayorista (A/B/C).
// Lee product.priceByChannel.mayorista_{a|b|c} vía resolveChannelPrice (que ya
// tiene los aliases). Si el tier no tiene override, cae al precio base del producto.
export function resolveTierPrice(product, tier, currency = "USD") {
  if (!product) return 0;
  const t = String(tier || "").toLowerCase();
  if (t !== "a" && t !== "b" && t !== "c") {
    // Sin tier válido → precio base (minorista) como fallback seguro.
    return currency === "ARS" ? Number(product.priceARS) || 0 : Number(product.priceUSD) || 0;
  }
  return resolveChannelPrice(product, `mayorista_${t}`, currency);
}

// ¿El producto tiene lista de precio configurada para ese tier?
export function hasTierPrice(product, tier) {
  if (!product) return false;
  const t = String(tier || "").toLowerCase();
  const v = product.priceByChannel?.[`mayorista_${t}`];
  return v != null && Number(v) > 0;
}

// ---------------------------------------------------------------------------
// MÍNIMO DE COMPRA POR TIER (parametrizable)
// ---------------------------------------------------------------------------

// Default sin mínimos (opt-in). Diego los sube cuando quiera exigir volumen.
export const DEFAULT_TIER_MINIMUMS = {
  A: { minUnits: 0, minARS: 0 },
  B: { minUnits: 0, minARS: 0 },
  C: { minUnits: 0, minARS: 0 },
};

// Devuelve { minUnits, minARS } del tier. Config parametrizable.
export function minOrderForTier(tier, config = DEFAULT_TIER_MINIMUMS) {
  const t = String(tier || "").toUpperCase();
  return (config && config[t]) || { minUnits: 0, minARS: 0 };
}

// Valida un pedido contra el mínimo del tier. Devuelve { ok, reasons:[] }.
export function validateOrderMinimum({ tier, totalUnits = 0, totalARS = 0 }, config = DEFAULT_TIER_MINIMUMS) {
  const min = minOrderForTier(tier, config);
  const reasons = [];
  if (min.minUnits > 0 && totalUnits < min.minUnits) {
    reasons.push(`Mínimo ${min.minUnits}u para tier ${String(tier).toUpperCase()} (llevás ${totalUnits}u)`);
  }
  if (min.minARS > 0 && totalARS < min.minARS) {
    reasons.push(`Mínimo $${min.minARS.toLocaleString("es-AR")} para tier ${String(tier).toUpperCase()}`);
  }
  return { ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// DESCUENTO POR VOLUMEN (complemento OPCIONAL, desacoplado del tier del cliente)
// ---------------------------------------------------------------------------

// Escalera sugerida de arranque (tunable). Se aplica SOBRE el precio de tier y
// SÓLO si Diego elige aplicarla. Cantidades pensadas para volumen mayorista.
export const DEFAULT_VOLUME_BREAKS = [
  { minUnits: 0, pct: 0, label: "—" },
  { minUnits: 24, pct: 3, label: "24u+" },
  { minUnits: 60, pct: 6, label: "60u+" },
  { minUnits: 120, pct: 10, label: "120u+" },
];

// Devuelve el break más alto que cumple el pedido: { pct, label, minUnits }.
export function volumeDiscount(totalUnits, breaks = DEFAULT_VOLUME_BREAKS) {
  const u = Math.max(0, Number(totalUnits) || 0);
  const sorted = [...(breaks || [])].sort((a, b) => (a.minUnits || 0) - (b.minUnits || 0));
  let applied = { pct: 0, label: "—", minUnits: 0 };
  for (const b of sorted) {
    if (u >= (b.minUnits || 0)) applied = { pct: Number(b.pct) || 0, label: b.label || `${b.minUnits}u+`, minUnits: b.minUnits || 0 };
  }
  return applied;
}

// Aplica un % de descuento a un precio (helper chico, redondeo a 2 decimales).
export function applyPct(priceUSD, pct) {
  const p = Number(priceUSD) || 0;
  const d = Math.max(0, Math.min(100, Number(pct) || 0));
  return Math.round(p * (1 - d / 100) * 100) / 100;
}

// ---------------------------------------------------------------------------
// MARGEN DEL PEDIDO MAYORISTA
// ---------------------------------------------------------------------------

// Calcula el margen de un pedido mayorista.
//   lines: [{ product, qty, unitPriceUSD }]  (unitPriceUSD = precio final por unidad, ya con tier/volumen)
// Devuelve { perLine:[{...}], totalRevenueUSD, totalCostUSD, totalMarginUSD, marginPct, totalUnits }
export function orderMargin({ lines = [] } = {}) {
  let totalRevenueUSD = 0;
  let totalCostUSD = 0;
  let totalUnits = 0;

  const perLine = (lines || []).map(line => {
    const qty = Math.max(0, Number(line.qty) || 0);
    const unit = Math.max(0, Number(line.unitPriceUSD) || 0);
    const unitCost = getProductCostUSDT(line.product);
    const revenueUSD = unit * qty;
    const costUSD = unitCost * qty;
    const marginUSD = revenueUSD - costUSD;
    const marginPct = revenueUSD > 0 ? (marginUSD / revenueUSD) * 100 : 0;
    totalRevenueUSD += revenueUSD;
    totalCostUSD += costUSD;
    totalUnits += qty;
    return {
      product: line.product,
      qty,
      unitPriceUSD: unit,
      unitCostUSD: unitCost,
      revenueUSD: Math.round(revenueUSD * 100) / 100,
      costUSD: Math.round(costUSD * 100) / 100,
      marginUSD: Math.round(marginUSD * 100) / 100,
      marginPct: Math.round(marginPct * 10) / 10,
    };
  });

  const totalMarginUSD = totalRevenueUSD - totalCostUSD;
  return {
    perLine,
    totalUnits,
    totalRevenueUSD: Math.round(totalRevenueUSD * 100) / 100,
    totalCostUSD: Math.round(totalCostUSD * 100) / 100,
    totalMarginUSD: Math.round(totalMarginUSD * 100) / 100,
    marginPct: totalRevenueUSD > 0 ? Math.round((totalMarginUSD / totalRevenueUSD) * 1000) / 10 : 0,
  };
}
