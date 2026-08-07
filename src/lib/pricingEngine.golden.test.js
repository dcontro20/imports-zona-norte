// pricingEngine.golden.test.js — el motor reproduce EXACTAMENTE la salida
// esperada: docs/pricing_fixture_v2026-08.csv (Lista v2026-08 aprobada, fuente
// Pricing_Engine_Vapes_v1.xlsx). El test regenera el CSV completo desde el
// motor y lo compara byte a byte contra el archivo versionado.
//
// Si este test falla, o cambió el motor (regresión) o cambió el fixture
// (cambio de política: exige regenerar el fixture A PROPÓSITO y documentarlo).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generarLista, calcularProducto } from "./pricingEngine.js";

const FIXTURE_PATH = join(process.cwd(), "docs", "pricing_fixture_v2026-08.csv");
const fixture = readFileSync(FIXTURE_PATH, "utf8");

// Política v2026-08 — transcripta a mano de la hoja "Parametros" del xlsx.
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

// Inputs: los 19 SKUs con su costo de proveedor, parseados del propio fixture
// (columnas de entrada). El resto de las columnas es SALIDA esperada del motor.
const lineas = fixture.trim().split("\n");
const header = lineas[0];
const productos = [];
for (const linea of lineas.slice(1)) {
  const [version, marca, modelo, costo] = linea.split(",");
  const id = `${marca} ${modelo}`;
  if (!productos.some((p) => p.id === id)) {
    productos.push({ id, version, marca, modelo, costo: Number(costo) });
  }
}

// Regenera el CSV con el MISMO formato con que se generó el fixture.
function regenerarCSV() {
  const filas = [header];
  const lista = generarLista(productos, POLITICA);
  for (const producto of productos) {
    const fila = lista.filas.find((f) => f.id === producto.id);
    for (const esc of fila.precios) {
      filas.push([
        producto.version,
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
  return filas.join("\n") + "\n";
}

describe("Golden — Lista v2026-08 (fixture completo)", () => {
  it("el fixture tiene la forma esperada (19 SKUs × 4 escalones)", () => {
    expect(productos).toHaveLength(19);
    expect(lineas).toHaveLength(1 + 76);
  });

  it("el motor reproduce el CSV byte a byte", () => {
    expect(regenerarCSV()).toBe(fixture);
  });

  it("la lista completa es publicable: ningún SKU bloqueado, ninguno sin costo", () => {
    const lista = generarLista(productos, POLITICA);
    expect(lista.sinCosto).toEqual([]);
    expect(lista.bloqueados).toEqual([]);
    expect(lista.publicable).toBe(true);
  });

  it("único ajuste anti-colapso de la lista: Ignite V150 Pro en 200+ (doc §4.3)", () => {
    const lista = generarLista(productos, POLITICA);
    const ajustados = lista.filas.flatMap((f) =>
      f.precios.filter((p) => p.ajustadoAnticolapso).map((p) => `${f.id} @${p.desde}`)
    );
    expect(ajustados).toEqual(["Ignite V150 Pro @200"]);
  });

  it("márgenes reales dentro de los rangos citados en el doc §6", () => {
    const lista = generarLista(productos, POLITICA);
    const primeros = lista.filas.map((f) => f.precios[0].margenReal);
    const ultimos = lista.filas.map((f) => f.precios[f.precios.length - 1].margenReal);
    // Primer escalón: entre 28,1% y 30,5%
    expect(Math.min(...primeros)).toBeCloseTo(0.281, 3);
    expect(Math.max(...primeros)).toBeCloseTo(0.305, 3);
    // Escalón más profundo: entre 17,8% y 20,5%
    expect(Math.min(...ultimos)).toBeCloseTo(0.178, 3);
    expect(Math.max(...ultimos)).toBeCloseTo(0.205, 3);
  });

  it("validaciones de mercado del xlsx: los 3 SKUs con precio de calle pasan (35,6%–47,4%)", () => {
    // El motor es agnóstico de moneda: el precio de calle (ARS) entra convertido
    // al FX de referencia del análisis (1530, hoja Parametros) — rol del adaptador.
    const FX = 1530;
    const casos = [
      { id: "Ignite V250", costo: 10, precioReferencia: 19, precioMercado: 38000 / FX, margenEsperado: 0.356 },
      { id: "Elfbar 40K Ice King", costo: 9.75, precioReferencia: 20, precioMercado: 45000 / FX, margenEsperado: 0.473 },
      { id: "Ignite V400 Ice", costo: 10.5, precioReferencia: 21, precioMercado: 48000 / FX, margenEsperado: 0.474 },
    ];
    for (const caso of casos) {
      const calc = calcularProducto(caso, POLITICA);
      expect(calc.alertas).toEqual([]);
      const margenCliente = (caso.precioMercado - calc.precios[0].precio) / caso.precioMercado;
      expect(margenCliente).toBeCloseTo(caso.margenEsperado, 3);
    }
  });
});
