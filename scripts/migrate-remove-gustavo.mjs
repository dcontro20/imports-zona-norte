#!/usr/bin/env node
// Migración one-shot: eliminar a Gustavo del sistema reasignando histórico a Diego.
//
// Diego es ahora único dueño 100% de Imports Zona Norte.
//
// Estrategia:
//   - DATA: preservar histórico, reasignar campos {createdBy, person, mpAccount}
//     de "Gustavo"/"MP Gustavo" a "Diego"/"MP Diego". Audit trail con flags
//     _migratedFromGustavo + _originalValue.
//   - partnerWithdrawals: marcar todos los de Gustavo con _historicalArchived
//     (no se borran, quedan visibles pero filtrados de la UI activa).
//   - dailyCashClosures + monthlyClosures: snapshot tiene mpGustavo como key,
//     sumarlo en mpDiego y eliminar.
//
// Uso:
//   node scripts/migrate-remove-gustavo.mjs           → dry-run (reporta sin tocar)
//   node scripts/migrate-remove-gustavo.mjs --apply   → aplica cambios
//
// IMPORTANTE: correr backup antes:
//   node scripts/backup.mjs
//
// El script igual crea un backup en memoria de los docs afectados ANTES de aplicar.

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const firebaseConfig = {
  apiKey: "AIzaSyDAL85SFntaHyupAbrPxJGIpdSSSnecql4",
  authDomain: "imports-zona-norte.firebaseapp.com",
  projectId: "imports-zona-norte",
  storageBucket: "imports-zona-norte.firebasestorage.app",
  messagingSenderId: "255382859803",
  appId: "1:255382859803:web:e263d95ee4a57358d908be"
};

const APPLY = process.argv.includes("--apply");
const MODE = APPLY ? "APPLY" : "DRY-RUN";
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKUPS_DIR = join(PROJECT_ROOT, "backups");

// Mapeo de reemplazos
const REPLACE = {
  // string "Gustavo" → "Diego"
  person: { from: "Gustavo", to: "Diego" },
  // string "MP Gustavo" → "MP Diego"
  mpAccount: { from: "MP Gustavo", to: "MP Diego" },
  // ID corto "mpGustavo" → "mpDiego"
  accountId: { from: "mpGustavo", to: "mpDiego" },
};

const ts = new Date().toISOString();

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadJSON(snap) {
  if (!snap.exists()) return null;
  try {
    return JSON.parse(snap.data().data);
  } catch (e) {
    console.error(`  ⚠️ no se pudo parsear JSON: ${e.message}`);
    return null;
  }
}

function logChange(category, id, before, after, field) {
  console.log(`  · ${category}/${id} :: ${field}: "${before}" → "${after}"`);
}

// ─── Migración de cada colección ───────────────────────────────────────────

function migrateSales(list) {
  let changes = 0;
  const updated = list.map((s) => {
    let modified = false;
    const result = { ...s };

    // createdBy
    if (result.createdBy === REPLACE.person.from) {
      logChange("sales", s.id, result.createdBy, REPLACE.person.to, "createdBy");
      result._originalCreatedBy = result.createdBy;
      result.createdBy = REPLACE.person.to;
      modified = true;
    }

    // payments[].mpAccount
    if (Array.isArray(result.payments)) {
      result.payments = result.payments.map((p, i) => {
        if (p.mpAccount === REPLACE.mpAccount.from) {
          logChange("sales.payments", `${s.id}[${i}]`, p.mpAccount, REPLACE.mpAccount.to, "mpAccount");
          modified = true;
          return { ...p, mpAccount: REPLACE.mpAccount.to, _originalMpAccount: p.mpAccount };
        }
        return p;
      });
    }

    // mpAccount top-level (legacy schema, ventas viejas sin payments[])
    if (result.mpAccount === REPLACE.mpAccount.from) {
      logChange("sales", s.id, result.mpAccount, REPLACE.mpAccount.to, "mpAccount");
      result._originalMpAccount = result.mpAccount;
      result.mpAccount = REPLACE.mpAccount.to;
      modified = true;
    }

    // changeMpAccount (vuelto a MP)
    if (result.changeMpAccount === REPLACE.mpAccount.from) {
      logChange("sales", s.id, result.changeMpAccount, REPLACE.mpAccount.to, "changeMpAccount");
      result._originalChangeMpAccount = result.changeMpAccount;
      result.changeMpAccount = REPLACE.mpAccount.to;
      modified = true;
    }

    if (modified) {
      result._migratedFromGustavo = true;
      result._migratedAt = ts;
      changes++;
    }
    return result;
  });
  return { updated, changes };
}

