// One-time script to create Firebase Auth users
// Run: node scripts/create-users.mjs

import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDAL85SFntaHyupAbrPxJGIpdSSSnecql4",
  authDomain: "imports-zona-norte.firebaseapp.com",
  projectId: "imports-zona-norte",
  storageBucket: "imports-zona-norte.firebasestorage.app",
  messagingSenderId: "255382859803",
  appId: "1:255382859803:web:e263d95ee4a57358d908be"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// IMPORTANTE: completar la password de Gustavo antes de correr el script.
// Después de crear el usuario, Gustavo puede cambiarla desde "Forgot password"
// en la pantalla de login (recibe el reset por mail).
const users = [
  { email: "dcontro20@gmail.com", password: "Poncharelo20!" },
  { email: "gcontro99@gmail.com", password: "REEMPLAZAR_ANTES_DE_CORRER" },
];

for (const u of users) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, u.email, u.password);
    console.log(`✅ Created: ${u.email} (uid: ${cred.user.uid})`);
  } catch (err) {
    if (err.code === "auth/email-already-in-use") {
      console.log(`⏭️  Already exists: ${u.email}`);
    } else {
      console.error(`❌ Error creating ${u.email}:`, err.message);
    }
  }
}

console.log("\nDone. You can now log in with these accounts.");
process.exit(0);
