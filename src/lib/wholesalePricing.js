// src/lib/wholesalePricing.js
//
// Pricing tier mayorista:
//   - Cliente con tier="mayorista" → 10% de descuento automático
//   - Cualquier cliente con pedido de >=10 unidades → descuento mayorista
//     sugerido (Diego decide si lo aplica)
//   - Pedidos >=20u → 15%
//
// Funciones PURAS.

export const WHOLESALE_TIERS = [
  { minUnits: 0,  discountPct: 0,  label: "Minorista" },
  { minUnits: 10, discountPct: 10, label: "Mayorista" },
  { minUnits: 20, discountPct: 15, label: "Mayorista grande" },
];

// Devuelve el descuento mayorista que aplica para un pedido dado.
// totalUnits puede venir de un sale en proceso, una compra, etc.
export function wholesaleDiscountForUnits(totalUnits) {
  const u = Math.max(0, Number(totalUnits) || 0);
  // Buscamos el tier más alto que el pedido cumple
  let applied = WHOLESALE_TIERS[0];
  for (const tier of WHOLESALE_TIERS) {
    if (u >= tier.minUnits) applied = tier;
  }
  return applied;
}

// Si el cliente tiene tier="mayorista" guardado, le aplicamos descuento
// directo aunque el pedido sea chico (es nuestra política con él).
export function effectiveDiscountForClient(client, totalUnits) {
  const byUnits = wholesaleDiscountForUnits(totalUnits);
  const tier = (client?.tier || "").toLowerCase();
  if (tier === "mayorista" || tier === "vip" || tier === "diamante") {
    // Para clientes premium siempre al menos el descuento "mayorista" base
    const baseTier = WHOLESALE_TIERS.find(t => t.minUnits === 10);
    return byUnits.discountPct >= baseTier.discountPct ? byUnits : baseTier;
  }
  return byUnits;
}

// Sugerencia "este pedido podría tener descuento mayorista"
export function suggestWholesale(client, totalUnits) {
  const eff = effectiveDiscountForClient(client, totalUnits);
  if (eff.discountPct === 0) return null;
  return {
    discountPct: eff.discountPct,
    label: eff.label,
    reason: client?.tier === "mayorista"
      ? `Cliente mayorista → ${eff.discountPct}% automático`
      : `Pedido de ${totalUnits}u → califica ${eff.label} (${eff.discountPct}%)`,
  };
}
