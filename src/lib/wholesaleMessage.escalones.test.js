// wholesaleMessage.escalones.test.js — el texto compartible de la lista
// publicada: TODOS los escalones, mezcla libre ESCRITA, versión + fecha +
// disclaimer del dólar, solo modelos con stock. Definición comercial del
// gate F3→F4.
import { describe, it, expect } from "vitest";
import { listaEscalonesItems, listaEscalonesText, saboresConStock, plegarVariantes } from "./wholesaleMessage.js";
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

describe("saboresConStock", () => {
  it("solo los que tienen stock, sin repetir, alfabéticos y sin cantidades", () => {
    const m = saboresConStock([
      { brand: "Elfbar", model: "TE", flavor: "Watermelon Ice", stock: 3 },
      { brand: "Elfbar", model: "TE", flavor: "Miami Mint", stock: 1 },
      { brand: "Elfbar", model: "TE", flavor: "Miami Mint", stock: 2 }, // mismo sabor, otro registro
      { brand: "Elfbar", model: "TE", flavor: "Uva", stock: 0 },
      { brand: "Elfbar", model: "TE", flavor: "Borrada", stock: 5, isDeleted: true },
      { brand: "Elfbar", model: "TE", flavor: "   ", stock: 5 },        // sin nombre
    ]);
    expect(m.get("Elfbar|TE")).toEqual(["Miami Mint", "Watermelon Ice"]);
  });
  it("un modelo sin nada en stock no aparece en el mapa", () => {
    expect(saboresConStock([{ brand: "Ignite", model: "V500", flavor: "A definir", stock: 0 }]).size).toBe(0);
  });
});

describe("plegarVariantes — el color es una variante, no un sabor", () => {
  it("junta los colores del mismo sabor en un renglón", () => {
    expect(plegarVariantes([
      "Banana Coconut Water · Black", "Banana Coconut Water · Pink", "Menta",
    ])).toEqual(["Banana Coconut Water (Black, Pink)", "Menta"]);
  });
  it("los sabores sin variante quedan tal cual", () => {
    expect(plegarVariantes(["Watermelon Ice", "Cool Mint"])).toEqual(["Cool Mint", "Watermelon Ice"]);
  });
  it("un sabor que existe pelado Y con variante son SKUs distintos: van los dos", () => {
    expect(plegarVariantes(["Banana Ice", "Banana Ice · Black"]))
      .toEqual(["Banana Ice", "Banana Ice (Black)"]);
  });
  it("no inventa paréntesis con un solo color ni repite variantes", () => {
    expect(plegarVariantes(["Minty Melon · Black", "Minty Melon · Black"]))
      .toEqual(["Minty Melon (Black)"]);
  });
});

describe("listaEscalonesItems — catálogo completo vs stock inmediato", () => {
  it("por default NO filtra por stock: el catálogo es lo que se manda siempre", () => {
    const grupos = listaEscalonesItems(LISTA, productos);
    expect(grupos.map(g => g.marca)).toEqual(["Elfbar", "Ignite", "Lost Mary"]);
    // V250 no tiene stock y AUN ASÍ está: se consigue, se vende.
    expect(grupos.some(g => g.items.some(f => f.id === "Ignite|V250"))).toBe(true);
  });
  it("modo stock excluye los modelos sin stock hoy", () => {
    const grupos = listaEscalonesItems(LISTA, productos, { modo: "stock" });
    expect(grupos.map(g => g.marca)).toEqual(["Elfbar", "Lost Mary"]); // V250 afuera
    expect(grupos[0].items[0].modelo).toBe("TE 30K");
  });
  it("el stock se suma entre sabores del modelo (uno en cero no lo saca)", () => {
    const grupos = listaEscalonesItems(LISTA, productos, { modo: "stock" });
    expect(grupos.some(g => g.items.some(f => f.id === "Elfbar|TE 30K"))).toBe(true);
  });
  it("los dos modos publican los MISMOS precios — cambia qué se ofrece, no a cuánto", () => {
    const cat = listaEscalonesItems(LISTA, productos)
      .flatMap(g => g.items).find(f => f.id === "Elfbar|TE 30K");
    const stk = listaEscalonesItems(LISTA, productos, { modo: "stock" })
      .flatMap(g => g.items).find(f => f.id === "Elfbar|TE 30K");
    expect(stk.precios).toEqual(cat.precios);
  });
});

