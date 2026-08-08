// src/wholesale.js
//
// Margen del pedido MAYORISTA. Funciones PURAS.
//
// (F6 Pricing Engine, 2026-08-08): acá vivía el sistema de precios por tier
// A/B/C (resolveTierPrice, mínimos por tier, descuento por volumen aparte).
// Se RETIRÓ ENTERO: el precio mayorista lo deriva el motor
// (src/lib/pricingEngine.js) desde el costo, se publica como lista inmutable
// (src/lib/priceLists.js) y se cotiza por escalón de volumen del pedido
// (src/lib/cotizador.js). Un precio por categoría de cliente es exactamente
// lo que la política comercial descarta.

import { getProductCostUSDT } from "./finance.js";

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
