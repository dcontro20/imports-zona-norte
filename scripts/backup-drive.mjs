#!/usr/bin/env node
// Backup + upload to Google Drive
// Run: node scripts/backup-drive.mjs
// This creates the backup JSON and prints it for the Claude agent to upload via Google Drive MCP

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "fs";
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
const MAX_BACKUPS = 30;

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  await signInWithEmailAndPassword(auth, "dcontro20@gmail.com", "Poncharelo20!");

  const backup = { _meta: { date: new Date().toISOString(), version: "1.0" } };
  let totalRecords = 0;

  for (const key of COLLECTIONS) {
    try {
      const snap = await getDoc(doc(db, "appData", key));
      if (snap.exists()) {
        const raw = snap.data();
        const parsed = JSON.parse(raw.data);
        backup[key] = { data: parsed, updatedAt: raw.updatedAt };
        totalRecords += Array.isArray(parsed) ? parsed.length : 1;
      } else {
        backup[key] = { data: null, updatedAt: null };
      }
    } catch (err) {
      backup[key] = { data: null, error: err.message };
    }
  }

  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });

  const dateStr = new Date().toISOString().slice(0, 10);
  const timeStr = new Date().toTimeString().slice(0, 5).replace(":", "");
  const filename = `backup-${dateStr}-${timeStr}.json`;
  const filepath = join(BACKUP_DIR, filename);

  writeFileSync(filepath, JSON.stringify(backup, null, 2));

  // Cleanup old
  const files = readdirSync(BACKUP_DIR).filter(f => f.startsWith("backup-") && f.endsWith(".json")).sort().reverse();
  if (files.length > MAX_BACKUPS) files.slice(MAX_BACKUPS).forEach(f => unlinkSync(join(BACKUP_DIR, f)));

  // Output for the agent
  console.log(JSON.stringify({
    success: true,
    filename,
    filepath,
    records: totalRecords,
    sizeKB: Math.round(JSON.stringify(backup).length / 1024),
    date: dateStr,
  }));

  process.exit(0);
}

main().catch(err => {
  console.log(JSON.stringify({ success: false, error: err.message }));
  process.exit(1);
});
