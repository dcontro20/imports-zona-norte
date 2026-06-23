// Helpers puros para las features de colaboración entre socios (Diego + Gustavo).
// Sin side effects — testeables.

// Tiempo relativo en español: "recién", "hace 5m", "hace 2h", "ayer", "hace 3d".
export function formatRelative(iso, now = Date.now()) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 45) return "recién";
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)}h`;
  const days = Math.floor(diffSec / 86400);
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days}d`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months > 1 ? "es" : ""}`;
}

// ¿La presencia está "activa"? (heartbeat reciente).
export function isPresenceActive(lastSeenIso, now = Date.now(), thresholdSec = 90) {
  if (!lastSeenIso) return false;
  const t = new Date(lastSeenIso).getTime();
  if (Number.isNaN(t)) return false;
  return (now - t) / 1000 < thresholdSec;
}

// Ícono por tipo de acción del audit log.
export function actionIcon(action) {
  return { create: "➕", update: "✏️", delete: "🗑️", restore: "↩️", login: "🔑" }[action] || "•";
}

// Etiqueta legible del tipo de entidad.
export function entityLabel(entityType) {
  return {
    sale: "venta", expense: "gasto", purchase: "compra", product: "producto",
    client: "cliente", withdrawal: "merma", partnerWithdrawal: "retiro",
    cashMovement: "caja", coupon: "cupón", closure: "cierre",
  }[entityType] || entityType || "registro";
}

// Filtra el audit log a las últimas N acciones "interesantes" (excluye login/sistema).
export function recentActivity(auditLog, limit = 12) {
  if (!Array.isArray(auditLog)) return [];
  return auditLog
    .filter(e => e && e.action && e.action !== "login" && e.user && e.user !== "Sistema")
    .slice(0, limit);
}
