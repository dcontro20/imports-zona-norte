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

// ---- helpers de nombres amigables ----
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES_ABR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const pad2 = (n) => String(n).padStart(2, "0");

function localFileName(date) {
  // Orden-friendly: IZN_Backup_2026-04-22_07h27.json
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  return `IZN_Backup_${y}-${m}-${d}_${hh}h${mm}.json`;
}

function driveFileName(date, records) {
  // Human-friendly: "IZN · Backup del Martes 22 Abr 2026 · 07h27 · 312 registros.json"
  const dia = DIAS[date.getDay()];
  const d = date.getDate();
  const mes = MESES_ABR[date.getMonth()];
  const y = date.getFullYear();
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  return `IZN · Backup del ${dia} ${d} ${mes} ${y} · ${hh}h${mm} · ${records} registros.json`;
}

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

  // Retry con backoff: errores de red (auth/network-request-failed) son
  // comunes si la Mac acaba de despertar y la WiFi todavía no se conectó.
  // 3 intentos con espera de 10s, 30s, 60s.
  const RETRY_DELAYS = [10000, 30000, 60000];
  let lastErr = null;
  for (let attempt = 0; attempt < RETRY_DELAYS.length + 1; attempt++) {
    try {
      await signInWithEmailAndPassword(auth, "dcontro20@gmail.com", "Poncharelo20!");
      log(`✅ Autenticado en Firebase${attempt > 0 ? ` (intento ${attempt + 1})` : ""}`);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      const isNetworkErr = /network|fetch|offline|ENOTFOUND|ECONNREFUSED|timeout/i.test(err.message || err.code || "");
      if (!isNetworkErr || attempt === RETRY_DELAYS.length) break;
      const wait = RETRY_DELAYS[attempt];
      console.error(`⏳ Red no disponible (${err.code || err.message}). Reintentando en ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  if (lastErr) {
    console.error("❌ Error de autenticación:", lastErr.message);
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

  const now = new Date();
  const filename = localFileName(now);
  const filepath = join(BACKUP_DIR, filename);

  const content = JSON.stringify(backup, null, 2);
  writeFileSync(filepath, content);
  log(`\n✅ Backup local: backups/${filename}`);
  log(`   ${totalRecords} registros · ${(content.length / 1024).toFixed(0)} KB`);

  // Cleanup locales viejos (soporta nombres nuevos y legacy)
  const files = readdirSync(BACKUP_DIR)
    .filter(f => (f.startsWith("backup-") || f.startsWith("IZN_Backup_")) && f.endsWith(".json"))
    .sort().reverse();
  if (files.length > MAX_LOCAL_BACKUPS) {
    files.slice(MAX_LOCAL_BACKUPS).forEach(f => {
      unlinkSync(join(BACKUP_DIR, f));
      log(`   🗑️  Eliminado viejo: ${f}`);
    });
  }

  // Upload a Drive (opcional, requiere OAuth)
  if (UPLOAD) {
    await uploadToDrive(content, driveFileName(now, totalRecords));
  }

  process.exit(0);
}

async function uploadToDrive(content, driveName) {
  const tokenPath = join(PROJECT_ROOT, ".credentials", "drive-oauth-token.json");
  if (!existsSync(tokenPath)) {
    console.error(`\n❌ Upload a Drive falló — falta token OAuth en:`);
    console.error(`   ${tokenPath}`);
    console.error(`\n   Corré una vez:  node scripts/auth-oauth.mjs`);
    console.error(`   Después el backup automático funciona sin intervención.`);
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
  const tokenData = JSON.parse(readFileSync(tokenPath, "utf8"));
  const oauth2 = new google.auth.OAuth2(tokenData.client_id, tokenData.client_secret);
  oauth2.setCredentials({
    refresh_token: tokenData.refresh_token,
    access_token: tokenData.access_token,
    expiry_date: tokenData.expiry_date,
  });

  // Persistir access_token refrescado cuando googleapis lo rote
  oauth2.on("tokens", (newTokens) => {
    const merged = { ...tokenData, ...newTokens };
    try { writeFileSync(tokenPath, JSON.stringify(merged, null, 2)); } catch {}
  });

  const drive = google.drive({ version: "v3", auth: oauth2 });

  log(`\n☁️  Subiendo a Drive...`);
  try {
    const res = await drive.files.create({
      requestBody: {
        name: driveName,
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
  } catch (err) {
    console.error(`❌ Drive upload falló: ${err.message}`);
    if (err.message.includes("invalid_grant")) {
      console.error(`   El refresh token expiró. Corré:  node scripts/auth-oauth.mjs`);
    }
  }
}

main().catch(err => {
  console.error("❌ Error fatal:", err.message);
  process.exit(1);
});
