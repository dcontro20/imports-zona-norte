import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection } from "firebase/firestore";
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
export const db = getFirestore(app);
export const auth = getAuth(app);

// Auth helpers
export const loginWithEmail = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);
export const onAuthChange = (callback) => onAuthStateChanged(auth, callback);

// User mapping: Firebase Auth UID → app user profile
const USER_PROFILES = {
  "dcontro20@gmail.com": { name: "Diego", color: "#6366f1", icon: "💜" },
  "dcontro20@hotmail.com": { name: "Gustavo", color: "#10b981", icon: "💙" },
};
export const getUserProfile = (firebaseUser) => {
  if (!firebaseUser) return null;
  const profile = USER_PROFILES[firebaseUser.email] || { name: firebaseUser.email, color: "#6366f1", icon: "👤" };
  return { ...profile, email: firebaseUser.email, uid: firebaseUser.uid };
};

// Track the last known updatedAt per key (from Firestore subscriptions)
export const lastKnownTimestamps = {};

// Helper to save a full collection as a single doc (efficient for our use case)
// Now includes timestamp conflict check to prevent stale data overwrites
export const saveToFirestore = async (key, data) => {
    try {
          const now = new Date().toISOString();
          await setDoc(doc(db, "appData", key), { data: JSON.stringify(data), updatedAt: now });
          lastKnownTimestamps[key] = now;
    } catch (e) {
          console.error(`Error saving ${key}:`, e);
    }
};

// Helper to subscribe to real-time changes
// Now tracks the updatedAt timestamp for conflict detection
export const subscribeToFirestore = (key, callback, onNotFound) => {
    return onSnapshot(doc(db, "appData", key), (docSnap) => {
          if (docSnap.exists()) {
                  try {
                            const docData = docSnap.data();
                            const parsed = JSON.parse(docData.data);
                            // Track the latest timestamp we've seen from Firestore
                    if (docData.updatedAt) {
                                lastKnownTimestamps[key] = docData.updatedAt;
                    }
                            callback(parsed);
                  } catch (e) {
                            console.error(`Error parsing ${key}:`, e);
                  }
          } else {
                  // Document doesn't exist yet — notify caller so it can mark load as done
                  if (onNotFound) onNotFound();
          }
    }, (error) => {
          if (error.code === "permission-denied") {
            console.warn(`[Firebase] Permission denied for ${key} — user may not be authenticated`);
          } else {
            console.error(`[Firebase] Error subscribing to ${key}:`, error);
          }
    });
};
