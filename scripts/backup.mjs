#!/usr/bin/env node
// Backup script: exports all Firestore data to JSON files
// Can be run manually: node scripts/backup.mjs
// Or scheduled via Claude Code agent

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";

const firebaseConfig = {
  apiKey: "AIzaSyDAL85SFntaHyupAbrPxJGIpdSSSnecql4",
  authDomain: "imports-zona-norte.firebaseapp.com",
  projectId: "imports-zona-norte",
  storageBucket: "imports-zona-norte.firebasestorage.app",
  messagingSenderId: "255382859803",
  appId: "1:255382859803:web:e263d95ee4a57358d908be"
};

const COLLECTIONS = [
  "products", "sales", "purchases", "clients", "expenses",
  "withdrawals", "cashMovements", "stockLog", "priceLog",
  "monthlyClosures", "partnerWithdrawals", "exchangeRate", "auditLog"
];

const BACKUP_DIR = join(process.cwd(), "backups");
const MAX_BACKUPS = 30; // Keep last 30 backups

async function main() {
  console.log("🔄 Imports Zona Norte — Backup");
  console.log(`   ${new Date().toLocaleString("es-AR")}\n`);

  // Init Firebase
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  // Authenticate (required by Firestore rules)
  try {
    await signInWithEmailAndPassword(auth, "dcontro20@gmail.com", "Poncharelo20!");
    console.log("✅ Autenticado en Firebase");
  } catch (err) {
    console.error("❌ Error de autenticación:", err.message);
    process.exit(1);
  }

  // Download all collections
  const backup = { _meta: { date: new Date().toISOString(), version: "1.0" } };
  let totalRecords = 0;

  for (const key of COLLECTIONS) {
    try {
      const snap = await getDoc(doc(db, "appData", key));
      if (snap.exists()) {
        const raw = snap.data();
        const parsed = JSON.parse(raw.data);
        backup[key] = { data: parsed, updatedAt: raw.updatedAt };
        const count = Array.isArray(parsed) ? parsed.length : 1;
        totalRecords += count;
        console.log(`   📦 ${key}: ${count} registros`);
      } else {
        backup[key] = { data: null, updatedAt: null };
        console.log(`   ⏭️  ${key}: vacío`);
      }
    } catch (err) {
      console.error(`   ❌ ${key}: ${err.message}`);
      backup[key] = { data: null, error: err.message };
    }
  }

  // Create backup directory
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });

  // Save JSON file with date
  const dateStr = new Date().toISOString().slice(0, 10);
  const timeStr = new Date().toTimeString().slice(0, 5).replace(":", "");
  const filename = `backup-${dateStr}-${timeStr}.json`;
  const filepath = join(BACKUP_DIR, filename);

  writeFileSync(filepath, JSON.stringify(backup, null, 2));
  console.log(`\n✅ Backup guardado: backups/${filename}`);
  console.log(`   ${totalRecords} registros totales`);
  console.log(`   ${(JSON.stringify(backup).length / 1024).toFixed(0)} KB`);

  // Cleanup old backups (keep last MAX_BACKUPS)
  const files = readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("backup-") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length > MAX_BACKUPS) {
    const toDelete = files.slice(MAX_BACKUPS);
    toDelete.forEach(f => {
      unlinkSync(join(BACKUP_DIR, f));
      console.log(`   🗑️  Eliminado backup viejo: ${f}`);
    });
  }

  console.log(`\n✅ Backup completo. ${files.length > MAX_BACKUPS ? files.length - MAX_BACKUPS + " viejos eliminados." : ""}`);
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Error fatal:", err.message);
  process.exit(1);
});
