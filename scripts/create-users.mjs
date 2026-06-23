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

// Las passwords NO viven en el repo (es público). Se pasan por variables de
// entorno al correr el script. Ejemplo:
//   DIEGO_PW='...' GUSTAVO_PW='...' node scripts/create-users.mjs
// Alternativa más cómoda: crear los usuarios desde la web
//   Firebase Console → Authentication → Users → Add user
const users = [
  { email: "dcontro20@gmail.com", password: process.env.DIEGO_PW },
  { email: "gcontro99@gmail.com", password: process.env.GUSTAVO_PW },
].filter(u => {
  if (!u.password) {
    console.error(`⏭️  Salteado ${u.email}: falta su variable de entorno (DIEGO_PW / GUSTAVO_PW)`);
    return false;
  }
  return true;
});

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
