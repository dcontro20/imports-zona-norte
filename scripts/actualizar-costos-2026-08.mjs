// actualizar-costos-2026-08.mjs — lista de costos del proveedor de agosto 2026.
//
// QUÉ HACE:
//   1. ACTUALIZA el costo (costUSDT) de 5 modelos que ya existen — se aplica a
//      TODOS los sabores del modelo, que es como precia el motor.
//   2. AGREGA 5 modelos que no están en el sistema. Un modelo existe recién
//      cuando tiene al menos un producto (la app vive a nivel SABOR), así que
//      crea UN renglón por modelo con el sabor en PLACEHOLDER y stock 0: lo
//      mínimo para que el modelo entre a la lista de precios. Los sabores
//      reales se cargan cuando llega la mercadería.
//   3. VERIFICA con el motor real que el escalón de entrada quede exactamente
//      en la grilla aprobada por Gustavo (GRILLA_ESPERADA). Si un solo precio
//      no da, NO escribe: el ancla es la grilla, no el motor.
//
// NINGÚN modelo se da de baja. Los costos van SIN el 13% de envío — eso lo
// suma el motor (RN-01, costoAdicionalPct de la política).
//
// USO (dry-run por default, no escribe nada):
//   GOOGLE_APPLICATION_CREDENTIALS=<sa.json> node scripts/actualizar-costos-2026-08.mjs
//   GOOGLE_APPLICATION_CREDENTIALS=<sa.json> node scripts/actualizar-costos-2026-08.mjs --apply
//
// Correr con la app CERRADA (escribe appData/products completo; si alguien edita
// stock en simultáneo, una de las dos escrituras pierde).
// Después de aplicar: republicar la lista desde 🏷️ Lista de precios.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { productosParaMotor } from "../src/lib/pricingAdapter.js";
import { generarLista } from "../src/lib/pricingEngine.js";
import { normalizarPolitica } from "../src/lib/pricingPolicy.js";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

// ---------------------------------------------------------------------------
// LA LISTA DEL PROVEEDOR (agosto 2026). Costos SIN envío.
// ---------------------------------------------------------------------------
const ACTUALIZAR = [
  { marca: "Geek Bar", modelo: "Pulse X", costo: 6.0 },
  { marca: "Lost Mary", modelo: "Dura", costo: 8.0 },
  { marca: "Elfbar", modelo: "TE", costo: 9.5 },
  { marca: "Ignite", modelo: "V400 Ice", costo: 10.0 },
  { marca: "Elfbar", modelo: "Ice King", costo: 10.5 },
];

// Modelos nuevos. `puffs` sale del nombre, como el resto del catálogo
// (V400 → 40000, V500 → 50000, Z 35K → 35000).
// Sin precio MINORISTA: no lo definimos todavía. Consecuencia conocida: la
// validación de conflicto de canal (RN-14) no corre para estos modelos hasta
// que se cargue `priceUSD` en la ficha. Es preferible a inventarlo.
const AGREGAR = [
  { marca: "Geek Bar", modelo: "Z 35K", costo: 7.0, puffs: "35000" },
  { marca: "HQD", modelo: "30K Ice Glaze Plus", costo: 9.0, puffs: "30000" },
  { marca: "Ignite", modelo: "V400 Sweet", costo: 10.5, puffs: "40000" },
  { marca: "Ignite", modelo: "V400 V-Mix", costo: 11.5, puffs: "40000" },
  { marca: "Ignite", modelo: "V500", costo: 12.0, puffs: "50000" },
];

const SABOR_PLACEHOLDER = "A definir";

// Grilla aprobada por Gustavo para el escalón de ENTRADA (20-49) con el
// catálogo completo de 21 modelos. Es el contrato: el script no publica nada
// que no la reproduzca.
const GRILLA_ESPERADA = {
  "Geek Bar|Pulse X": 9.5,
  "Lost Mary|MO": 10.5,
  "Geek Bar|Z 35K": 11.0,
  "Nikbar|30K": 12.0,
  "Ignite|V150 Pro": 13.0,
  "Lost Mary|Dura": 13.0,
  "Supreme|18K": 13.0,
  "Lost Mary|Mixer+": 13.5,
  "Elfbar|GH": 14.0,
  "Nikbar|Ice Baby": 14.5,
  "Nikbar|Triple Chill": 14.5,
  "HQD|30K Ice Glaze Plus": 14.5,
  "Elfbar|TE": 15.0,
  "Ignite|V250": 16.0,
  "Ignite|V400 Ice": 16.0,
  "Elfbar|Ice King": 16.5,
  "Ignite|V300": 16.5,
  "Ignite|V400 Sweet": 16.5,
  "Ignite|V300 Ultra Slim": 17.5,
  "Ignite|V400 V-Mix": 18.5,
  "Ignite|V500": 19.0,
};

