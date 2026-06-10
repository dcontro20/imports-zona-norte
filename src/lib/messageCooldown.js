// src/lib/messageCooldown.js
//
// Anti-saturación de mensajes. Lee el auditLog (entries entityType="offer")
// y dice cuándo se mandó el último mensaje a cada destinatario, además de
// avisar si un nuevo envío sería "saturar" al cliente.
//
// Reglas por defecto:
//   - Cliente individual: cooldown 4 días
//   - Grupo clientes: máx 3 mensajes / 7 días
//   - Grupo fiestas: máx 2 mensajes / 7 días
//
// Funciones PURAS.

import { extractOffersFromAuditLog } from "./offerHistory.js";

const MS_PER_DAY = 86400000;

const DEFAULT_LIMITS = {
  individualCooldownDays: 4,
  groupClientsPerWeek: 3,
  groupPartyPerWeek: 2,
};

// Filtra ofertas del auditLog que matchean un destinatario.
// destinatario: { audience, clientId? } — para individual necesita clientId.
function offersFor(offers, audience, clientId) {
  return offers.filter(o => {
    if (o.audience !== audience) return false;
    if (audience === "individual") return o.clientId === clientId;
    return true; // grupos: no filtra por cliente
  });
}

// Días desde la última oferta enviada a ese destinatario, o null si nunca.
export function daysSinceLastMessage(auditLog, { audience, clientId, now = new Date() } = {}) {
  const offers = extractOffersFromAuditLog(auditLog);
  const matching = offersFor(offers, audience, clientId);
  if (matching.length === 0) return null;
  const lastMs = Math.max(...matching.map(o => new Date(o.timestamp).getTime()).filter(Number.isFinite));
  if (!Number.isFinite(lastMs)) return null;
  return Math.floor((now.getTime() - lastMs) / MS_PER_DAY);
}

// Cantidad de mensajes a este destinatario en los últimos N días.
export function messagesInLastDays(auditLog, { audience, clientId, days = 7, now = new Date() } = {}) {
  const offers = extractOffersFromAuditLog(auditLog);
  const cutoff = now.getTime() - days * MS_PER_DAY;
  const matching = offersFor(offers, audience, clientId);
  return matching.filter(o => {
    const ms = new Date(o.timestamp).getTime();
    return Number.isFinite(ms) && ms >= cutoff;
  }).length;
}

// Decide si DEBERÍA bloquearse o avisar antes de enviar.
// Devuelve { ok: bool, warning: string|null, reason: string|null, lastDays }
export function checkCooldown(auditLog, { audience, clientId, now = new Date(), limits = DEFAULT_LIMITS } = {}) {
  const lastDays = daysSinceLastMessage(auditLog, { audience, clientId, now });

  if (audience === "individual") {
    if (lastDays != null && lastDays < limits.individualCooldownDays) {
      return {
        ok: false,
        warning: `⚠️ Ya le mandaste a este cliente hace ${lastDays}d. Cooldown recomendado: ${limits.individualCooldownDays}d.`,
        reason: "individual_cooldown",
        lastDays,
      };
    }
    return { ok: true, warning: null, reason: null, lastDays };
  }

  // Grupos: usar cuota semanal
  const sentThisWeek = messagesInLastDays(auditLog, { audience, days: 7, now });
  const limit = audience === "groupParty" ? limits.groupPartyPerWeek : limits.groupClientsPerWeek;

  if (sentThisWeek >= limit) {
    return {
      ok: false,
      warning: `⚠️ Ya mandaste ${sentThisWeek} mensajes esta semana a este grupo (máx ${limit}). Mejor esperá unos días.`,
      reason: "group_quota",
      lastDays,
      sentThisWeek,
      limit,
    };
  }

  // Info útil si está cerca del límite
  if (sentThisWeek === limit - 1) {
    return {
      ok: true,
      warning: `Este sería el último mensaje recomendado de la semana (${sentThisWeek + 1}/${limit}).`,
      reason: "near_quota",
      lastDays,
      sentThisWeek,
      limit,
    };
  }

  return { ok: true, warning: null, reason: null, lastDays, sentThisWeek, limit };
}
