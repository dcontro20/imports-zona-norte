#!/usr/bin/env node
// Backup de Firestore → JSON local + (opcional) upload a Google Drive.
//
// Modo 1 — Solo local:
//   node scripts/backup.mjs
//
// Modo 2 — Local + Drive (requiere credenciales):
//   Seguí los pasos en scripts/BACKUP_SETUP.md para armar una service account,
//   guardá la key en .credentials/drive-sa.json (gitignoreado).
//   Corré: node scripts/backup.mjs --upload
//
// Cron (macOS LaunchAgent): ver scripts/com.izn.backup.plist

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const UPLOAD = process.argv.includes("--upload");
const QUIET = process.argv.includes("--quiet");
const log = (...args) => { if (!QUIET) console.log(...args); };

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

const BACKUP_DIR = join(PROJECT_ROOT, "backups");
const MAX_LOCAL_BACKUPS = 30;

// ID de la carpeta de Drive donde se subían los backups automáticos.
// Para usar --upload hay que compartirla con el service account email.
const DRIVE_FOLDER_ID = "1d57fOksNJePjSM1oC4c994z_UdAUnnuv";

async function main() {
  log("🔄 Imports Zona Norte — Backup");
  log(`   ${new Date().toLocaleString("es-AR")}\n`);

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  try {
    await signInWithEmailAndPassword(auth, "dcontro20@gmail.com", "Poncharelo20!");
    log("✅ Autenticado en Firebase");
  } catch (err) {
    console.error("❌ Error de autenticación:", err.message);
    process.exit(1);
  }

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
        log(`   📦 ${key}: ${count} registros`);
      } else {
        backup[key] = { data: null, updatedAt: null };
      }
    } catch (err) {
      console.error(`   ❌ ${key}: ${err.message}`);
      backup[key] = { data: null, error: err.message };
    }
  }

  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });

  const dateStr = new Date().toISOString().slice(0, 10);
  const timeStr = new Date().toTimeString().slice(0, 5).replace(":", "");
  const filename = `backup-${dateStr}-${timeStr}.json`;
  const filepath = join(BACKUP_DIR, filename);

  const content = JSON.stringify(backup, null, 2);
  writeFileSync(filepath, content);
  log(`\n✅ Backup local: backups/${filename}`);
  log(`   ${totalRecords} registros · ${(content.length / 1024).toFixed(0)} KB`);

  // Cleanup locales viejos (mantiene MAX_LOCAL_BACKUPS)
  const files = readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("backup-") && f.endsWith(".json"))
    .sort().reverse();
  if (files.length > MAX_LOCAL_BACKUPS) {
    files.slice(MAX_LOCAL_BACKUPS).forEach(f => {
      unlinkSync(join(BACKUP_DIR, f));
      log(`   🗑️  Eliminado viejo: ${f}`);
    });
  }

  // Upload a Drive (opcional, requiere service account)
  if (UPLOAD) {
    await uploadToDrive(filepath, filename, content);
  }

  process.exit(0);
}

async function uploadToDrive(filepath, filename, content) {
  const credPath = join(PROJECT_ROOT, ".credentials", "drive-sa.json");
  if (!existsSync(credPath)) {
    console.error(`\n❌ Upload a Drive falló — falta service account key en:`);
    console.error(`   ${credPath}`);
    console.error(`   Seguí los pasos en scripts/BACKUP_SETUP.md`);
    return;
  }

  let googleapis;
  try {
    googleapis = await import("googleapis");
  } catch {
    console.error(`\n❌ Falta dependencia 'googleapis'. Instalala con:`);
    console.error(`   npm install googleapis`);
    return;
  }

  const { google } = googleapis;
  const credentials = JSON.parse(readFileSync(credPath, "utf8"));
  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ["https://www.googleapis.com/auth/drive.file"]
  );
  await auth.authorize();

  const drive = google.drive({ version: "v3", auth });

  log(`\n☁️  Subiendo a Drive...`);
  const res = await drive.files.create({
    requestBody: {
      name: `IZN_Backup_${filename.replace(/^backup-/, "").replace(".json", "")}.json`,
      parents: [DRIVE_FOLDER_ID],
      mimeType: "application/json",
    },
    media: {
      mimeType: "application/json",
      body: content,
    },
    fields: "id, name, webViewLink",
  });
  log(`✅ Drive: ${res.data.name}`);
  log(`   ${res.data.webViewLink}`);
}

main().catch(err => {
  console.error("❌ Error fatal:", err.message);
  process.exit(1);
});