function migrateWithdrawals(list) {
  let changes = 0;
  const updated = list.map((w) => {
    if (w.person === REPLACE.person.from) {
      logChange("withdrawals", w.id, w.person, REPLACE.person.to, "person");
      changes++;
      return {
        ...w,
        person: REPLACE.person.to,
        _originalPerson: w.person,
        _migratedFromGustavo: true,
        _migratedAt: ts,
      };
    }
    return w;
  });
  return { updated, changes };
}

function migrateCashMovements(list) {
  let changes = 0;
  const updated = list.map((m) => {
    let modified = false;
    const result = { ...m };

    if (result.from === REPLACE.accountId.from) {
      logChange("cashMovements", m.id, result.from, REPLACE.accountId.to, "from");
      result._originalFrom = result.from;
      result.from = REPLACE.accountId.to;
      modified = true;
    }
    if (result.to === REPLACE.accountId.from) {
      logChange("cashMovements", m.id, result.to, REPLACE.accountId.to, "to");
      result._originalTo = result.to;
      result.to = REPLACE.accountId.to;
      modified = true;
    }
    if (result.account === REPLACE.accountId.from) {
      logChange("cashMovements", m.id, result.account, REPLACE.accountId.to, "account");
      result._originalAccount = result.account;
      result.account = REPLACE.accountId.to;
      modified = true;
    }

    if (modified) {
      result._migratedFromGustavo = true;
      result._migratedAt = ts;
      changes++;
    }
    return result;
  });
  return { updated, changes };
}

function migratePartnerWithdrawals(list) {
  // Diego pidió mantener histórico. Solo marcamos como archivado los de Gustavo.
  let changes = 0;
  const updated = list.map((pw) => {
    if (pw.person === REPLACE.person.from && !pw._historicalArchived) {
      console.log(`  · partnerWithdrawals/${pw.id} :: archived (person=Gustavo)`);
      changes++;
      return {
        ...pw,
        _historicalArchived: true,
        _archivedAt: ts,
        _archivedReason: "Gustavo dejó de ser socio. Diego ahora es 100% dueño.",
      };
    }
    return pw;
  });
  return { updated, changes };
}

function migrateDailyClosures(list) {
  // Cada cierre diario tiene un snapshot de saldos por cuenta. Si el snapshot
  // incluye mpGustavo, sumamos su valor en mpDiego y eliminamos la key.
  let changes = 0;
  const updated = list.map((c) => {
    if (!c.balances || typeof c.balances !== "object") return c;
    if (!(REPLACE.accountId.from in c.balances)) return c;

    const gusBal = Number(c.balances[REPLACE.accountId.from]) || 0;
    const diegoBal = Number(c.balances[REPLACE.accountId.to]) || 0;
    console.log(`  · dailyClosures/${c.id || c.date} :: mpGustavo ${gusBal} + mpDiego ${diegoBal} → mpDiego ${diegoBal + gusBal}`);

    const newBalances = { ...c.balances };
    newBalances[REPLACE.accountId.to] = diegoBal + gusBal;
    delete newBalances[REPLACE.accountId.from];

    changes++;
    return {
      ...c,
      balances: newBalances,
      _originalBalances: c.balances,
      _migratedFromGustavo: true,
      _migratedAt: ts,
    };
  });
  return { updated, changes };
}

function migrateMonthlyClosures(list) {
  // Similar a dailyClosures. Los monthly closures pueden tener desglose.
  let changes = 0;
  const updated = list.map((c) => {
    let modified = false;
    const result = { ...c };

    // Si tiene un campo balances con cuentas:
    if (result.balances && typeof result.balances === "object" && REPLACE.accountId.from in result.balances) {
      const gusBal = Number(result.balances[REPLACE.accountId.from]) || 0;
      const diegoBal = Number(result.balances[REPLACE.accountId.to]) || 0;
      console.log(`  · monthlyClosures/${c.id || c.month} :: balances.mpGustavo ${gusBal} → mpDiego (suma ${diegoBal + gusBal})`);
      result._originalBalances = result.balances;
      const nb = { ...result.balances };
      nb[REPLACE.accountId.to] = diegoBal + gusBal;
      delete nb[REPLACE.accountId.from];
      result.balances = nb;
      modified = true;
    }

    // Si tiene desglose por socio (consumoDiego/consumoGustavo, etc) lo mantenemos
    // intacto en _originalDataPartners para auditoría histórica.
    const partnerKeys = ["consumoGustavo", "gustavoTotal", "gustavoBalance", "diegoBalance", "halfProfit"];
    const hasPartner = partnerKeys.some((k) => k in result);
    if (hasPartner && !result._originalDataPartners) {
      const snap = {};
      partnerKeys.forEach((k) => { if (k in result) snap[k] = result[k]; });
      result._originalDataPartners = snap;
      console.log(`  · monthlyClosures/${c.id || c.month} :: archivada metadata de socios → _originalDataPartners`);
      modified = true;
    }

    if (modified) {
      result._migratedFromGustavo = true;
      result._migratedAt = ts;
      changes++;
    }
    return result;
  });
  return { updated, changes };
}

