// wholesaleMessage.escalones.test.js — el texto compartible de la lista
// publicada: TODOS los escalones, mezcla libre ESCRITA, versión + fecha +
// disclaimer del dólar, solo modelos con stock. Definición comercial del
// gate F3→F4.
import { describe, it, expect } from "vitest";
import { listaEscalonesItems, listaEscalonesText } from "./wholesaleMessage.js";
import { construirSnapshot } from "./priceLists.js";
import { DEFAULT_PRICING_POLICY } from "./pricingPolicy.js";

const LISTA = construirSnapshot({
  productosMotor: [
    { id: "Elfbar|TE 30K", marca: "Elfbar", modelo: "TE 30K", costo: 8.5, productIds: ["a"], sabores: 1 },
    { id: "Lost Mary|MO 20K", marca: "Lost Mary", modelo: "MO 20K", costo: 6.5, productIds: ["b"], sabores: 1 },
    { id: "Ignite|V250", marca: "Ignite", modelo: "V250", costo: 10, productIds: ["c"], sabores: 1 },
  ],
  politica: DEFAULT_PRICING_POLICY,
  version: "v2026-08",
  fecha: "2026-08-07T12:00:00.000Z",
});

const productos = [
  { id: "a", brand: "Elfbar", model: "TE 30K", flavor: "Menta", stock: 5 },
  { id: "a2", brand: "Elfbar", model: "TE 30K", flavor: "Uva", stock: 0 },
  { id: "b", brand: "Lost Mary", model: "MO 20K", flavor: "Ice", stock: 3 },
  { id: "c", brand: "Ignite", model: "V250", flavor: "Mix", stock: 0 }, // sin stock
];

const OPTS = { products: productos, exchangeRate: 1000, now: new Date("2026-08-07T15:00:00") };
// FX efectivo = 1000 × (1 + buffer 3%) = 1030 — la conversión del cotizador.

describe("listaEscalonesItems — filas de la vigente con stock hoy", () => {
  it("agrupa por marca alfabéticamente y excluye modelos sin stock", () => {
    const grupos = listaEscalonesItems(LISTA, productos);
    expect(grupos.map(g => g.marca)).toEqual(["Elfbar", "Lost Mary"]); // V250 sin stock afuera
    expect(grupos[0].items[0].modelo).toBe("TE 30K");
  });
  it("el stock se suma entre sabores del modelo (uno en cero no lo saca)", () => {
    const grupos = listaEscalonesItems(LISTA, productos);
    expect(grupos.some(g => g.items.some(f => f.id === "Elfbar|TE 30K"))).toBe(true);
  });
});

describe("listaEscalonesText — el mensaje compartible", () => {
  const txt = listaEscalonesText(LISTA, OPTS);

  it("manda TODOS los escalones por modelo, no uno solo", () => {
    // TE 30K: 13.5/13/12.5/12 USD × 1030 = 13.905 / 13.390 / 12.875 / 12.360
    expect(txt).toContain("• TE 30K: $13.905 · $13.390 · $12.875 · $12.360");
    // Header de rangos derivado del snapshot:
    expect(txt).toContain("Unidades: 20-49  ·  50-99  ·  100-199  ·  200+");
  });

  it("la mezcla libre está ESCRITA en el mensaje, no implícita", () => {
    expect(txt).toContain("El precio por unidad depende del TOTAL de unidades del pedido.");
    expect(txt).toContain("Mezclá modelos y sabores como quieras");
  });

  it("versión + fecha + disclaimer alineado con el presupuesto + mínimo de la política congelada", () => {
    expect(txt).toContain("Lista v2026-08 · 07/08/2026");
    // La MISMA promesa que el presupuesto (48 hs), no la versión vaga.
    expect(txt).toContain("válidos por 48 hs");
    expect(txt).not.toContain("si el dólar se mueve");
    expect(txt).toContain("Pedido mínimo: 20 unidades");
    expect(txt).toContain("$206.000"); // ticket 200 USD × 1030
  });

  it("sin tiers, sin datos internos (costos/márgenes no viajan)", () => {
    expect(txt.toLowerCase()).not.toContain("tier");
    expect(txt.toLowerCase()).not.toContain("margen");
    expect(txt).not.toContain("costo");
  });

  it("modelos sin stock no van; agrupado por marca en mayúsculas", () => {
    expect(txt).not.toContain("V250");
    expect(txt).toContain("*ELFBAR*");
    expect(txt).toContain("*LOST MARY*");
  });

  it("no asume 4 escalones: una política de 2 produce 2 columnas", () => {
    const lista2 = construirSnapshot({
      productosMotor: [{ id: "Elfbar|TE 30K", marca: "Elfbar", modelo: "TE 30K", costo: 8.5, productIds: ["a"], sabores: 1 }],
      politica: {
        ...DEFAULT_PRICING_POLICY,
        escalones: [{ desde: 10, hasta: 99, margen: 0.28 }, { desde: 100, hasta: null, margen: 0.2 }],
      },
      version: "v2026-08", fecha: "2026-08-07T12:00:00.000Z",
    });
    const t = listaEscalonesText(lista2, OPTS);
    expect(t).toContain("Unidades: 10-99  ·  100+");
    expect((t.match(/• TE 30K: ([^\n]+)/)?.[1].match(/\$/g) || []).length).toBe(2);
  });

  it("sin lista, sin stock total o sin FX ⇒ texto vacío", () => {
    expect(listaEscalonesText(null, OPTS)).toBe("");
    expect(listaEscalonesText(LISTA, { ...OPTS, products: [] })).toBe("");
    expect(listaEscalonesText(LISTA, { ...OPTS, exchangeRate: 0 })).toBe("");
  });
});
