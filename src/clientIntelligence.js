// Inteligencia de cliente (S17) — lógica pura, testeable.
// Construye stats por cliente, los segmenta, predice próxima compra y genera
// alertas accionables (VIP que se enfría, clientes a reactivar).

const MS_DAY = 86400000;

function saleARS(s, rate = 1) {
  const amt = Number(s.total) || 0;
  return (s.currency === "USD" || s.currency === "USDT") ? amt * (rate || 1) : amt;
}

/**
 * Stats por cliente a partir de clients + sales.
 * Devuelve array con: salesCount, totalSpentARS, lastPurchase, firstPurchase,
 * daysSinceLast, avgDaysBetween (cadencia), tier, balance.
 */
export function buildClientStats(clients, sales, rate = 1, now = Date.now()) {
  const byClient = {};
  (sales || []).filter(s => !s.isDeleted && s.clientId).forEach(s => {
    (byClient[s.clientId] = byClient[s.clientId] || []).push(s);
  });

  return (clients || []).filter(c => !c.isDeleted).map(c => {
    const cs = (byClient[c.id] || []).slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const salesCount = cs.length;
    const totalSpentARS = cs.reduce((sum, s) => sum + saleARS(s, rate), 0);
    const lastPurchase = cs[0] || null;
    const firstPurchase = cs[cs.length - 1] || null;
    const daysSinceLast = lastPurchase
      ? Math.floor((now - new Date(lastPurchase.date).getTime()) / MS_DAY)
      : null;

    let avgDaysBetween = null;
    if (cs.length >= 2) {
      const span = new Date(cs[0].date).getTime() - new Date(cs[cs.length - 1].date).getTime();
      avgDaysBetween = Math.max(1, Math.round(span / MS_DAY / (cs.length - 1)));
    }

    return {
      id: c.id, name: c.name,
      tier: c.tier || "regular",
      balance: Number(c.balance) || 0,
      salesCount, totalSpentARS, lastPurchase, firstPurchase,
      daysSinceLast, avgDaysBetween,
    };
  });
}

const isVipTier = (tier) => tier === "vip" || tier === "diamante";

/**
 * Segmenta un cliente según recencia y cadencia.
 * "sin_compras" | "nuevo" | "activo" | "en_riesgo" | "dormido"
 */
export function classifyClient(st, now = Date.now()) {
  if (!st || st.salesCount === 0) return "sin_compras";
  const d = st.daysSinceLast ?? 0;
  if (st.salesCount === 1) return d <= 45 ? "nuevo" : "dormido";
  const cadence = st.avgDaysBetween || 30;
  if (d <= cadence * 1.2) return "activo";
  if (d <= cadence * 2.5) return "en_riesgo";
  return "dormido";
}

/**
 * Predice la próxima compra esperada según la cadencia.
 * Devuelve { expectedDate, overdueDays, status } o null si no hay cadencia.
 * status: "al_dia" | "por_comprar" | "atrasado"
 */
export function predictNextPurchase(st, now = Date.now()) {
  if (!st || !st.lastPurchase || !st.avgDaysBetween) return null;
  const last = new Date(st.lastPurchase.date).getTime();
  const expected = last + st.avgDaysBetween * MS_DAY;
  const overdueDays = Math.floor((now - expected) / MS_DAY);
  let status;
  if (overdueDays < -3) status = "al_dia";
  else if (overdueDays <= st.avgDaysBetween * 0.5) status = "por_comprar";
  else status = "atrasado";
  return { expectedDate: new Date(expected).toISOString().slice(0, 10), overdueDays, status };
}

const sevRank = (s) => ({ high: 3, medium: 2, low: 1 }[s] || 0);

/**
 * Alertas accionables sobre la cartera de clientes.
 * - vip_riesgo: cliente VIP que se enfrió o se durmió (alta prioridad).
 * - reactivar: cliente recurrente (≥3 compras) que se está enfriando.
 * - deuda: cliente con saldo deudor.
 */
export function clientAlerts(statsList, now = Date.now()) {
  const alerts = [];
  for (const st of statsList || []) {
    const seg = classifyClient(st, now);
    if (isVipTier(st.tier) && (seg === "en_riesgo" || seg === "dormido")) {
      alerts.push({
        type: "vip_riesgo", clientId: st.id, name: st.name, severity: "high",
        msg: `${st.name} (VIP) hace ${st.daysSinceLast}d que no compra`,
      });
    } else if (seg === "en_riesgo" && st.salesCount >= 3) {
      alerts.push({
        type: "reactivar", clientId: st.id, name: st.name, severity: "medium",
        msg: `${st.name} se está enfriando — ${st.daysSinceLast}d (suele comprar cada ${st.avgDaysBetween}d)`,
      });
    }
    if (st.balance < 0) {
      alerts.push({
        type: "deuda", clientId: st.id, name: st.name, severity: "medium",
        msg: `${st.name} debe ${Math.round(Math.abs(st.balance))}`,
      });
    }
  }
  return alerts.sort((a, b) => sevRank(b.severity) - sevRank(a.severity));
}

/** Conteo por segmento (para el resumen visual). */
export function segmentBreakdown(statsList, now = Date.now()) {
  const counts = { sin_compras: 0, nuevo: 0, activo: 0, en_riesgo: 0, dormido: 0 };
  for (const st of statsList || []) counts[classifyClient(st, now)]++;
  return counts;
}

/**
 * Clientes "a tocar": predicción atrasada o por comprar, ordenados por valor.
 * Excluye sin_compras y dormidos profundos (>120d) que ya no son accionables.
 */
export function clientsToReach(statsList, now = Date.now(), limit = 8) {
  return (statsList || [])
    .map(st => ({ st, pred: predictNextPurchase(st, now) }))
    .filter(({ st, pred }) => pred && (pred.status === "atrasado" || pred.status === "por_comprar") && (st.daysSinceLast ?? 0) <= 120)
    .sort((a, b) => b.st.totalSpentARS - a.st.totalSpentARS)
    .slice(0, limit)
    .map(({ st, pred }) => ({ ...st, prediction: pred }));
}
