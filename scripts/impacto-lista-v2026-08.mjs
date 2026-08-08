// impacto-lista-v2026-08.mjs — TABLA DE IMPACTO POR CLIENTE (solo lectura).
//
// Insumo para la decisión abierta #1 del brief del Pricing Engine (tiers A/B/C
// → escalones por volumen): qué kiosco activo paga hoy qué precio con su tier,
// y qué pagaría con la Lista v2026-08 al escalón de su volumen típico.
// Sin esto, Diego decide a ciegas sobre un cambio que puede subirle el precio
// a clientes existentes.
//
// SOLO LECTURA: este script jamás escribe en Firestore.
// Salida: docs/impacto-lista-v2026-08.csv (detalle) + resumen por consola.
//
// Correr:  GOOGLE_APPLICATION_CREDENTIALS=<ruta SA json> node scripts/impacto-lista-v2026-08.mjs
//          (o con la credencial en .credentials/firebase-admin-sa.json)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolveServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const adc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (adc && existsSync(adc)) return JSON.parse(readFileSync(adc, "utf8"));
  const p = join(PROJECT_ROOT, ".credentials", "firebase-admin-sa.json");
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  console.error("✗ Sin credencial: FIREBASE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS / .credentials/firebase-admin-sa.json");
  process.exit(1);
}

// Lista v2026-08 aprobada (doc estratégico §6): marca|modelo → [p20, p50, p100, p200] USD.
const LISTA = [
  ["Lost Mary", "MO 20K", [10.5, 10, 9.5, 9]],
  ["Ignite", "V150 Black", [12, 11.5, 11, 10.5]],
  ["Ignite", "V150 Pro", [13, 12, 11.5, 11]],
  ["Elfbar", "TE 30K", [13.5, 13, 12.5, 12]],
  ["Lost Mary", "Mixer 30K", [13.5, 13, 12.5, 12]],
  ["Elfbar", "GH 23K", [14, 13.5, 13, 12.5]],
  ["Lost Mary", "Dura 35K", [14.5, 13.5, 13, 12.5]],
  ["Lost Mary", "MT 35K", [14.5, 13.5, 13, 12.5]],
  ["Nikbar", "40K Ice Nic / Triple Chill", [14.5, 13.5, 13, 12.5]],
  ["Elfbar", "40K Trio", [15, 14.5, 14, 13.5]],
  ["Elfbar", "40K Sour King", [15, 14.5, 14, 13.5]],
  ["Elfbar", "40K Ice King", [15.5, 14.5, 14, 13.5]],
  ["Elfbar", "40K Sweet King", [15.5, 14.5, 14, 13.5]],
  ["Ignite", "V250", [16, 15, 14.5, 14]],
  ["Ignite", "V300", [16.5, 16, 15.5, 14.5]],
  ["Ignite", "V400 Ice", [16.5, 16, 15.5, 14.5]],
  ["Ignite", "V400 Sweet", [16.5, 16, 15.5, 14.5]],
  ["Ignite", "V300 Ultra Slim", [17.5, 16.5, 16, 15.5]],
  ["Ignite", "V400 V-Mix", [18.5, 17.5, 16.5, 16]],
];
const ESCALONES = [
  { desde: 20, hasta: 49, label: "20-49" },
  { desde: 50, hasta: 99, label: "50-99" },
  { desde: 100, hasta: 199, label: "100-199" },
  { desde: 200, hasta: null, label: "200+" },
];

const norm = (s) => String(s || "").toUpperCase().replace(/\s+/g, " ").trim();
// Índice de la lista con alias: "40K Ice Nic / Triple Chill" matchea por cualquiera de los dos.
const listaIdx = new Map();
for (const [marca, modelo, precios] of LISTA) {
  for (const alias of modelo.split("/").map((m) => m.trim())) {
    listaIdx.set(`${norm(marca)}|${norm(alias)}`, { marca, modelo, precios });
  }
  listaIdx.set(`${norm(marca)}|${norm(modelo)}`, { marca, modelo, precios });
}

function escalonIdx(unidades) {
  for (let i = ESCALONES.length - 1; i >= 0; i--) if (unidades >= ESCALONES[i].desde) return i;
  return 0; // debajo del mínimo: se compara contra el primer escalón
}

const mediana = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const db = getFirestore(initializeApp({ credential: cert(resolveServiceAccount()) }));
const leer = async (key, fallback) => {
  const snap = await db.collection("appData").doc(key).get();
  if (!snap.exists) return fallback;
  try { return JSON.parse(snap.data().data); } catch { return fallback; }
};

const [products, clients, sales] = await Promise.all([
  leer("products", []), leer("clients", []), leer("sales", []),
]);

const kioscos = clients.filter((c) => c && !c.isDeleted && c.type === "mayorista");
const ventasMayoristas = sales.filter((s) => s && !s.isDeleted && s.saleType === "mayorista");
const prodById = new Map(products.map((p) => [p.id, p]));

