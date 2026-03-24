import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection } from "firebase/firestore";

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
export const subscribeToFirestore = (key, callback) => {
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
          }
    });
};
