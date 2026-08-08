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
//
// CI (GitHub Actions): ver .github/workflows/backup-diario.yml + docs/BACKUP_AUTOMATION.md
//
// Credenciales (orden de precedencia):
//   1. env var FIREBASE_PASSWORD → password de Firebase Auth
//   2. fallback hardcoded "Poncharelo20!" (solo para LaunchAgent local)
//   1. env var GOOGLE_DRIVE_TOKEN → JSON string del OAuth token
//   2. fallback .credentials/drive-oauth-token.json
// En CI (GITHUB_ACTIONS=true) las env vars son OBLIGATORIAS y el script
// crashea si faltan para evitar silent fallback.

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const UPLOAD = process.argv.includes("--upload");
const QUIET = process.argv.includes("--quiet");
const IS_CI = process.env.GITHUB_ACTIONS === "true";
const log = (...args) => { if (!QUIET) console.log(...args); };

// Resuelve credenciales con precedencia env > archivo local > hardcoded.
// En CI exige env vars para evitar usar fallbacks inseguros silenciosamente.
function resolveFirebasePassword() {
  const envPass = process.env.FIREBASE_PASSWORD;
  if (envPass) return envPass;
  // Sin fallback hardcodeado (seguridad): la password NUNCA vive en el repo.
  // Local: exportá FIREBASE_PASSWORD antes de correr, o ponela en
  // ~/.izn-secrets.env y sourcealo desde el LaunchAgent.
  // CI: configurala como secret de GitHub Actions.
  console.error("❌ FIREBASE_PASSWORD no está seteada.");
  if (IS_CI) {
    console.error("   Configurala en: GitHub → Settings → Secrets and variables → Actions");
  } else {
    console.error("   Local: export FIREBASE_PASSWORD='...' antes de correr el backup.");
  }
  process.exit(1);
}

function resolveDriveToken() {
  const envToken = process.env.GOOGLE_DRIVE_TOKEN;
  if (envToken) {
    try { return JSON.parse(envToken); }
    catch (e) { console.error("❌ GOOGLE_DRIVE_TOKEN no es JSON válido:", e.message); process.exit(1); }
  }
  if (IS_CI) {
    console.error("❌ CI detectado pero GOOGLE_DRIVE_TOKEN no está seteada.");
    console.error("   Configurala en: GitHub → Settings → Secrets and variables → Actions");
    console.error("   Valor: contenido completo de .credentials/drive-oauth-token.json");
    process.exit(1);
  }
  const tokenPath = join(PROJECT_ROOT, ".credentials", "drive-oauth-token.json");
  if (!existsSync(tokenPath)) return null;
  return JSON.parse(readFileSync(tokenPath, "utf8"));
}

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
  "monthlyClosures", "partnerWithdrawals", "exchangeRate", "auditLog",
  // B3 (ciclo de resiliencia 2026-08-01): las colecciones del CRM de
  // prospección — desde el Discovery Engine acá vive data de negocio real.
  "prospects", "visits", "routes", "discoverySuppressed",
  // Pricing Engine (2026-08-07): política comercial (objeto, no array) +
  // listas publicadas (snapshots inmutables — perderlas rompe la trazabilidad
  // de qué versión respondió cada cotización, RN-11/12).
  "pricingPolicy", "priceLists",
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
      await signInWithEmailAndPassword(auth, "dcontro20@gmail.com", resolveFirebasePassword());
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
    const uploaded = await uploadToDrive(content, driveFileName(now, totalRecords));
    if (!uploaded) {
      // Un verde mentiroso es peor que un rojo honesto: si el respaldo no
      // llegó a Drive, el proceso FALLA (el Action se pone rojo y GitHub
      // manda mail). El backup local igual quedó escrito más arriba.
      console.error(`\n❌ BACKUP INCOMPLETO: el archivo local existe pero NO se subió a Drive.`);
      process.exit(1);
    }
    await stampBackupStatus(db, now, totalRecords);
  }

  process.exit(0);
}

// Deja registro en Firestore del último backup que SÍ llegó a Drive.
// El Dashboard lee appData/backupStatus y alerta si quedó viejo — así un
// backup roto se ve en la app aunque nadie mire los logs del Action.
async function stampBackupStatus(db, date, records) {
  const iso = date.toISOString();
  const payload = { lastDriveBackupAt: iso, records, source: IS_CI ? "github-actions" : "local" };
  try {
    await setDoc(doc(db, "appData", "backupStatus"), {
      data: JSON.stringify(payload),
      updatedAt: iso,
    });
    log(`📌 backupStatus sellado en Firestore (${iso})`);
  } catch (err) {
    // El backup en Drive ya está a salvo: no convertimos un backup bueno en
    // run fallida solo porque el sello no se pudo escribir. Pero avisamos.
    console.error(`⚠️  No se pudo sellar backupStatus en Firestore: ${err.message}`);
    console.error(`   (el backup en Drive está OK; la alerta del Dashboard puede quedar desactualizada)`);
  }
}

// Devuelve true solo si el archivo quedó efectivamente en Drive.
// Cualquier otro camino (sin token, sin googleapis, error de API) → false.
async function uploadToDrive(content, driveName) {
  const tokenData = resolveDriveToken();
  if (!tokenData) {
    console.error(`\n❌ Upload a Drive falló — no hay token disponible.`);
    console.error(`   Local: corré una vez  node scripts/auth-oauth.mjs`);
    console.error(`   CI: seteá GOOGLE_DRIVE_TOKEN como secret en GitHub.`);
    return false;
  }

  let googleapis;
  try {
    googleapis = await import("googleapis");
  } catch {
    console.error(`\n❌ Falta dependencia 'googleapis'. Instalala con:`);
    console.error(`   npm install googleapis`);
    return false;
  }

  const { google } = googleapis;
  const oauth2 = new google.auth.OAuth2(tokenData.client_id, tokenData.client_secret);
  oauth2.setCredentials({
    refresh_token: tokenData.refresh_token,
    access_token: tokenData.access_token,
    expiry_date: tokenData.expiry_date,
  });

  // Persistir access_token refrescado cuando googleapis lo rote.
  // En CI esto es no-op (no hay archivo local), igual la next run re-usa el
  // refresh_token del secret (que no cambia). Solo útil en local.
  const tokenPath = join(PROJECT_ROOT, ".credentials", "drive-oauth-token.json");
  if (!IS_CI && existsSync(tokenPath)) {
    oauth2.on("tokens", (newTokens) => {
      const merged = { ...tokenData, ...newTokens };
      try { writeFileSync(tokenPath, JSON.stringify(merged, null, 2)); } catch {}
    });
  }

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
    return true;
  } catch (err) {
    console.error(`❌ Drive upload falló: ${err.message}`);
    if (err.message.includes("invalid_grant")) {
      console.error(`   El refresh token expiró. Corré:  node scripts/auth-oauth.mjs`);
    }
    return false;
  }
}

main().catch(err => {
  console.error("❌ Error fatal:", err.message);
  process.exit(1);
});
