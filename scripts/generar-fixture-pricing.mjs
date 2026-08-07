// generar-fixture-pricing.mjs — regenera docs/pricing_fixture_v2026-08.csv
// desde el motor (src/lib/pricingEngine.js) y lo VERIFICA contra la grilla
// aprobada de la Lista v2026-08 (documento estratégico §6 / hoja "Pricing
// Base" de Pricing_Engine_Vapes_v1.xlsx) antes de escribir. Si el motor no
// reproduce la grilla aprobada, NO escribe: el ancla es el documento, no el motor.
//
// Correr solo cuando cambia la política a propósito (nueva versión de lista):
//   node scripts/generar-fixture-pricing.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generarLista } from "../src/lib/pricingEngine.js";

const VERSION = "v2026-08";

// Grilla APROBADA (doc estratégico §6): [marca, modelo, costo proveedor USD,
// precios esperados 20-49 / 50-99 / 100-199 / 200+]. Fuente externa al motor.
const GRILLA_APROBADA = [
  ["Elfbar", "TE 30K", 8.5, [13.5, 13, 12.5, 12]],
  ["Elfbar", "GH 23K", 8.8, [14, 13.5, 13, 12.5]],
  ["Elfbar", "40K Trio", 9.5, [15, 14.5, 14, 13.5]],
  ["Elfbar", "40K Sour King", 9.5, [15, 14.5, 14, 13.5]],
  ["Elfbar", "40K Ice King", 9.75, [15.5, 14.5, 14, 13.5]],
  ["Elfbar", "40K Sweet King", 9.75, [15.5, 14.5, 14, 13.5]],
  ["Ignite", "V150 Black", 7.5, [12, 11.5, 11, 10.5]],
  ["Ignite", "V150 Pro", 8, [13, 12, 11.5, 11]],
  ["Ignite", "V250", 10, [16, 15, 14.5, 14]],
  ["Ignite", "V300", 10.5, [16.5, 16, 15.5, 14.5]],
  ["Ignite", "V400 Ice", 10.5, [16.5, 16, 15.5, 14.5]],
  ["Ignite", "V400 Sweet", 10.5, [16.5, 16, 15.5, 14.5]],
  ["Ignite", "V300 Ultra Slim", 11, [17.5, 16.5, 16, 15.5]],
  ["Ignite", "V400 V-Mix", 11.5, [18.5, 17.5, 16.5, 16]],
  ["Lost Mary", "MO 20K", 6.5, [10.5, 10, 9.5, 9]],
  ["Lost Mary", "Mixer 30K", 8.5, [13.5, 13, 12.5, 12]],
  ["Lost Mary", "Dura 35K", 9, [14.5, 13.5, 13, 12.5]],
  ["Lost Mary", "MT 35K", 9, [14.5, 13.5, 13, 12.5]],
  ["Nikbar", "40K Ice Nic / Triple Chill", 9, [14.5, 13.5, 13, 12.5]],
];

// Política v2026-08 (hoja "Parametros" del xlsx).
const POLITICA = {
  costoAdicionalPct: 0.13,
  metricaEscalon: "unidades",
  escalones: [
    { desde: 20, hasta: 49, margen: 0.28 },
    { desde: 50, hasta: 99, margen: 0.24 },
    { desde: 100, hasta: 199, margen: 0.21 },
    { desde: 200, hasta: null, margen: 0.18 },
  ],
  redondeo: { multiplo: 0.5, direccion: "arriba" },
  margenMinimo: 0.15,
  validaciones: {
    conflictoCanal: { activa: true, umbral: 0.85 },
    margenCliente: { activa: true, umbral: 0.3 },
  },
};

const productos = GRILLA_APROBADA.map(([marca, modelo, costo]) => ({
  id: `${marca} ${modelo}`, marca, modelo, costo,
}));
const lista = generarLista(productos, POLITICA);

// Verificación contra el ancla externa ANTES de escribir.
let fallas = 0;
for (const [marca, modelo, , esperados] of GRILLA_APROBADA) {
  const fila = lista.filas.find((f) => f.id === `${marca} ${modelo}`);
  const calculados = fila.precios.map((p) => p.precio);
  if (calculados.length !== esperados.length || calculados.some((p, i) => Math.abs(p - esperados[i]) > 1e-9)) {
    console.error(`✗ ${marca} ${modelo}: motor ${calculados} ≠ aprobado ${esperados}`);
    fallas++;
  }
}
if (fallas > 0 || !lista.publicable) {
  console.error(`ABORTADO: ${fallas} SKUs no reproducen la grilla aprobada (publicable=${lista.publicable}).`);
  process.exit(1);
}

const filas = [
  "version,marca,modelo,costo_proveedor_usd,costo_real_usd,escalon_desde,escalon_hasta,margen_objetivo,precio_usd,margen_real,ajustado_anticolapso",
];
for (const producto of productos) {
  const fila = lista.filas.find((f) => f.id === producto.id);
  for (const esc of fila.precios) {
    filas.push([
      VERSION,
      producto.marca,
      producto.modelo,
      producto.costo.toFixed(2),
      fila.costoReal.toFixed(4),
      esc.desde,
      esc.hasta ?? "",
      esc.margen.toFixed(2),
      esc.precio.toFixed(2),
      esc.margenReal.toFixed(4),
      esc.ajustadoAnticolapso ? "si" : "no",
    ].join(","));
  }
}

const destino = join(process.cwd(), "docs", `pricing_fixture_${VERSION}.csv`);
writeFileSync(destino, filas.join("\n") + "\n");
console.log(`✓ Grilla aprobada reproducida 19/19 — fixture escrito: ${destino} (${filas.length - 1} filas)`);
