// src/lib/loyalty.js
//
// Sistema simple de puntos de fidelidad. Reglas:
//   - 1 punto por cada $X gastados (default: $5000 ARS)
//   - Bonus: +2 puntos por compra >$30000 (premio ticket alto)
//   - Niveles de reward:
//       10 pts  → 5% off en su próxima compra
//       25 pts  → 10% off
//       50 pts  → producto de regalo (sabor a elección, valor ≤$15000)
//   - Tier VIP/Diamante multiplican x1.5 / x2 (incentivo a fidelizarse)
//
// Funciones PURAS. No persiste nada — todo se deriva del historial de ventas.

import { safeRate } from "../helpers.js";

const POINTS_PER_ARS = 5000;
const BONUS_THRESHOLD_ARS = 30000;
const BONUS_POINTS = 2;
const TIER_MULTIPLIER = { regular: 1, vip: 1.5, diamante: 2 };

export const REWARDS = [
  { id: "r10", points: 10, label: "5% off en tu próxima compra", kind: "discount", value: 5 },
  { id: "r25", points: 25, label: "10% off en tu próxima compra", kind: "discount", value: 10 },
  { id: "r50", points: 50, label: "Sabor de regalo (≤ $15.000)", kind: "gift", value: 15000 },
];

// Calcula los puntos totales acumulados por un cliente.
export function calcPoints(client, sales, options = {}) {
  if (!client) return { total: 0, breakdown: [] };
  const { exchangeRate = 1 } = options;
  const tier = (client.tier || "regular").toLowerCase();
  const mult = TIER_MULTIPLIER[tier] || 1;

  const clientSales = (sales || []).filter(s => s && !s.isDeleted && s.clientId === client.id);

  let base = 0;
  let bonus = 0;
  clientSales.forEach(s => {
    const sRate = safeRate(s.exchangeRate || exchangeRate);
    const cur = s.currency || "ARS";
    const t = Number(s.total) || 0;
    const ars = (cur === "USD" || cur === "USDT") ? t * sRate : t;

    base += Math.floor(ars / POINTS_PER_ARS);
    if (ars >= BONUS_THRESHOLD_ARS) bonus += BONUS_POINTS;
  });

  const subtotal = base + bonus;
  const total = Math.floor(subtotal * mult);

  return {
    total,
    base,
    bonus,
    multiplier: mult,
    breakdown: {
      basePoints: base,
      bonusPoints: bonus,
      tierMultiplier: mult,
      finalPoints: total,
    },
  };
}

// Devuelve el reward más alto que el cliente puede canjear AHORA y
// el próximo (para mostrar progreso "te faltan X puntos").
export function getRewardStatus(points) {
  const sorted = [...REWARDS].sort((a, b) => b.points - a.points);
  const claimable = sorted.find(r => points >= r.points) || null;
  const next = [...REWARDS].sort((a, b) => a.points - b.points).find(r => r.points > points) || null;
  const pointsToNext = next ? next.points - points : 0;
  return { claimable, next, pointsToNext };
}

// Clientes que ESTÁN a un paso de un reward (entre 80-100% del próximo).
// Util para que Diego les mande un "te falta poco para tu premio" → engagement.
export function clientsCloseToReward(clients, sales, options = {}) {
  const { exchangeRate = 1 } = options;
  const result = [];
  (clients || []).forEach(c => {
    if (!c || c.isDeleted || c.inactive) return;
    const pts = calcPoints(c, sales, { exchangeRate });
    const { next, pointsToNext } = getRewardStatus(pts.total);
    if (!next) return; // ya tiene todos los rewards
    const progress = (pts.total / next.points) * 100;
    if (progress >= 75 && progress < 100) {
      result.push({
        client: c,
        currentPoints: pts.total,
        next,
        pointsToNext,
        progress: Math.round(progress),
      });
    }
  });
  return result.sort((a, b) => b.progress - a.progress);
}
