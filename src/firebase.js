import { initializeApp } from "firebase/app";
import {
  initializeFirestore, doc, setDoc, getDoc, onSnapshot, collection,
  persistentLocalCache, persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDAL85SFntaHyupAbrPxJGIpdSSSnecql4",
    authDomain: "imports-zona-norte.firebaseapp.com",
    projectId: "imports-zona-norte",
    storageBucket: "imports-zona-norte.firebasestorage.app",
    messagingSenderId: "255382859803",
    appId: "1:255382859803:web:e263d95ee4a57358d908be"
};

const app = initializeApp(firebaseConfig);

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

// Auth helpers
export const loginWithEmail = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);
export const onAuthChange = (callback) => onAuthStateChanged(auth, callback);

// User mapping: Firebase Auth UID → app user profile
// Roles:
//   - owner: Diego (acceso total incluyendo finanzas de socios, cierres, papelera, auditoría, export, deletes)
//   - manager: Gustavo (operativo: ventas, compras, stock, clientes, mermas, caja diaria — sin finanzas privadas ni deletes)
const USER_PROFILES = {
  "dcontro20@gmail.com": { name: "Diego", color: "#5E6AD2", icon: "💜", role: "owner" },
  "dcontro20@hotmail.com": { name: "Gustavo", color: "#0F7B6C", icon: "💙", role: "manager" },
};
export const getUserProfile = (firebaseUser) => {
  if (!firebaseUser) return null;
  const profile = USER_PROFILES[firebaseUser.email] || { name: firebaseUser.email, color: "#5E6AD2", icon: "👤", role: "manager" };
  return { ...profile, email: firebaseUser.email, uid: firebaseUser.uid };
};

// Helpers de permisos — usar en componentes para decidir UI/acciones
export const isOwner = (user) => user?.role === "owner";
export const canDelete = (user) => user?.role === "owner";
export const canViewFinances = (user) => user?.role === "owner";

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
