#!/usr/bin/env node
// worker.mjs — el worker del Discovery Engine (contrato §3/§4).
// Corre en la Mac (LaunchAgent com.izn.discovery cada 5 min, o a mano):
//   node scripts/discovery/worker.mjs
// Toma los jobs "pendiente" de discoveryJobs (claim TRANSACCIONAL — dos
// instancias solapadas no procesan el mismo job), corre el pipeline PROPIO
// (adapter gosom → discoverRun → mapProspect, todo de src/lib/discovery/),
// escribe el staging en discoveryResults vía Admin SDK y cierra el job.
//
// Compromisos del contrato que este script cumple:
//   - JAMÁS escribe appData (solo LEE prospects/clients/discoverySuppressed
//     para armar identidades; el merge de la app es de la app).
//   - Fail-loud: cualquier error va TEXTUAL al campo error del job.
//   - P2: validarBusqueda ANTES de tocar la red (además de la validación
//     que ya hizo la app al crear el job).
//
// Credenciales Admin SDK (orden de precedencia):
//   1. env FIREBASE_SERVICE_ACCOUNT → JSON string de la service account
//   2. env GOOGLE_APPLICATION_CREDENTIALS → ruta al JSON (convención ADC)
//   3. .credentials/firebase-admin-sa.json (gitignoreado)
// Setup completo: scripts/DISCOVERY_SETUP.md
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validarBusqueda, discoverRun } from "../../src/lib/discovery/discoverRun.js";
import { rawToProspect } from "../../src/lib/discovery/mapProspect.js";
import { identidadesExistentes } from "../../src/lib/discovery/discoveryImport.js";
import { descubrirConGosom } from "./gosomAdapter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");
const log = (...args) => console.log(new Date().toISOString(), ...args);

function resolveServiceAccount() {
  const env = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (env) {
    try { return JSON.parse(env); }
    catch (e) { console.error("❌ FIREBASE_SERVICE_ACCOUNT no es JSON válido:", e.message); process.exit(1); }
  }
  const adc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (adc && existsSync(adc)) return JSON.parse(readFileSync(adc, "utf8"));
  const p = join(PROJECT_ROOT, ".credentials", "firebase-admin-sa.json");
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  console.error("❌ Sin credenciales Admin SDK.");
  console.error("   Env FIREBASE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS,");
  console.error("   o .credentials/firebase-admin-sa.json");
  console.error("   Cómo generarla: scripts/DISCOVERY_SETUP.md");
  process.exit(1);
}

const db = getFirestore(initializeApp({ credential: cert(resolveServiceAccount()) }));

// Lee una key de appData (formato: doc {data: "<JSON string>"}), tolerante.
async function readAppData(key) {
  try {
    const snap = await db.collection("appData").doc(key).get();
    const parsed = JSON.parse(snap.data()?.data ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Claim transaccional: pendiente → en_curso, o null si otra instancia ganó.
async function claimJob(jobId) {
  const ref = db.collection("discoveryJobs").doc(jobId);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.data()?.status !== "pendiente") return null;
      tx.update(ref, { status: "en_curso", startedAt: new Date().toISOString() });
      return snap.data();
    });
  } catch {
    return null;
  }
}

async function procesarJob(jobId, job) {
  const ref = db.collection("discoveryJobs").doc(jobId);
  try {
    // P2: validar ANTES de tocar la red (fail-loud si el job vino malformado).
    const probs = validarBusqueda(job);
    if (probs.length) throw new Error(probs.join("; "));

    // Estado vivo → identidades para el dedup del runner + ledger de suprimidos.
    const [prospects, clients, suprimidos] = await Promise.all([
      readAppData("prospects"), readAppData("clients"), readAppData("discoverySuppressed"),
    ]);
    const stagingSnap = await db.collection("discoveryResults").get();
    const staging = stagingSnap.docs.map(d => d.data());
    const existentes = identidadesExistentes({ prospects, clients, staging });

    log(`  scrapeando "${job.termino}" en "${job.ubicacion}" (tope ${job.tope})...`);
    const raws = await descubrirConGosom({ termino: job.termino, ubicacion: job.ubicacion, tope: job.tope });

    const res = discoverRun({ raws, tope: job.tope, existentes, suprimidos });
    const at = new Date().toISOString();
    const prospectos = res.descubiertos.map(d => rawToProspect(d, {
      zona: job.zona, termino: job.termino, ubicacion: job.ubicacion, fecha: at.slice(0, 10),
    }));

    await db.collection("discoveryResults").doc(jobId).set({
      jobId, zona: job.zona, termino: job.termino, at, prospectos,
    });
    const counts = {
      descubiertos: prospectos.length,
      suprimidos: res.saltadosSuprimidos,
      duplicados: res.saltadosDuplicados,
    };
    await ref.update({ status: "listo", counts, error: "", finishedAt: new Date().toISOString() });
    log(`  ✅ listo: ${counts.descubiertos} descubiertos · ${counts.duplicados} dup · ${counts.suprimidos} suprimidos`);
  } catch (e) {
    // Fail-loud al job: el error textual, sin resumir (contrato §3).
    const error = String(e?.message || e);
    log(`  ⚠️ error: ${error}`);
    await ref.update({ status: "error", error, finishedAt: new Date().toISOString() }).catch(() => {});
  }
}

async function main() {
  const snap = await db.collection("discoveryJobs").where("status", "==", "pendiente").get();
  const pendientes = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  if (!pendientes.length) { log("sin jobs pendientes"); return 0; }
  log(`${pendientes.length} job(s) pendiente(s)`);
  for (const j of pendientes) {
    const claimed = await claimJob(j.id);
    if (!claimed) { log(`  job ${j.id} ya tomado por otra instancia — salteo`); continue; }
    log(`job ${j.id}: "${j.termino}" — ${j.zona}`);
    await procesarJob(j.id, claimed);   // serial a propósito (rate limiting humano)
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => { console.error("❌ worker crash:", e); process.exit(1); },
);
