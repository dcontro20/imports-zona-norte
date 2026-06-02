// src/lib/offerHistory.js
//
// Historial de ofertas mandadas + tracking de conversión.
//
// Las ofertas se registran en el auditLog (entries con entityType="offer").
// Acá extraemos esa info estructurada y la cruzamos con ventas para ver
// qué oferta llevó a qué venta.
//
// Linkeo de ventas a ofertas:
//   - EXPLÍCITO: sale.linkedOfferId === offer.id (Diego lo marcó al cargar venta)
//   - IMPLÍCITO: mismo clientId Y venta dentro de 14d post-oferta
//                (o sin clientId, dentro de 7d si la oferta fue a grupo)
//
// Funciones PURAS.

const MS_PER_DAY = 86400000;

// Extrae las ofertas mandadas del auditLog. Devuelve estructura normalizada
// ordenada por timestamp desc (más reciente primero).
export function extractOffersFromAuditLog(auditLog) {
  return (auditLog || [])
    .filter(e => e && e.entityType === "offer" && e.action === "create")
    .map(e => ({
      id: e.id,
      timestamp: e.timestamp,
      user: e.user,
      audience: e.details?.audience || null,
      category: e.details?.ideaCategory || null,
      offerType: e.details?.offerType || null,
      method: e.details?.method || null,
      clientId: e.details?.clientId || null,
      productIds: Array.isArray(e.details?.productIds) ? e.details.productIds : [],
      suggestedDiscountPct: e.details?.suggestedDiscountPct || 0,
      description: e.description || "",
    }))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// Sugiere ofertas probables para una venta puntual. Devuelve [{ offer, score, daysAfter, matchType }]
// score 0-150. matchType: "explicit" | "client" | "group"
export function suggestOffersForSale(offers, sale, { now = new Date() } = {}) {
  if (!sale || !sale.date) return [];
  const saleMs = new Date(sale.date).getTime();
  if (!Number.isFinite(saleMs)) return [];
  return (offers || [])
    .map(o => {
      const offMs = new Date(o.timestamp).getTime();
      if (!Number.isFinite(offMs)) return null;
      const daysAfter = (saleMs - offMs) / MS_PER_DAY;
      if (daysAfter < 0) return null; // venta antes que oferta — no aplica

      // Match a cliente específico (oferta era individual y mismo clientId)
      if (o.clientId && sale.clientId && o.clientId === sale.clientId && daysAfter <= 14) {
        const score = 100 - daysAfter * 3;
        return { offer: o, score, daysAfter: Math.round(daysAfter * 10) / 10, matchType: "client" };
      }

      // Match a grupo (oferta sin clientId, dentro de 7d)
      if (!o.clientId && daysAfter <= 7) {
        const score = 40 - daysAfter * 4;
        return { offer: o, score, daysAfter: Math.round(daysAfter * 10) / 10, matchType: "group" };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

// Cruza ventas con ofertas. Devuelve [{ offer, salesExplicit, salesImplicit }]
// salesExplicit: las ventas que tienen sale.linkedOfferId === offer.id
// salesImplicit: las ventas sugeridas por proximidad cliente/fecha
export function linkSalesToOffers(offers, sales) {
  const byOfferId = {};
  (offers || []).forEach(o => {
    byOfferId[o.id] = { offer: o, salesExplicit: [], salesImplicit: [] };
  });

  (sales || []).forEach(s => {
    if (!s || s.isDeleted) return;
    // Linkeo explícito
    if (s.linkedOfferId && byOfferId[s.linkedOfferId]) {
      byOfferId[s.linkedOfferId].salesExplicit.push(s);
      return;
    }
    // Linkeo implícito: pick top suggestion
    const sugs = suggestOffersForSale(offers, s);
    if (sugs.length > 0 && byOfferId[sugs[0].offer.id]) {
      byOfferId[sugs[0].offer.id].salesImplicit.push(s);
    }
  });

  return Object.values(byOfferId);
}

// Stats agregadas de conversión: por categoría y por audiencia.
//   { byCategory: { reactivar: { sent, withSale, conversion }, ... },
//     byAudience: { individual: { sent, withSale, conversion }, ... },
//     totalSent, totalWithSale, overallConversion }
export function calcConversionStats(offers, sales) {
  const linked = linkSalesToOffers(offers, sales);
  const byCategory = {};
  const byAudience = {};
  let totalSent = 0;
  let totalWithSale = 0;

  linked.forEach(({ offer, salesExplicit, salesImplicit }) => {
    const hadSale = salesExplicit.length + salesImplicit.length > 0;
    totalSent += 1;
    if (hadSale) totalWithSale += 1;

    if (offer.category) {
      if (!byCategory[offer.category]) byCategory[offer.category] = { sent: 0, withSale: 0 };
      byCategory[offer.category].sent += 1;
      if (hadSale) byCategory[offer.category].withSale += 1;
    }
    if (offer.audience) {
      if (!byAudience[offer.audience]) byAudience[offer.audience] = { sent: 0, withSale: 0 };
      byAudience[offer.audience].sent += 1;
      if (hadSale) byAudience[offer.audience].withSale += 1;
    }
  });

  // Calcular conversion %
  Object.values(byCategory).forEach(s => {
    s.conversion = s.sent > 0 ? Math.round((s.withSale / s.sent) * 100) : 0;
  });
  Object.values(byAudience).forEach(s => {
    s.conversion = s.sent > 0 ? Math.round((s.withSale / s.sent) * 100) : 0;
  });

  return {
    byCategory,
    byAudience,
    totalSent,
    totalWithSale,
    overallConversion: totalSent > 0 ? Math.round((totalWithSale / totalSent) * 100) : 0,
  };
}

// Ofertas mandadas recientemente (últimas N por defecto 20).
export function recentOffers(offers, limit = 20) {
  return (offers || []).slice(0, limit);
}

// Ofertas mandadas a un cliente específico en últimos N días.
// Útil para el form de Sales: "¿esta venta vino de esta oferta?"
export function offersForClient(offers, clientId, { withinDays = 14, now = new Date() } = {}) {
  if (!clientId) return [];
  const cutoff = now.getTime() - withinDays * MS_PER_DAY;
  return (offers || []).filter(o => {
    if (o.clientId !== clientId) return false;
    const ms = new Date(o.timestamp).getTime();
    return Number.isFinite(ms) && ms >= cutoff;
  });
}

// Ofertas grupales (sin clientId) en últimos N días. Sirven como opción
// fallback cuando una venta podría venir de un broadcast.
export function recentGroupOffers(offers, { withinDays = 7, now = new Date() } = {}) {
  const cutoff = now.getTime() - withinDays * MS_PER_DAY;
  return (offers || []).filter(o => {
    if (o.clientId) return false;
    const ms = new Date(o.timestamp).getTime();
    return Number.isFinite(ms) && ms >= cutoff;
  });
}
