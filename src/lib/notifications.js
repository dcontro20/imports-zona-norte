// src/lib/notifications.js
//
// Wrapper sobre la Notification API + scheduler de notificaciones LOCALES
// para los 2 envíos diarios de presencia.
//
// LIMITACIÓN iOS: las notificaciones locales solo se disparan si la app
// estuvo activa en algún momento del día (al menos abrir la PWA). En la
// próxima iteración agregamos push remotas (FCM) que funcionan siempre.

let scheduledTimers = [];

// === Detección de soporte ===
export function isSupported() {
  return typeof window !== "undefined"
    && typeof Notification !== "undefined"
    && "serviceWorker" in navigator;
}

export function getPermission() {
  if (!isSupported()) return "unsupported";
  return Notification.permission; // "granted" | "denied" | "default"
}

export function hasPermission() {
  return getPermission() === "granted";
}

// Pide permiso al usuario. Devuelve la promesa con el resultado.
export async function requestPermission() {
  if (!isSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

// === Helpers de hora puros (testeables) ===
export function parseTime(timeStr) {
  const parts = (timeStr || "12:00").split(":").map(Number);
  const hours = Number.isFinite(parts[0]) ? Math.max(0, Math.min(23, parts[0])) : 12;
  const minutes = Number.isFinite(parts[1]) ? Math.max(0, Math.min(59, parts[1])) : 0;
  return { hours, minutes };
}

// Devuelve ms desde now hasta la próxima ocurrencia de timeStr HOY.
// Si esa hora ya pasó hoy, devuelve null (no se programa).
export function msUntilTodayTime(timeStr, now = new Date()) {
  const { hours, minutes } = parseTime(timeStr);
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  const diff = target.getTime() - now.getTime();
  return diff > 0 ? diff : null;
}

// === Disparo de la notificación ===
function showNotification(title, body, slot) {
  if (!hasPermission()) return;
  // SW.registration.showNotification funciona mejor en iOS que new Notification()
  if (navigator.serviceWorker?.getRegistration) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg && reg.showNotification) {
        reg.showNotification(title, {
          body,
          icon: "/apple-touch-icon.svg",
          badge: "/icon.svg",
          tag: `izn-daily-${slot}`,
          renotify: false,
          requireInteraction: false,
          data: { slot, url: "/?page=offers" },
        });
      } else {
        try { new Notification(title, { body }); } catch {}
      }
    }).catch(() => {
      try { new Notification(title, { body }); } catch {}
    });
  } else {
    try { new Notification(title, { body }); } catch {}
  }
}

// === Scheduler ===
export function cancelScheduled() {
  scheduledTimers.forEach(t => clearTimeout(t));
  scheduledTimers = [];
}

// Programa las notificaciones del DÍA ACTUAL.
// Devuelve { scheduled: N } con la cantidad efectivamente programada
// (las horas ya pasadas no se programan).
export function scheduleDailyNotifications({
  slotNoonTime = "12:00",
  slotEveningTime = "18:30",
  now = new Date(),
} = {}) {
  cancelScheduled();
  if (!hasPermission()) return { scheduled: 0, reason: "no_permission" };

  const tasks = [
    {
      time: slotNoonTime,
      slot: "noon",
      title: "☀️ Mediodía — mensaje de stock",
      body: "Es hora de marcar presencia: copiá el mensaje y pegalo al grupo.",
    },
    {
      time: slotEveningTime,
      slot: "evening",
      title: "🌆 Tarde — segunda pasada",
      body: "Segundo envío del día: agarra a los que no vieron el del mediodía.",
    },
  ];

  let count = 0;
  tasks.forEach(({ time, slot, title, body }) => {
    const ms = msUntilTodayTime(time, now);
    if (ms === null) return;
    const id = setTimeout(() => showNotification(title, body, slot), ms);
    scheduledTimers.push(id);
    count++;
  });

  return { scheduled: count };
}
