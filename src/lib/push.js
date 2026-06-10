// Cliente de push REMOTAS (Firebase Cloud Messaging).
//
// Flujo completo:
//   1. El usuario activa notificaciones en Ajustes + concede permiso
//   2. enablePush() pide un token FCM al browser y lo guarda en
//      Firestore (colección pushTokens) — identifica ESTE dispositivo
//   3. syncPushConfig() escribe los horarios elegidos en push/config
//   4. Un cron (GitHub Actions) pinguea /api/send-daily-push cada 10 min;
//      el endpoint lee config + tokens y manda la push vía FCM
//   5. El SW (sw.js) recibe el evento "push" y muestra la notificación
//      — la app puede estar CERRADA, llega igual
//
// Si VAPID_PUBLIC_KEY está vacía (setup incompleto), todo esto se saltea
// y App.jsx cae al modo de notificaciones locales (notifications.js).
//
// Todos los imports de firebase/messaging son dinámicos para no engordar
// el bundle inicial.

import { VAPID_PUBLIC_KEY } from "./pushConfig.js";

const TOKEN_LS_KEY = "izn:pushToken";

export const isPushConfigured = () =>
  typeof VAPID_PUBLIC_KEY === "string" && VAPID_PUBLIC_KEY.length > 20;

export const getStoredPushToken = () => {
  try { return localStorage.getItem(TOKEN_LS_KEY); } catch { return null; }
};

// FCM web requiere SW + Push API + Notification API. En iOS además la PWA
// tiene que estar instalada en pantalla de inicio (iOS 16.4+).
export async function isPushSupported() {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  try {
    const { isSupported } = await import("firebase/messaging");
    return await isSupported();
  } catch {
    return false;
  }
}

// Registra (o refresca) el token FCM de este dispositivo y lo persiste en
// Firestore. Idempotente: llamarlo en cada apertura de app es barato y
// mantiene lastSeenAt fresco. Devuelve { ok, token? , error? }.
export async function enablePush() {
  if (!isPushConfigured()) return { ok: false, error: "not_configured" };
  if (!(await isPushSupported())) return { ok: false, error: "unsupported" };
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return { ok: false, error: "no_permission" };
  }
  try {
    const [{ getMessaging, getToken }, { firebaseApp, db }, { doc, setDoc }] =
      await Promise.all([
        import("firebase/messaging"),
        import("../firebase.js"),
        import("firebase/firestore"),
      ]);
    const registration = await navigator.serviceWorker.ready;
    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, {
      vapidKey: VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return { ok: false, error: "no_token" };

    const nowIso = new Date().toISOString();
    const prev = getStoredPushToken();
    await setDoc(doc(db, "pushTokens", token), {
      lastSeenAt: nowIso,
      ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "",
      ...(prev === token ? {} : { createdAt: nowIso }),
    }, { merge: true });

    // Si el token rotó, limpiar el doc viejo para no mandar a un token muerto
    if (prev && prev !== token) {
      try {
        const { deleteDoc } = await import("firebase/firestore");
        await deleteDoc(doc(db, "pushTokens", prev));
      } catch {}
    }

    try { localStorage.setItem(TOKEN_LS_KEY, token); } catch {}
    return { ok: true, token };
  } catch (e) {
    console.error("[push] enablePush failed:", e?.code || e?.message || e);
    return { ok: false, error: e?.code || e?.message || "unknown" };
  }
}

// Da de baja este dispositivo: borra el token de FCM y de Firestore.
export async function disablePush() {
  const stored = getStoredPushToken();
  try {
    if (isPushConfigured() && (await isPushSupported())) {
      const [{ getMessaging, deleteToken }, { firebaseApp }] = await Promise.all([
        import("firebase/messaging"),
        import("../firebase.js"),
      ]);
      await deleteToken(getMessaging(firebaseApp)).catch(() => {});
    }
    if (stored) {
      const [{ db }, { doc, deleteDoc }] = await Promise.all([
        import("../firebase.js"),
        import("firebase/firestore"),
      ]);
      await deleteDoc(doc(db, "pushTokens", stored)).catch(() => {});
    }
  } finally {
    try { localStorage.removeItem(TOKEN_LS_KEY); } catch {}
  }
}

// Escribe la config de horarios en Firestore para que el endpoint
// serverless sepa cuándo y si mandar. Doc: push/config.
export async function syncPushConfig({ enabled, noonTime, eveningTime }) {
  const [{ db }, { doc, setDoc }] = await Promise.all([
    import("../firebase.js"),
    import("firebase/firestore"),
  ]);
  await setDoc(doc(db, "push", "config"), {
    enabled: !!enabled,
    noonTime: noonTime || "12:00",
    eveningTime: eveningTime || "18:30",
    tz: "America/Argentina/Buenos_Aires",
    updatedAt: new Date().toISOString(),
  });
}
