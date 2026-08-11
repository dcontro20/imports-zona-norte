// migrate-v250-colores.mjs — unifica "V250 Black / Gold / Pink" en UN modelo
// "V250" con el color plegado al sabor.
//
// POR QUÉ: el color es una variante del MISMO equipo (mismo costo, misma
// lista de sabores), no un modelo distinto. Como el motor precia por
// marca+modelo, hoy salen 3 renglones idénticos en la lista mayorista — ruido
// para el kiosquero y tres filas que siempre van a moverse juntas.
//
// QUÉ HACE, exactamente:
//   model: "V250 Black"  →  "V250"
//   flavor: "Banana Ice" →  "Banana Ice · Black"
// El `id` de cada producto NO cambia: ventas, stock, mermas y el historial
// siguen apuntando al mismo registro. Tampoco cambia el costo ni el stock.
// El color se conserva en el sabor, así que la granularidad de stock por
// color se mantiene intacta (son SKUs distintos para preparar el pedido).
//
// USO (dry-run por default, no escribe nada):
//   GOOGLE_APPLICATION_CREDENTIALS=<sa.json> node scripts/migrate-v250-colores.mjs
//   GOOGLE_APPLICATION_CREDENTIALS=<sa.json> node scripts/migrate-v250-colores.mjs --apply
//
// Correr con la app CERRADA (escribe appData/products completo; si alguien
// edita stock en simultáneo, una de las dos escrituras pierde).
// Después de aplicar: republicar la lista desde 🏷️ Lista de precios.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

// Modelos a unificar: { marca, modeloFinal, variantes: [sufijos] }
const UNIFICAR = [
  { marca: "Ignite", modeloFinal: "V250", variantes: ["Black", "Gold", "Pink"] },
];

function resolveServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const adc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (adc && existsSync(adc)) return JSON.parse(readFileSync(adc, "utf8"));
  const p = join(PROJECT_ROOT, ".credentials", "firebase-admin-sa.json");
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  console.error("✗ Sin credencial (FIREBASE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS / .credentials/)");
  process.exit(1);
}

const db = getFirestore(initializeApp({ credential: cert(resolveServiceAccount()) }));
const ref = db.collection("appData").doc("products");
const snap = await ref.get();
if (!snap.exists) { console.error("✗ No existe appData/products"); process.exit(1); }
const products = JSON.parse(snap.data().data);

let tocados = 0;
const porModeloFinal = new Map();
const migrados = products.map((p) => {
  if (!p || p.isDeleted) return p;
  for (const { marca, modeloFinal, variantes } of UNIFICAR) {
    if (p.brand !== marca) continue;
    const color = variantes.find((v) => p.model === `${modeloFinal} ${v}`);
    if (!color) continue;
    const sabor = String(p.flavor || "").trim();
    // Idempotente: si el color ya está plegado, no lo duplica.
    const flavor = sabor.endsWith(`· ${color}`) ? sabor : `${sabor} · ${color}`;
    tocados++;
    const clave = `${marca}|${modeloFinal}`;
    porModeloFinal.set(clave, (porModeloFinal.get(clave) || 0) + 1);
    return { ...p, model: modeloFinal, flavor };
  }
  return p;
});

// Control de seguridad: ningún (marca, modelo, sabor) puede quedar duplicado.
const vistos = new Map();
const duplicados = [];
for (const p of migrados) {
  if (!p || p.isDeleted) continue;
  const k = `${p.brand}|${p.model}|${p.flavor}`;
  if (vistos.has(k)) duplicados.push({ k, ids: [vistos.get(k), p.id] });
  else vistos.set(k, p.id);
}

console.log(`Productos activos: ${products.filter((p) => p && !p.isDeleted).length}`);
console.log(`A migrar: ${tocados}`);
for (const [clave, n] of porModeloFinal) console.log(`  ${clave.replace("|", " ")} ← ${n} registros`);
const ejemplos = migrados.filter((p, i) => p !== products[i]).slice(0, 5);
console.log("\nEjemplos:");
for (const p of ejemplos) {
  const antes = products.find((o) => o.id === p.id);
  console.log(`  "${antes.model}" / "${antes.flavor}"  →  "${p.model}" / "${p.flavor}"`);
}
if (duplicados.length > 0) {
  console.error(`\n✗ ABORTADO: ${duplicados.length} combinaciones marca+modelo+sabor quedarían duplicadas:`);
  duplicados.slice(0, 10).forEach((d) => console.error(`   ${d.k} → ${d.ids.join(" y ")}`));
  process.exit(1);
}

if (!APPLY) {
  console.log("\n(dry-run — no se escribió nada. Agregá --apply para aplicar.)");
  process.exit(0);
}

// Respaldo local antes de escribir.
const backup = join(PROJECT_ROOT, "backups", `products_pre_v250_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`);
writeFileSync(backup, JSON.stringify(products, null, 2));
await ref.set({ data: JSON.stringify(migrados), updatedAt: new Date().toISOString() });
console.log(`\n✓ Aplicado: ${tocados} productos migrados. Respaldo previo: ${backup}`);
console.log("  Siguiente paso: republicar la lista desde 🏷️ Lista de precios.");
