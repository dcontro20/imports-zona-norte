import { initializeApp } from "firebase/app";
import {
  initializeFirestore, doc, setDoc, getDoc, onSnapshot, collection,
  persistentLocalCache, persistentMultipleTabManager,
  terminate, clearIndexedDbPersistence, runTransaction,
} from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from "firebase/auth";
import { diffArraysById, applyDiff } from "./lib/arrayMerge.js";

const firebaseConfig = {
    apiKey: "AIzaSyDAL85SFntaHyupAbrPxJGIpdSSSnecql4",
    authDomain: "imports-zona-norte.firebaseapp.com",
    projectId: "imports-zona-norte",
    storageBucket: "imports-zona-norte.firebasestorage.app",
    messagingSenderId: "255382859803",
    appId: "1:255382859803:web:e263d95ee4a57358d908be"
};

const app = initializeApp(firebaseConfig);
export const firebaseApp = app; // usado por lib/push.js para FCM

// Persistencia offline de Firestore via IndexedDB:
//   - Lecturas: los docs cacheados se devuelven instantáneamente al abrir sin red
//   - Escrituras: se encolan localmente y se sincronizan cuando vuelve la conexión
//   - Multi-tab: persistentMultipleTabManager habilita compartir cache entre tabs
// Si el navegador no soporta IndexedDB (caso raro), Firestore sigue funcionando
// solo online, sin romper.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const auth = getAuth(app);

// Firebase App Check — ata cada request a una instancia verificada de TU app
// (vía reCAPTCHA v3), bloqueando clones, scripts y bots aunque tengan login.
// Pegá la site key generada en: Firebase Console → App Check → Apps →
// registrar la web app con reCAPTCHA v3. Mientras esté vacía, App Check no se
// activa y la app funciona igual. Guía completa: docs/SECURITY.md
export const APP_CHECK_SITE_KEY = "";
if (APP_CHECK_SITE_KEY && typeof window !== "undefined") {
  import("firebase/app-check").then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (e) {
      console.warn("[firebase] App Check init falló:", e?.message);
    }
  }).catch(() => {});
}

// Auth helpers
export const loginWithEmail = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);

// ---- Presencia en tiempo real (colaboración 2 socios) ----
// Cada socio escribe su "heartbeat" (qué página mira, cuándo) en presence/{uid}.
// El otro lo lee para mostrar "Gus activo · en Caja · hace 1m".
export const updatePresence = (uid, info) => {
  if (!uid) return Promise.resolve();
  return setDoc(doc(db, "presence", uid), {
    ...info, lastSeen: new Date().toISOString(),
  }, { merge: true }).catch(() => {});
};

export const subscribePresence = (callback) =>
  onSnapshot(collection(db, "presence"), (snap) => {
    const list = [];
    snap.forEach(d => list.push({ uid: d.id, ...d.data() }));
    callback(list);
  }, () => {});

// Borra el cache offline de Firestore (IndexedDB) — usado al cerrar sesión
// para no dejar data del negocio (PII + finanzas) en el dispositivo.
// Tras terminar Firestore el `db` queda inutilizable: el caller debe recargar.
export async function clearFirestoreCache() {
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (e) {
    console.warn("[firebase] no se pudo limpiar cache offline:", e?.code || e?.message);
  }
}
export const onAuthChange = (callback) => onAuthStateChanged(auth, callback);

// User mapping: Firebase Auth UID → app user profile
// Diego y Gustavo son socios 50/50 (Gustavo volvió el 2026-06-22).
// Ambos tienen role "owner" — acceso total.
const USER_PROFILES = {
  "dcontro20@gmail.com": { name: "Diego",   color: "#1E2B4A", icon: "💜", role: "owner" },
  "gcontro99@gmail.com": { name: "Gustavo", color: "#3B82F6", icon: "💙", role: "owner" },
};
export const getUserProfile = (firebaseUser) => {
  if (!firebaseUser) return null;
  const profile = USER_PROFILES[firebaseUser.email] || { name: firebaseUser.email, color: "#1E2B4A", icon: "👤", role: "owner" };
  return { ...profile, email: firebaseUser.email, uid: firebaseUser.uid };
};

// Helpers de permisos — se mantienen por compatibilidad de API, pero ahora
// siempre devuelven true (Diego es único usuario y tiene acceso total).
export const isOwner = () => true;
export const canDelete = () => true;
export const canViewFinances = () => true;

// Track the last known updatedAt per key (from Firestore subscriptions)
export const lastKnownTimestamps = {};

// Track write failures for UI feedback
export let lastWriteError = null;
export const clearWriteError = () => { lastWriteError = null; };

