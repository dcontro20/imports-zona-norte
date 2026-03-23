import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot, collection } from "firebase/firestore";

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

// Helper to save a full collection as a single doc (efficient for our use case)
export const saveToFirestore = async (key, data) => {
  try {
    await setDoc(doc(db, "appData", key), { data: JSON.stringify(data), updatedAt: new Date().toISOString() });
  } catch (e) {
    console.error(`Error saving ${key}:`, e);
  }
};

// Helper to subscribe to real-time changes
export const subscribeToFirestore = (key, callback) => {
  return onSnapshot(doc(db, "appData", key), (docSnap) => {
    if (docSnap.exists()) {
      try {
        const parsed = JSON.parse(docSnap.data().data);
        callback(parsed);
      } catch (e) {
        console.error(`Error parsing ${key}:`, e);
      }
    }
  });
};