describe("listaEscalonesText — el mensaje compartible", () => {
  const txt = listaEscalonesText(LISTA, OPTS);

  it("manda TODOS los escalones por modelo, no uno solo", () => {
    // TE 30K: 13.5/13/12.5/12 USD × 1030 = 13.905 / 13.390 / 12.875 / 12.360
    expect(txt).toContain("*TE 30K* — 13.905 / 13.390 / 12.875 / 12.360");
    // El símbolo de moneda va UNA vez, arriba — no cuatro por renglón.
    expect(txt).toContain("*Precios en pesos* — unidades: 20-49 / 50-99 / 100-199 / 200+");
    expect(txt).not.toContain("$13.905 · $13.390");
    expect(txt).not.toContain("• TE 30K");
  });

  it("la mezcla libre está ESCRITA en el mensaje, no implícita (y una sola vez)", () => {
    expect(txt).toContain("El precio por unidad depende del TOTAL de unidades del pedido.");
    expect(txt).toContain("mezclá modelos y sabores como quieras");
    // Vive junto al mínimo, en positivo — no repetida arriba y abajo.
    expect(txt.toLowerCase().split("mezclá modelos y sabores").length - 1).toBe(1);
  });

  it("versión + fecha + disclaimer alineado con el presupuesto", () => {
    expect(txt).toContain("Lista v2026-08 · 07/08/2026");
    // La MISMA promesa que el presupuesto (48 hs), no la versión vaga.
    expect(txt).toContain("válidos por 48 hs");
    expect(txt).not.toContain("si el dólar se mueve");
  });

  it("el mínimo va EN POSITIVO y solo en unidades — el ticket en pesos no se comunica", () => {
    expect(txt).toContain("📦 Comprás desde 20 unidades — mezclá modelos y sabores como quieras.");
    expect(txt).not.toContain("Pedido mínimo");
    expect(txt).not.toContain("ticket");
    expect(txt).not.toContain("$206.000"); // el ticket mínimo (200 USD × 1030) no aparece
  });

  it("versión en USD: precios en dólares y la conversión se explica, sin necesitar FX", () => {
    // Se puede compartir aunque no haya cotización cargada — el precio en
    // dólares no depende del FX del día.
    const usd = listaEscalonesText(LISTA, { ...OPTS, moneda: "USD", exchangeRate: 0 });
    // Enteros sin decimales vacíos, centavos completos, y "USD" una sola vez.
    expect(usd).toContain("*TE 30K* — 13,50 / 13 / 12,50 / 12");
    expect(usd).toContain("*Precios en USD* — unidades:");
    expect((usd.match(/USD/g) || []).length).toBe(1); // solo el encabezado
    expect(usd).toContain("La conversión a pesos se hace al dólar del día de la cotización y queda firme 48 hs.");
    expect(usd).not.toContain("13.905");
    // Lo demás es idéntico a la versión en pesos:
    expect(usd).toContain("Comprás desde 20 unidades — mezclá modelos y sabores como quieras.");
    expect(usd).toContain("unidades: 20-49 / 50-99 / 100-199 / 200+");
  });

  it("la versión en pesos SÍ exige cotización (no inventa un número)", () => {
    expect(listaEscalonesText(LISTA, { ...OPTS, exchangeRate: 0 })).toBe("");
  });

  it("sin tiers, sin datos internos (costos/márgenes no viajan)", () => {
    expect(txt.toLowerCase()).not.toContain("tier");
    expect(txt.toLowerCase()).not.toContain("margen");
    expect(txt).not.toContain("costo");
  });

  // La pantalla ganó una vista interna con costo proveedor / costo real /
  // margen (2026-08-14). Este test es el contrapeso: esos números existen en el
  // snapshot y NO pueden viajar en NINGUNA de las dos listas, en ninguna moneda.
  it("ni el costo ni el margen del snapshot llegan al mensaje, en ningún modo", () => {
    const variantes = [
      listaEscalonesText(LISTA, OPTS),
      listaEscalonesText(LISTA, { ...OPTS, modo: "stock" }),
      listaEscalonesText(LISTA, { ...OPTS, moneda: "USD" }),
      listaEscalonesText(LISTA, { ...OPTS, moneda: "USD", modo: "stock" }),
    ];
    const fila = LISTA.filas.find(f => f.id === "Elfbar|TE 30K");
    expect(fila.costo).toBe(8.5);            // los datos internos existen...
    expect(fila.costoReal).toBeCloseTo(9.605, 3);
    for (const t of variantes) {
      expect(t).not.toBe("");
      expect(t.toLowerCase()).not.toContain("costo");
      expect(t.toLowerCase()).not.toContain("margen");
      expect(t).not.toContain("9,605");      // ...y no salen por ningún lado
      expect(t).not.toContain("9.605");
      expect(t).not.toContain("8,50 ");
      expect(t).not.toContain("28%");        // el margen objetivo del escalón
      expect(t).not.toContain("29,5%");      // el margen real de TE 30K @20-49
    }
  });

  it("agrupado por marca en mayúsculas", () => {
    expect(txt).toContain("*ELFBAR*");
    expect(txt).toContain("*LOST MARY*");
  });

  it("catálogo (default): van TODOS los modelos y la promesa de reposición está escrita", () => {
    expect(txt).toContain("V250"); // sin stock, igual se ofrece
    expect(txt).toContain("🗂️ *Estos son todos los modelos que manejamos.*");
    expect(txt).toContain("lo conseguimos en 5 días");
    expect(txt).not.toContain("entrega inmediata");
  });

  it("stock inmediato: solo lo que hay hoy y lo dice, con los MISMOS precios", () => {
    const stk = listaEscalonesText(LISTA, { ...OPTS, modo: "stock" });
    expect(stk).toContain("⚡ *Esto es lo que tengo acá ahora, listo para entrega*");
    expect(stk).not.toContain("conseguimos en");
    expect(stk).not.toContain("V250");
    // El precio no cambia entre listas: es la misma lista publicada.
    expect(stk).toContain("*TE 30K* — 13.905 / 13.390 / 12.875 / 12.360");
  });

  it("stock inmediato lista los sabores disponibles debajo de cada modelo", () => {
    // El cliente elige por SABOR: "Ice King disponible" con dos sabores en
    // stock devuelve el pedido que hay que romper.
    const productos2 = [
      { id: "a", brand: "Elfbar", model: "TE 30K", flavor: "Watermelon Ice", stock: 3 },
      { id: "a2", brand: "Elfbar", model: "TE 30K", flavor: "Miami Mint", stock: 2 },
      { id: "a3", brand: "Elfbar", model: "TE 30K", flavor: "Uva", stock: 0 }, // sin stock: no va
      { id: "b", brand: "Lost Mary", model: "MO 20K", flavor: "Ice", stock: 3 },
    ];
    const stk = listaEscalonesText(LISTA, { ...OPTS, products: productos2, modo: "stock" });
    expect(stk).toContain("*TE 30K* — 13.905 / 13.390 / 12.875 / 12.360\nMiami Mint · Watermelon Ice");
    expect(stk).not.toContain("Uva");
    // Sin cantidades, nunca: la línea de sabores no lleva un solo dígito.
    const lineaSabores = stk.split("\n").find(l => l.includes("Miami Mint"));
    expect(lineaSabores).toBe("Miami Mint · Watermelon Ice");
    expect(lineaSabores).not.toMatch(/\d/);
  });

  it("los sabores van SOLO en la lista de stock — el catálogo queda a nivel modelo", () => {
    const productos2 = [{ id: "a", brand: "Elfbar", model: "TE 30K", flavor: "Watermelon Ice", stock: 3 }];
    const cat = listaEscalonesText(LISTA, { ...OPTS, products: productos2, modo: "catalogo" });
    expect(cat).toContain("*TE 30K* —");
    expect(cat).not.toContain("Watermelon Ice");
  });

  it("stock inmediato avisa que las cantidades por sabor son limitadas, SIN publicarlas", () => {
    // Las dos listas se mandan juntas: el encabezado prepara al cliente para
    // que parte del pedido venga después. Pero la cantidad por producto no se
    // publica — se consulta.
    const stk = listaEscalonesText(LISTA, { ...OPTS, modo: "stock" });
    expect(stk).toContain("las cantidades por sabor son limitadas.");
    expect(stk).not.toMatch(/stock:?\s*\d/i);
    expect(stk).not.toContain("unidades disponibles");
    // El catálogo NO lleva ese aviso: ahí la promesa es la reposición.
    expect(txt).not.toContain("cantidades por sabor");
  });

  it("el plazo de reposición sale de la política, no del código", () => {
    const lista10 = { ...LISTA, politica: { ...LISTA.politica, plazoPedidoDias: 10 } };
    expect(listaEscalonesText(lista10, OPTS)).toContain("lo conseguimos en 10 días");
  });

  // Las dos listas se mandan juntas: la segunda no repite las reglas. Un
  // celular que arranca con cuatro renglones ya leídos esconde lo único nuevo.
  it("la lista resumida no repite escalones, mínimo ni disclaimer del dólar", () => {
    const stk = listaEscalonesText(LISTA, { ...OPTS, modo: "stock" });
    for (const regla of ["Comprás desde 20 unidades", "válidos por 48 hs", "unidades: 20-49", "depende del TOTAL"]) {
      expect(txt).toContain(regla);      // la primera SÍ las lleva
      expect(stk).not.toContain(regla);  // la continuación no
    }
    // Lo que sí conserva: identidad, versión y qué es esta lista.
    expect(stk).toContain("*LISTA MAYORISTA — Imports Zona Norte*");
    expect(stk).toContain("Lista v2026-08 · 07/08/2026");
    expect(stk).toContain("listo para entrega");
  });

  it("cuál es la resumida se puede invertir sin tocar el modo (por si cambia el orden de envío)", () => {
    const stockCompleto = listaEscalonesText(LISTA, { ...OPTS, modo: "stock", resumido: false });
    const catalogoResumido = listaEscalonesText(LISTA, { ...OPTS, modo: "catalogo", resumido: true });
    expect(stockCompleto).toContain("Comprás desde 20 unidades");
    expect(stockCompleto).toContain("unidades: 20-49");
    expect(catalogoResumido).not.toContain("Comprás desde 20 unidades");
    // El modo sigue mandando QUÉ se ofrece; resumido solo decide las reglas.
    expect(stockCompleto).not.toContain("V250");
    expect(catalogoResumido).toContain("V250");
  });

  it("los precios son idénticos en las dos listas, resumida o no", () => {
    const stk = listaEscalonesText(LISTA, { ...OPTS, modo: "stock" });
    const precios = (t) => t.match(/\*TE 30K\* — ([^\n]+)/)?.[1];
    expect(precios(stk)).toBe(precios(txt));
  });

  it("ningún modo filtra el catálogo por stock al pie de la letra de RN-18: sin costo ya no está en el snapshot", () => {
    // El snapshot solo trae modelos con costo (RN-18, priceLists.construirSnapshot).
    // El modo catálogo no reintroduce nada: muestra exactamente las filas publicadas.
    const idsTxt = LISTA.filas.map(f => f.modelo);
    idsTxt.forEach(m => expect(txt).toContain(m));
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
    expect(t).toContain("unidades: 10-99 / 100+");
    expect(t.match(/\*TE 30K\* — ([^\n]+)/)?.[1].split(" / ")).toHaveLength(2);
  });

  it("sin lista o sin FX (en pesos) ⇒ texto vacío", () => {
    expect(listaEscalonesText(null, OPTS)).toBe("");
    expect(listaEscalonesText(LISTA, { ...OPTS, exchangeRate: 0 })).toBe("");
  });

  it("el catálogo no depende del stock cargado; el de stock sí queda vacío sin stock", () => {
    expect(listaEscalonesText(LISTA, { ...OPTS, products: [] })).toContain("*TE 30K* —");
    expect(listaEscalonesText(LISTA, { ...OPTS, products: [], modo: "stock" })).toBe("");
  });
});
