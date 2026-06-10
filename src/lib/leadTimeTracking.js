// src/lib/leadTimeTracking.js
//
// Tracking de lead time por proveedor (Paraguay 1, Paraguay 2, etc.).
// Calcula tiempo promedio entre fecha del pedido y fecha de verificación
// para cada proveedor. Útil para decidir "a quién pedir según urgencia".
//
// También calcula confiabilidad: % de pedidos verificados (vs cancelados).
//
// Funciones PURAS.

const MS_PER_DAY = 86400000;

// Para cada proveedor presente en las compras, calcula:
//   { supplier, totalOrders, verifiedOrders, cancelledOrders,
//     avgLeadTimeDays, minLeadTimeDays, maxLeadTimeDays, reliabilityPct }
export function calcLeadTimes(purchases) {
  const bySupplier = {};
  (purchases || []).forEach(p => {
    if (!p || p.isDeleted) return;
    const supplier = (p.supplier || "—").trim();
    if (!bySupplier[supplier]) {
      bySupplier[supplier] = { orders: [], cancelled: 0, verified: 0 };
    }
    if (p.status === "cancelado") {
      bySupplier[supplier].cancelled += 1;
      return;
    }
    if (p.status === "verificado") {
      bySupplier[supplier].verified += 1;
      const start = p.date ? new Date(p.date).getTime() : null;
      // Verificación: buscamos en statusHistory el primer paso a "verificado"
      const verifiedAt = (p.statusHistory || []).find(h => h.status === "verificado")?.at;
      const end = verifiedAt ? new Date(verifiedAt).getTime() : Date.now();
      if (start && end && end >= start) {
        bySupplier[supplier].orders.push({
          leadDays: Math.round((end - start) / MS_PER_DAY),
          startDate: p.date,
        });
      }
    }
  });

  return Object.entries(bySupplier).map(([supplier, data]) => {
    const totalOrders = data.orders.length + data.cancelled;
    const leadDays = data.orders.map(o => o.leadDays);
    const avg = leadDays.length > 0 ? leadDays.reduce((s, d) => s + d, 0) / leadDays.length : null;
    const min = leadDays.length > 0 ? Math.min(...leadDays) : null;
    const max = leadDays.length > 0 ? Math.max(...leadDays) : null;
    return {
      supplier,
      totalOrders,
      verifiedOrders: data.verified,
      cancelledOrders: data.cancelled,
      avgLeadTimeDays: avg != null ? Math.round(avg) : null,
      minLeadTimeDays: min,
      maxLeadTimeDays: max,
      reliabilityPct: totalOrders > 0 ? Math.round((data.verified / totalOrders) * 100) : 0,
    };
  }).sort((a, b) => {
    // Más confiable primero, después más rápido
    if (a.reliabilityPct !== b.reliabilityPct) return b.reliabilityPct - a.reliabilityPct;
    return (a.avgLeadTimeDays || 9999) - (b.avgLeadTimeDays || 9999);
  });
}

// Recomendación: para un pedido urgente, ¿qué proveedor conviene?
export function recommendSupplierForUrgency(purchases, { urgency = "normal" } = {}) {
  const leadTimes = calcLeadTimes(purchases);
  if (leadTimes.length === 0) return null;

  if (urgency === "urgent") {
    // Priorizamos velocidad
    const fastest = [...leadTimes]
      .filter(s => s.avgLeadTimeDays != null && s.reliabilityPct >= 70)
      .sort((a, b) => a.avgLeadTimeDays - b.avgLeadTimeDays)[0];
    return fastest || leadTimes[0];
  }
  // Normal: priorizamos confiabilidad
  return leadTimes[0];
}
