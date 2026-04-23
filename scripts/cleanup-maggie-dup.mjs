#!/usr/bin/env node
// Cleanup puntual: marcar el cashMovement de Maggie Gos como isDeleted
// con razón documentada. Es duplicado del sale.changeAmount y el sistema
// nuevo lo deduplicaría desde el código.
//
// One-shot, idempotente. Si ya está deleted, no hace nada.

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDAL85SFntaHyupAbrPxJGIpdSSSnecql4",
  authDomain: "imports-zona-norte.firebaseapp.com",
  projectId: "imports-zona-norte",
  storageBucket: "imports-zona-norte.firebasestorage.app",
  messagingSenderId: "255382859803",
  appId: "1:255382859803:web:e263d95ee4a57358d908be"
};

const TARGET_ID = "mo83me3dsc1ha";
const REASON = "Duplicado: el vuelto ya está declarado en sale.changeAmount de la venta mo83me3c6hy67 (Maggie Gos). El cashMovement automático fue eliminado del código (Sales.jsx) y CashBox.calcBalance ahora procesa sale.changeAmount como fuente única de verdad. Cleanup ejecutado el 2026-04-23.";

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, "dcontro20@gmail.com", "Poncharelo20!");
  console.log("✅ auth OK");

  const ref = doc(db, "appData", "cashMovements");
  const snap = await getDoc(ref);
  if (!snap.exists()) { console.error("❌ no existe doc cashMovements"); process.exit(1); }

  const list = JSON.parse(snap.data().data);
  const target = list.find(m => m.id === TARGET_ID);
  if (!target) { console.error(`❌ no se encontró cashMovement ${TARGET_ID}`); process.exit(1); }
  if (target.isDeleted) { console.log("ℹ️  ya estaba marcado como deleted, nada que hacer"); process.exit(0); }

  console.log("📋 movimiento a marcar como deleted:");
  console.log(JSON.stringify(target, null, 2));

  const updated = list.map(m => m.id === TARGET_ID ? {
    ...m,
    isDeleted: true,
    deletedAt: new Date().toISOString(),
    deletedBy: "Sistema (cleanup duplicado)",
    deletedReason: REASON,
  } : m);

  await setDoc(ref, {
    data: JSON.stringify(updated),
    updatedAt: new Date().toISOString(),
  });

  console.log("✅ cashMovement marcado como deleted con razón documentada.");
  process.exit(0);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