console.log(`Kioscos activos: ${kioscos.length} · Pedidos mayoristas: ${ventasMayoristas.length}\n`);

const filas = [];
const modelosSinMatch = new Map(); // "marca|modelo" → unidades
for (const kiosco of kioscos) {
  const pedidos = ventasMayoristas.filter((s) => s.clientId === kiosco.id);
  const unidadesPorPedido = pedidos.map((s) =>
    (s.items || []).reduce((acc, it) => acc + (Number(it.qty) || 0), 0));
  const volTipico = Math.round(mediana(unidadesPorPedido));
  const esc = escalonIdx(volTipico);
  const tier = String(kiosco.wholesaleTier || "").toLowerCase();

  // Mix histórico: unidades por producto en todos sus pedidos.
  const mix = new Map();
  for (const s of pedidos) for (const it of s.items || []) {
    mix.set(it.productId, (mix.get(it.productId) || 0) + (Number(it.qty) || 0));
  }

  let unidades = 0, costoHoy = 0, costoNuevo = 0, unidadesSinMatch = 0, unidadesSinTier = 0;
  for (const [productId, qty] of mix) {
    const p = prodById.get(productId);
    if (!p) { unidadesSinMatch += qty; continue; }
    const precioHoy = Number(p.priceByChannel?.[`mayorista_${tier}`]) || 0;
    const entrada = listaIdx.get(`${norm(p.brand)}|${norm(p.model)}`);
    if (!entrada) {
      unidadesSinMatch += qty;
      const k = `${p.brand}|${p.model}`;
      modelosSinMatch.set(k, (modelosSinMatch.get(k) || 0) + qty);
      continue;
    }
    if (!(precioHoy > 0)) { unidadesSinTier += qty; continue; }
    unidades += qty;
    costoHoy += qty * precioHoy;
    costoNuevo += qty * entrada.precios[esc];
  }

  const hoy = unidades > 0 ? costoHoy / unidades : 0;
  const nuevo = unidades > 0 ? costoNuevo / unidades : 0;
  filas.push({
    kiosco: kiosco.businessName || kiosco.name || kiosco.id,
    tier: (kiosco.wholesaleTier || "—").toUpperCase(),
    zona: kiosco.zone || "",
    pedidos: pedidos.length,
    volTipico,
    escalon: ESCALONES[esc].label,
    debajoDelMinimo: volTipico > 0 && volTipico < 20 ? "si" : "no",
    precioHoyUSD: hoy,
    precioNuevoUSD: nuevo,
    diffPct: hoy > 0 ? (nuevo - hoy) / hoy : null,
    unidadesComparadas: unidades,
    unidadesSinMatch,
    unidadesSinTier,
  });
}

filas.sort((a, b) => (b.diffPct ?? -Infinity) - (a.diffPct ?? -Infinity));

const fmt = (x, d = 2) => (x == null ? "" : Number(x).toFixed(d));
const csv = [
  "kiosco,tier_actual,zona,pedidos,volumen_tipico_u,escalon_nuevo,debajo_del_minimo_20u,precio_prom_hoy_usd,precio_prom_nuevo_usd,diferencia_pct,unidades_comparadas,unidades_sin_match,unidades_sin_precio_tier",
  ...filas.map((f) => [
    JSON.stringify(f.kiosco), f.tier, JSON.stringify(f.zona), f.pedidos, f.volTipico, f.escalon,
    f.debajoDelMinimo, fmt(f.precioHoyUSD), fmt(f.precioNuevoUSD),
    f.diffPct == null ? "" : fmt(f.diffPct * 100, 1), f.unidadesComparadas, f.unidadesSinMatch, f.unidadesSinTier,
  ].join(",")),
].join("\n") + "\n";
const destino = join(PROJECT_ROOT, "docs", "impacto-lista-v2026-08.csv");
writeFileSync(destino, csv);

// Resumen por consola (para pegar en el MD).
for (const f of filas) {
  const d = f.diffPct == null ? "  sin base de comparación" :
    `${f.diffPct >= 0 ? "+" : ""}${fmt(f.diffPct * 100, 1)}%`;
  console.log(
    `${f.kiosco.padEnd(28)} tier ${f.tier.padEnd(2)} vol ${String(f.volTipico).padStart(4)}u → ${f.escalon.padEnd(7)} ` +
    `hoy $${fmt(f.precioHoyUSD).padStart(6)} → $${fmt(f.precioNuevoUSD).padStart(6)}  ${d}` +
    (f.debajoDelMinimo === "si" ? "  ⚠ debajo del mínimo 20u" : "") +
    (f.unidadesSinMatch > 0 ? `  (${f.unidadesSinMatch}u sin match)` : "")
  );
}
if (modelosSinMatch.size > 0) {
  console.log("\nModelos comprados que NO están en la Lista v2026-08 (excluidos de la comparación):");
  for (const [k, u] of [...modelosSinMatch.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${u}u`);
  }
}
console.log(`\n✓ Detalle: ${destino}`);
