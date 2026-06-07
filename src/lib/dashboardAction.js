// src/lib/dashboardAction.js
//
// "Acción del día" — la próxima jugada concreta para vender más.
// Una sola sugerencia priorizada, NO una lista de cosas.
//
// Prioridades en orden:
//   1. Cliente VIP dormido (alto valor histórico sin contacto reciente)
//   2. Sugerencia del calendario semanal de Mensajes (lun/jue/vie etc.)
//   3. Stock parado considerable (oportunidad de liquidar)
//
// Devuelve { icon, title, subtitle, action: { label, page } } o null.
//
// Funciones PURAS.

import { dormantClients } from "./smartOffers.js";
import { todaySuggestions } from "./offerCalendar.js";
import { AUDIENCES } from "./offerAudiences.js";

const VIP_THRESHOLD_ARS = 50000; // gastó >$50k históricamente

export function getActionOfTheDay({
  sales = [],
  clients = [],
  products = [],
  exchangeRate = 1,
  now = new Date(),
} = {}) {
  // Prioridad 1: cliente VIP dormido
  const dormant = dormantClients(clients, sales, { daysThreshold: 30, exchangeRate, now });
  const vipDormant = dormant.find(d => d.totalSpentARS >= VIP_THRESHOLD_ARS);
  if (vipDormant) {
    return {
      icon: "😴",
      title: `Reactivá a ${vipDormant.client.name}`,
      subtitle: `Cliente valioso · no compra hace ${vipDormant.daysSince}d · histórico $${Math.round(vipDormant.totalSpentARS).toLocaleString("es-AR")}`,
      action: { label: "Armar mensaje", page: "offers" },
    };
  }

  // Prioridad 2: sugerencia del calendario semanal
  const today = todaySuggestions({ now });
  if (today.length > 0) {
    const sug = today[0];
    const aud = AUDIENCES[sug.audience];
    return {
      icon: aud?.icon || "💡",
      title: `Mandar mensaje al ${aud?.label || "grupo"}`,
      subtitle: sug.reason,
      action: { label: "Ver mensaje", page: "offers" },
    };
  }

  // Prioridad 3: si hay stock parado considerable, sugerir crear oferta
  const stale = (products || []).filter(p => {
    if (!p || p.isDeleted) return false;
    return (Number(p.stock) || 0) >= 4;
  });
  if (stale.length >= 5) {
    return {
      icon: "💤",
      title: `Hay ${stale.length} sabores con stock disponible`,
      subtitle: "Buen momento para armar una oferta y mover inventario",
      action: { label: "Crear oferta", page: "offers" },
    };
  }

  return null;
}