// ---------------------------------------------------------------------------
function resolveServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const adc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (adc && existsSync(adc)) return JSON.parse(readFileSync(adc, "utf8"));
  const p = join(PROJECT_ROOT, ".credentials", "firebase-admin-sa.json");
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  console.error("✗ Sin credencial (FIREBASE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS / .credentials/)");
  process.exit(1);
}

// Mismo formato de id que el helper uid() de la app.
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const usd = (n) => Number(n).toFixed(2);

const db = getFirestore(initializeApp({ credential: cert(resolveServiceAccount()) }));
const ref = db.collection("appData").doc("products");
const snap = await ref.get();
if (!snap.exists) { console.error("✗ No existe appData/products"); process.exit(1); }
const products = JSON.parse(snap.data().data);
const activos = products.filter((p) => p && !p.isDeleted);

// La política vive en appData/pricingPolicy; si todavía no se guardó desde la
// pantalla, normalizarPolitica devuelve los defaults aprobados.
const politicaSnap = await db.collection("appData").doc("pricingPolicy").get();
const politicaCruda = politicaSnap.exists ? JSON.parse(politicaSnap.data().data) : null;
const politica = normalizarPolitica(politicaCruda);
console.log(`Política: ${politicaSnap.exists ? "appData/pricingPolicy" : "DEFAULTS (el doc todavía no existe)"}`);
console.log(`  envío ${(politica.costoAdicionalPct * 100).toFixed(0)}% · escalones ${politica.escalones.map((e) => `${e.desde}${e.hasta == null ? "+" : "-" + e.hasta}@${(e.margen * 100).toFixed(0)}%`).join(" ")} · piso ${(politica.margenMinimo * 100).toFixed(0)}%`);

// ---- 1. Actualizaciones -----------------------------------------------------
const errores = [];
let saboresTocados = 0;
const cambiosCosto = [];
for (const { marca, modelo, costo } of ACTUALIZAR) {
  const sabores = activos.filter((p) => p.brand === marca && p.model === modelo);
  if (sabores.length === 0) { errores.push(`ACTUALIZAR: no existe "${marca} ${modelo}" (¿cambió el nombre?)`); continue; }
  const antes = [...new Set(sabores.map((p) => Number(p.costUSDT) || 0))];
  cambiosCosto.push({ marca, modelo, antes, costo, sabores: sabores.length });
  saboresTocados += sabores.filter((p) => Number(p.costUSDT) !== costo).length;
}

// ---- 2. Altas ---------------------------------------------------------------
const nuevos = [];
for (const nuevo of AGREGAR) {
  const yaEsta = activos.some((p) => p.brand === nuevo.marca && p.model === nuevo.modelo);
  if (yaEsta) { errores.push(`AGREGAR: "${nuevo.marca} ${nuevo.modelo}" YA existe — no se duplica, revisá si querías actualizarlo`); continue; }
  nuevos.push({
    id: uid(),
    brand: nuevo.marca,
    model: nuevo.modelo,
    flavor: SABOR_PLACEHOLDER,
    puffs: nuevo.puffs || "",
    priceUSD: "",
    priceARS: "",
    stock: 0,
    costUSDT: nuevo.costo,
  });
}

// ---- Producto resultante ----------------------------------------------------
const costoPorClave = Object.fromEntries(ACTUALIZAR.map((a) => [`${a.marca}|${a.modelo}`, a.costo]));
const migrados = [
  ...products.map((p) => {
    if (!p || p.isDeleted) return p;
    const nuevo = costoPorClave[`${p.brand}|${p.model}`];
    return nuevo != null && Number(p.costUSDT) !== nuevo ? { ...p, costUSDT: nuevo } : p;
  }),
  ...nuevos,
];

// ---- 3. Verificación contra la grilla aprobada ------------------------------
const { productosMotor, inconsistencias } = productosParaMotor(migrados);
const lista = generarLista(productosMotor, politica);
const porId = new Map(lista.filas.map((f) => [f.id, f]));

const desvios = [];
const filasVerificadas = [];
for (const p of productosMotor) {
  const fila = porId.get(p.id);
  const esperado = GRILLA_ESPERADA[p.id];
  if (!fila) { desvios.push(`${p.id.replace("|", " ")}: sin costo, no entra a la lista (RN-18)`); continue; }
  const entrada = fila.precios[0].precio;
  if (esperado == null) desvios.push(`${p.id.replace("|", " ")}: no está en la grilla esperada (¿modelo nuevo sin aprobar?)`);
  else if (Math.abs(entrada - esperado) > 1e-9) desvios.push(`${p.id.replace("|", " ")}: ${usd(entrada)} ≠ esperado ${usd(esperado)}`);
  filasVerificadas.push({ p, fila, esperado });
}
for (const id of Object.keys(GRILLA_ESPERADA)) {
  if (!productosMotor.some((p) => p.id === id)) desvios.push(`${id.replace("|", " ")}: esperado en la grilla y NO está en el catálogo`);
}

