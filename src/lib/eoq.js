// src/lib/eoq.js
//
// EOQ (Economic Order Quantity) — fórmula clásica de gestión de inventario
// para calcular la cantidad óptima a comprar de cada SKU, balanceando:
//   - Costo de pedir (transporte + tiempo)
//   - Costo de mantener stock (capital inmovilizado + obsolescencia)
//
// Fórmula: EOQ = sqrt(2 × D × S / H)
//   D = demanda anual (unidades/año)
//   S = costo de hacer un pedido (en $)
//   H = costo de mantener una unidad en stock por año (en $)
//
// Adaptado al contexto IZN:
//   S ≈ costo prorrateado del envío Paraguay por SKU (default $20 USD/SKU)
//   H ≈ 30% del costo unitario por año (financiero + obsolescencia)
//
// También calcula reorder point (cuándo pedir) = velocidad × lead time + safety stock
//
// Funciones PURAS.

import { getProductCostUSDT } from "../finance.js";

const DEFAULT_ORDER_COST_USD = 20;   // costo prorrateado por SKU pedido
const DEFAULT_HOLDING_RATE = 0.30;   // 30% anual del costo (capital + storage + obsolescencia)
const DEFAULT_LEAD_TIME_DAYS = 30;   // promedio típico Paraguay → Argentina
const DEFAULT_SAFETY_STOCK_DAYS = 7; // colchón

// Calcula EOQ + reorder point para un producto.
export function calcEOQForProduct(product, stats = {}, options = {}) {
  const {
    orderCostUSD = DEFAULT_ORDER_COST_USD,
    holdingRate = DEFAULT_HOLDING_RATE,
    leadTimeDays = DEFAULT_LEAD_TIME_DAYS,
    safetyStockDays = DEFAULT_SAFETY_STOCK_DAYS,
  } = options;

  if (!product) return null;

  const velocity = Number(stats?.velocity30dPerDay) || 0; // u/día
  const costUSD = getProductCostUSDT(product);
  const stock = Number(product.stock) || 0;

  if (velocity <= 0 || costUSD <= 0) {
    // No tenemos data suficiente — no podemos calcular EOQ
    return {
      product,
      eligible: false,
      reason: velocity <= 0 ? "Sin ventas registradas" : "Sin costo cargado",
    };
  }

  const annualDemand = velocity * 365;
  const holdingCostPerUnit = costUSD * holdingRate; // $/año/unidad

  // EOQ
  const eoq = Math.sqrt((2 * annualDemand * orderCostUSD) / holdingCostPerUnit);

  // Reorder point: cuando el stock llega a este número, hay que pedir
  const reorderPoint = velocity * leadTimeDays + velocity * safetyStockDays;

  // Days of stock actual
  const daysOfStock = velocity > 0 ? stock / velocity : Infinity;

  return {
    product,
    eligible: true,
    velocity: Math.round(velocity * 100) / 100,
    annualDemand: Math.round(annualDemand),
    eoq: Math.ceil(eoq),
    reorderPoint: Math.ceil(reorderPoint),
    currentStock: stock,
    daysOfStock: daysOfStock === Infinity ? null : Math.round(daysOfStock),
    daysUntilReorder: velocity > 0 ? Math.max(0, Math.round((stock - reorderPoint) / velocity)) : null,
    shouldReorder: stock <= reorderPoint,
    costUSD,
    investmentNeededUSD: Math.round(Math.ceil(eoq) * costUSD * 100) / 100,
  };
}

// Calcula EOQ para todos los productos con datos suficientes.
// Filtra solo los que necesitan reposición (shouldReorder=true).
export function reorderRecommendations(products, statsMap, options = {}) {
  const recommendations = (products || [])
    .filter(p => p && !p.isDeleted)
    .map(p => calcEOQForProduct(p, statsMap[p.id], options))
    .filter(r => r && r.eligible);

  return {
    needsReorder: recommendations.filter(r => r.shouldReorder)
      .sort((a, b) => (a.daysOfStock ?? Infinity) - (b.daysOfStock ?? Infinity)),
    all: recommendations,
    totalInvestmentUSD: recommendations
      .filter(r => r.shouldReorder)
      .reduce((s, r) => s + r.investmentNeededUSD, 0),
  };
}