// Helper to save a full collection as a single doc
// Returns true on success, false on failure. Retries once on failure.
export const saveToFirestore = async (key, data) => {
    const attempt = async () => {
      const now = new Date().toISOString();
      await setDoc(doc(db, "appData", key), { data: JSON.stringify(data), updatedAt: now });
      lastKnownTimestamps[key] = now;
    };
    try {
      await attempt();
      lastWriteError = null;
      return true;
    } catch (e) {
      console.error(`[SAVE] First attempt failed for ${key}:`, e.code || e.message);
      try {
        await new Promise(r => setTimeout(r, 1000));
        await attempt();
        lastWriteError = null;
        return true;
      } catch (e2) {
        console.error(`[SAVE] Retry failed for ${key}:`, e2.code || e2.message);
        lastWriteError = { key, error: e2.code || e2.message, time: new Date().toISOString() };
        // Notificar a la UI via custom event para que App.jsx pueda mostrar toast
        try {
          window.dispatchEvent(new CustomEvent("izn:write-error", { detail: lastWriteError }));
        } catch {}
        return false;
      }
    }
};

// Escritura concurrente-segura para arrays con items por `id`.
//
// En vez del full-overwrite de saveToFirestore (que pisa lo que escribió la
// otra sesión entre nuestro read y nuestro write), esta función:
//   1. Calcula el diff entre el estado local anterior y el nuevo (qué agregué,
//      qué modifiqué, qué eliminé YO).
//   2. Dentro de una transacción atómica, lee la versión del server, aplica
//      MI diff encima, y escribe el resultado. Si otra sesión escribió en
//      paralelo, su cambio se preserva.
//
// Es el path principal para todos los arrays sincronizados. saveToFirestore
// se mantiene como fallback para escalares (exchangeRate) y como "primer write"
// (cuando prevLocal es undefined, no hay diff que calcular).
//
// Devuelve el array resultante post-merge (para que el caller actualice su
// snapshot local), o null si falló.
export const mergeIntoFirestore = async (key, prevLocal, nextLocal) => {
  // Sin diff, no escribimos: ahorra writes y cuota.
  const diff = diffArraysById(prevLocal, nextLocal);
  if (diff.adds.length === 0 && diff.updates.length === 0 && diff.removeIds.length === 0) {
    return Array.isArray(nextLocal) ? nextLocal : prevLocal;
  }

  const docRef = doc(db, "appData", key);
  const attempt = async () => {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      let serverArr = [];
      if (snap.exists()) {
        try { serverArr = JSON.parse(snap.data().data); }
        catch { serverArr = []; }
        if (!Array.isArray(serverArr)) serverArr = [];
      }
      const merged = applyDiff(serverArr, diff);
      const now = new Date().toISOString();
      tx.set(docRef, { data: JSON.stringify(merged), updatedAt: now });
      lastKnownTimestamps[key] = now;
      return merged;
    });
  };

  try {
    const merged = await attempt();
    lastWriteError = null;
    return merged;
  } catch (e) {
    console.error(`[MERGE] First attempt failed for ${key}:`, e.code || e.message);
    try {
      await new Promise(r => setTimeout(r, 1000));
      const merged = await attempt();
      lastWriteError = null;
      return merged;
    } catch (e2) {
      console.error(`[MERGE] Retry failed for ${key}:`, e2.code || e2.message);
      lastWriteError = { key, error: e2.code || e2.message, time: new Date().toISOString() };
      try {
        window.dispatchEvent(new CustomEvent("izn:write-error", { detail: lastWriteError }));
      } catch {}
      return null;
    }
  }
};

// Helper to subscribe to real-time changes
// onError callback ensures keys still get marked as loaded even on failure
export const subscribeToFirestore = (key, callback, onNotFound, onError) => {
    return onSnapshot(doc(db, "appData", key), (docSnap) => {
          if (docSnap.exists()) {
                  try {
                            const docData = docSnap.data();
                            const parsed = JSON.parse(docData.data);
                            if (docData.updatedAt) {
                                lastKnownTimestamps[key] = docData.updatedAt;
                            }
                            callback(parsed);
                  } catch (e) {
                            console.error(`[Firebase] Error parsing ${key}:`, e);
                            if (onError) onError(e);
                  }
          } else {
                  if (onNotFound) onNotFound();
          }
    }, (error) => {
          console.error(`[Firebase] Subscription error for ${key}:`, error.code || error.message);
          // CRITICAL: call onError so the key still gets marked as loaded
          // Otherwise firestoreReady NEVER becomes true and ALL writes are blocked
          if (onError) onError(error);
    });
};