// ---- Reporte ----------------------------------------------------------------
console.log(`\nCatálogo: ${new Set(activos.map((p) => `${p.brand}|${p.model}`)).size} modelos → ${productosMotor.length} (${activos.length} sabores activos → ${activos.length + nuevos.length})`);

console.log(`\n── ACTUALIZAR (${cambiosCosto.length}) ──`);
for (const c of cambiosCosto) {
  const antes = c.antes.map(usd).join("/");
  const igual = c.antes.length === 1 && Math.abs(c.antes[0] - c.costo) < 1e-9;
  console.log(`  ${(c.marca + " " + c.modelo).padEnd(26)} ${antes.padStart(6)} → ${usd(c.costo).padStart(5)}   ${igual ? "(ya estaba igual)" : `${c.sabores} sabor${c.sabores !== 1 ? "es" : ""}`}`);
}

console.log(`\n── AGREGAR (${nuevos.length}) ──`);
for (const n of nuevos) {
  console.log(`  ${(n.brand + " " + n.model).padEnd(26)} costo ${usd(n.costUSDT).padStart(5)} · ${n.puffs || "?"} puffs · sabor "${n.flavor}" · stock 0 · sin precio minorista`);
}

console.log(`\n── LISTA RESULTANTE (${lista.filas.length} modelos, escalones ${politica.escalones.map((e) => (e.hasta == null ? `${e.desde}+` : `${e.desde}-${e.hasta}`)).join(" / ")}) ──`);
const ordenadas = filasVerificadas.slice().sort((a, b) => a.fila.precios[0].precio - b.fila.precios[0].precio);
for (const { p, fila, esperado } of ordenadas) {
  const precios = fila.precios.map((e) => usd(e.precio).padStart(6)).join(" ");
  const ultimo = fila.precios[fila.precios.length - 1];
  const ok = esperado != null && Math.abs(fila.precios[0].precio - esperado) < 1e-9;
  const margenFinal = (ultimo.margenReal * 100).toFixed(1);
  const cerca = ultimo.margenReal < politica.margenMinimo + 0.01;
  console.log(
    `  ${ok ? "✓" : "✗"} ${(p.marca + " " + p.modelo).padEnd(26)} costo ${usd(p.costo).padStart(5)} →${precios}   ` +
    `margen ${politica.escalones[politica.escalones.length - 1].desde}+ ${margenFinal.padStart(5)}%${cerca ? "  ⚠️ al filo del piso" : ""}`
  );
}

if (inconsistencias.filter((i) => i.tipo === "costo").length > 0) {
  console.log(`\n⚠️ Costos mezclados entre sabores (la lista usa el más alto):`);
  for (const i of inconsistencias.filter((x) => x.tipo === "costo")) console.log(`   ${i.id.replace("|", " ")} → ${i.valores.map(usd).join(" / ")}`);
}
if (lista.sinCosto.length > 0) console.log(`\n⚠️ Sin costo, quedan afuera (RN-18): ${lista.sinCosto.map((s) => s.replace("|", " ")).join(" · ")}`);
if (lista.bloqueados.length > 0) {
  console.log(`\n⛔ VIOLAN EL PISO DE MARGEN (RN-05) — la lista no se podría publicar:`);
  for (const id of lista.bloqueados) console.log(`   ${id.replace("|", " ")}`);
}

if (errores.length > 0) {
  console.error(`\n✗ ABORTADO — problemas con los datos de entrada:`);
  errores.forEach((e) => console.error(`   ${e}`));
  process.exit(1);
}
if (desvios.length > 0) {
  console.error(`\n✗ ABORTADO — el resultado NO reproduce la grilla aprobada (${desvios.length}):`);
  desvios.forEach((d) => console.error(`   ${d}`));
  console.error(`   Revisá los costos o la política ANTES de aplicar. El ancla es la grilla.`);
  process.exit(1);
}
console.log(`\n✓ Los ${Object.keys(GRILLA_ESPERADA).length} modelos reproducen la grilla aprobada en el escalón de entrada.`);

if (!APPLY) {
  console.log(`\n(dry-run — no se escribió nada. Agregá --apply para aplicar.)`);
  console.log(`  Al aplicar: ${saboresTocados} sabores cambian de costo · ${nuevos.length} productos nuevos.`);
  process.exit(0);
}

const backupsDir = join(PROJECT_ROOT, "backups");
if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true });
const backup = join(backupsDir, `products_pre_costos_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`);
writeFileSync(backup, JSON.stringify(products, null, 2));
await ref.set({ data: JSON.stringify(migrados), updatedAt: new Date().toISOString() });
console.log(`\n✓ Aplicado: ${saboresTocados} sabores con costo nuevo + ${nuevos.length} productos creados.`);
console.log(`  Respaldo previo: ${backup}`);
console.log(`  Siguiente paso: republicar la lista desde 🏷️ Lista de precios (van a entrar ${nuevos.length} modelos y a cambiar ${cambiosCosto.length}).`);