// ─── Main ──────────────────────────────────────────────────────────────────

const COLLECTIONS = [
  { key: "sales", migrate: migrateSales },
  { key: "withdrawals", migrate: migrateWithdrawals },
  { key: "cashMovements", migrate: migrateCashMovements },
  { key: "partnerWithdrawals", migrate: migratePartnerWithdrawals },
  { key: "dailyCashClosures", migrate: migrateDailyClosures },
  { key: "monthlyClosures", migrate: migrateMonthlyClosures },
];

async function main() {
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  MIGRACIÓN: eliminar Gustavo del sistema [MODO: ${MODE}]`);
  console.log("════════════════════════════════════════════════════════════\n");

  if (APPLY) {
    console.log("⚠️  MODO APPLY — se van a escribir cambios reales en Firestore");
    console.log("⚠️  Asegurate que nadie esté usando la app durante esta operación\n");
  } else {
    console.log("ℹ️  Dry-run: solo se reporta qué se cambiaría. Sin escribir nada.\n");
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const password = process.env.FIREBASE_PASSWORD || "Poncharelo20!";
  await signInWithEmailAndPassword(auth, "dcontro20@gmail.com", password);
  console.log("✅ auth OK\n");

  const summary = [];
  const allBackup = {};

  for (const { key, migrate } of COLLECTIONS) {
    console.log(`─── ${key} ─────────────────────────────────`);
    const ref = doc(db, "appData", key);
    const snap = await getDoc(ref);
    const list = loadJSON(snap);

    if (!list) {
      console.log(`  (colección vacía o inexistente, saltando)\n`);
      summary.push({ key, total: 0, changes: 0 });
      continue;
    }

    if (!Array.isArray(list)) {
      console.log(`  (no es array, saltando)\n`);
      summary.push({ key, total: 0, changes: 0 });
      continue;
    }

    allBackup[key] = list; // snapshot pre-migración

    const { updated, changes } = migrate(list);
    summary.push({ key, total: list.length, changes });

    if (changes === 0) {
      console.log(`  ✅ sin cambios necesarios (${list.length} registros)\n`);
      continue;
    }

    console.log(`  📊 ${changes}/${list.length} registros afectados`);

    if (APPLY && changes > 0) {
      await setDoc(ref, {
        data: JSON.stringify(updated),
        updatedAt: ts,
      });
      console.log(`  ✅ aplicado en Firestore\n`);
    } else {
      console.log(`  ℹ️  (dry-run, no se escribió)\n`);
    }
  }

  // Backup pre-migración (siempre, incluso en dry-run, para que Diego lo guarde)
  if (!existsSync(BACKUPS_DIR)) mkdirSync(BACKUPS_DIR, { recursive: true });
  const backupFile = join(BACKUPS_DIR, `pre-migration-gustavo-${ts.replace(/[:.]/g, "-")}.json`);
  writeFileSync(backupFile, JSON.stringify(allBackup, null, 2));
  console.log(`💾 backup pre-migración guardado en: ${backupFile}\n`);

  console.log("════════════════════════════════════════════════════════════");
  console.log(`  RESUMEN [${MODE}]`);
  console.log("════════════════════════════════════════════════════════════");
  summary.forEach(({ key, total, changes }) => {
    const icon = changes > 0 ? "🔧" : "  ";
    console.log(`  ${icon} ${key.padEnd(22)} ${String(changes).padStart(4)} / ${total} registros`);
  });
  const totalChanges = summary.reduce((s, x) => s + x.changes, 0);
  console.log("────────────────────────────────────────────────────────────");
  console.log(`  TOTAL DE CAMBIOS: ${totalChanges}`);
  console.log("════════════════════════════════════════════════════════════\n");

  if (!APPLY && totalChanges > 0) {
    console.log("➡️  Para aplicar los cambios, corré:");
    console.log("    node scripts/migrate-remove-gustavo.mjs --apply\n");
  } else if (APPLY) {
    console.log("✅ Migración completada. Próximos pasos:");
    console.log("   1. Verificar saldos en la app (Caja, Dashboard, Reports)");
    console.log("   2. Continuar con Fase 2 (limpieza de código)\n");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("❌", e.message);
  console.error(e.stack);
  process.exit(1);
});
