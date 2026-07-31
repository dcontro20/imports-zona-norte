#!/usr/bin/env node
// crearJob.mjs — crea un job de búsqueda desde la terminal (herramienta de
// ops/pruebas; la vía normal es la app: Pipeline → 🔎 Descubrir).
// Produce EXACTAMENTE el shape del form de la UI (DiscoverySearchModal +
// crearBusqueda de Pipeline.jsx) y valida con el mismo validarBusqueda.
//
// Uso:
//   node scripts/discovery/crearJob.mjs --termino kiosco --zona "Martínez" [--ubicacion "..."] [--tope 10]
//
// Credenciales: las mismas del worker (ver worker.mjs / DISCOVERY_SETUP.md).
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validarBusqueda, TOPE_DEFAULT } from "../../src/lib/discovery/discoverRun.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function resolveServiceAccount() {
  const env = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (env) return JSON.parse(env);
  const adc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (adc && existsSync(adc)) return JSON.parse(readFileSync(adc, "utf8"));
  const p = join(PROJECT_ROOT, ".credentials", "firebase-admin-sa.json");
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  console.error("❌ Sin credenciales Admin SDK (ver scripts/DISCOVERY_SETUP.md)");
  process.exit(1);
}

// Mismo uid() que helpers.js (timestamp base36 + random) — sin importar src
// con dependencias de browser.
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

const zona = arg("zona").trim();
const busqueda = {
  termino: arg("termino").trim(),
  zona,
  // Misma regla del form: ubicación vacía se compone desde la zona.
  ubicacion: arg("ubicacion").trim() || (zona ? `${zona}, Buenos Aires, Argentina` : ""),
  tope: Number(arg("tope", String(TOPE_DEFAULT))),
};
const probs = validarBusqueda(busqueda);
if (probs.length) {
  console.error("❌ búsqueda inválida:\n  " + probs.join("\n  "));
  process.exit(1);
}

const db = getFirestore(initializeApp({ credential: cert(resolveServiceAccount()) }));
const job = {
  id: uid(), ...busqueda, status: "pendiente", counts: null, error: "",
  createdBy: process.env.USER || "ops", createdAt: new Date().toISOString(),
  startedAt: "", finishedAt: "",
};
await db.collection("discoveryJobs").doc(job.id).set(job);
console.log(`✅ job ${job.id}: "${job.termino}" — ${job.zona} (tope ${job.tope})`);
console.log("   el worker lo toma en su próxima pasada (o corré: node scripts/discovery/worker.mjs)");
