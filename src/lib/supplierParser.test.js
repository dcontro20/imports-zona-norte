import { describe, it, expect } from "vitest";
import {
  detectColumns,
  parseSpreadsheetRows,
  parseTextLines,
  parsePdfText,
  enrichWithMatches,
  COLUMN_ALIASES,
} from "./supplierParser.js";
import { matchProduct } from "./fuzzyMatch.js";

const CATALOG = [
  { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon Ice", puffs: "30000" },
  { id: "p2", brand: "Elfbar", model: "TE", flavor: "Açai Banana Ice", puffs: "30000" },
  { id: "p3", brand: "Lost Mary", model: "BM6000", flavor: "Cherry Cola", puffs: "6000" },
];

describe("detectColumns", () => {
  it("detects standard English headers", () => {
    const map = detectColumns(["Brand", "Model", "Flavor", "Qty", "Price"]);
    expect(map.brand).toBe(0);
    expect(map.model).toBe(1);
    expect(map.flavor).toBe(2);
    expect(map.qty).toBe(3);
    expect(map.priceUSD).toBe(4);
  });

  it("detects Spanish headers", () => {
    const map = detectColumns(["Marca", "Modelo", "Sabor", "Cantidad", "Precio"]);
    expect(map.brand).toBe(0);
    expect(map.flavor).toBe(2);
    expect(map.priceUSD).toBe(4);
  });

  it("handles accents and case", () => {
    const map = detectColumns(["MARCA", "Descripción", "Stock"]);
    expect(map.brand).toBe(0);
    // "Descripción" is in flavor aliases
    expect(map.flavor).toBe(1);
    expect(map.qty).toBe(2);
  });

  it("returns empty map when nothing matches", () => {
    const map = detectColumns(["Random", "Foo", "Bar"]);
    expect(Object.keys(map).length).toBe(0);
  });
});

describe("parseSpreadsheetRows", () => {
  it("parses array-of-objects from SheetJS", () => {
    const rows = [
      { Brand: "Elfbar", Model: "TE", Flavor: "Watermelon Ice", Qty: 20, Price: 18 },
      { Brand: "Lost Mary", Model: "BM6000", Flavor: "Cherry Cola", Qty: 15, Price: 14 },
    ];
    const out = parseSpreadsheetRows(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      brand: "Elfbar",
      model: "TE",
      flavor: "Watermelon Ice",
      qty: 20,
      priceUSD: 18,
    });
  });

  it("parses array-of-arrays with header detection", () => {
    const rows = [
      ["Marca", "Modelo", "Sabor", "Cantidad", "Precio USD"],
      ["Elfbar", "TE", "Watermelon Ice", 20, 18],
      ["Lost Mary", "BM6000", "Cherry Cola", 15, 14],
    ];
    const out = parseSpreadsheetRows(rows);
    expect(out).toHaveLength(2);
    expect(out[0].flavor).toBe("Watermelon Ice");
    expect(out[1].qty).toBe(15);
  });

  it("parses arrays without header using default order", () => {
    const rows = [
      ["Elfbar", "TE", "Watermelon Ice", 20, 18],
    ];
    const out = parseSpreadsheetRows(rows);
    expect(out[0].brand).toBe("Elfbar");
    expect(out[0].qty).toBe(20);
  });

  it("parses prices with es-AR format (1.234,50)", () => {
    const rows = [
      { Brand: "Elfbar", Model: "TE", Flavor: "X", Qty: "1.234", Price: "18,50" },
    ];
    const out = parseSpreadsheetRows(rows);
    expect(out[0].priceUSD).toBe(18.5);
  });

  it("parses prices with en-US format (1,234.50)", () => {
    const rows = [
      { Brand: "Elfbar", Model: "TE", Flavor: "X", Qty: 20, Price: "1,234.50" },
    ];
    const out = parseSpreadsheetRows(rows);
    expect(out[0].priceUSD).toBe(1234.5);
  });

  it("skips empty rows", () => {
    const rows = [
      { Brand: "Elfbar", Model: "TE", Flavor: "X", Qty: 1, Price: 1 },
      { Brand: "", Model: "", Flavor: "", Qty: "", Price: "" },
      { Brand: "Lost Mary", Model: "BM", Flavor: "Y", Qty: 1, Price: 1 },
    ];
    const out = parseSpreadsheetRows(rows);
    expect(out).toHaveLength(2);
  });

  it("includes raw for matching downstream", () => {
    const rows = [{ Brand: "Elfbar", Model: "TE", Flavor: "Watermelon Ice", Qty: 1, Price: 18 }];
    const out = parseSpreadsheetRows(rows);
    expect(out[0].raw).toContain("Elfbar");
    expect(out[0].raw).toContain("Watermelon");
  });

  it("returns empty for empty input", () => {
    expect(parseSpreadsheetRows([])).toEqual([]);
    expect(parseSpreadsheetRows(null)).toEqual([]);
  });
});

describe("parseTextLines", () => {
  it("parses simple line with brand model flavor qty price", () => {
    const text = "Elfbar TE Açai Banana x20 $18";
    const out = parseTextLines(text, { knownBrands: ["Elfbar", "Lost Mary"] });
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(20);
    expect(out[0].priceUSD).toBe(18);
    expect(out[0].brand).toBe("Elfbar");
    expect(out[0].raw.toLowerCase()).toMatch(/a[çc]ai/);
  });

  it("parses '20 x Elfbar TE Açai' format", () => {
    const text = "20 x Elfbar TE Açai Banana - 18 USD";
    const out = parseTextLines(text, { knownBrands: ["Elfbar"] });
    expect(out[0].qty).toBe(20);
    expect(out[0].priceUSD).toBe(18);
  });

  it("parses with pipe separators", () => {
    const text = "Elfbar TE Watermelon | 15 | $20";
    const out = parseTextLines(text, { knownBrands: ["Elfbar"] });
    expect(out[0].qty).toBe(15);
    expect(out[0].priceUSD).toBe(20);
  });

  it("strips bullet markers", () => {
    const text = "- Açai Banana (20u) 18u$\n• Watermelon (15) $20";
    const out = parseTextLines(text);
    expect(out).toHaveLength(2);
    expect(out[0].qty).toBe(20);
    expect(out[0].priceUSD).toBe(18);
    expect(out[1].qty).toBe(15);
  });

  it("strips numbered list prefixes", () => {
    const text = "1. Watermelon x10 $15\n2) Cherry x5 $14";
    const out = parseTextLines(text);
    expect(out).toHaveLength(2);
    expect(out[0].qty).toBe(10);
    expect(out[1].qty).toBe(5);
  });

  it("skips header/separator lines", () => {
    const text = "LISTA DE PRECIOS\n========\nElfbar TE Watermelon x10 $18\nstock disponible:\nLost Mary Cherry x5 $14";
    const out = parseTextLines(text, { knownBrands: ["Elfbar", "Lost Mary"] });
    expect(out.length).toBeGreaterThanOrEqual(2);
    const flavors = out.map(o => (o.raw || "").toLowerCase());
    expect(flavors.some(f => f.includes("watermelon"))).toBe(true);
    expect(flavors.some(f => f.includes("cherry"))).toBe(true);
  });

  it("extracts puffs from text", () => {
    const text = "Elfbar TE 30k Watermelon x10 $18";
    const out = parseTextLines(text, { knownBrands: ["Elfbar"] });
    expect(out[0].puffs).toBe("30000");
  });

  it("handles empty/null input gracefully", () => {
    expect(parseTextLines("")).toEqual([]);
    expect(parseTextLines(null)).toEqual([]);
  });

  it("ignores lines with only numbers or too short", () => {
    const text = "Elfbar Watermelon x10 $18\n123\n.";
    const out = parseTextLines(text, { knownBrands: ["Elfbar"] });
    expect(out).toHaveLength(1);
  });
});

describe("parsePdfText", () => {
  it("detects tabular text and uses spreadsheet parser", () => {
    const text =
      "Marca    Modelo    Sabor    Cantidad    Precio\n" +
      "Elfbar    TE    Watermelon Ice    20    18\n" +
      "Lost Mary    BM6000    Cherry Cola    15    14\n";
    const out = parsePdfText(text);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out[0].source).toBe("pdf");
  });

  it("falls back to text parser for free-form text", () => {
    const text = "Elfbar Watermelon x20 $18\nLost Mary Cherry x10 $14";
    const out = parsePdfText(text, { knownBrands: ["Elfbar", "Lost Mary"] });
    expect(out).toHaveLength(2);
    expect(out[0].source).toBe("pdf");
  });
});

describe("enrichWithMatches", () => {
  it("attaches topMatches and bestMatch to each item", () => {
    const items = [
      { brand: "Elfbar", model: "TE", flavor: "Watermelon Ice", qty: 20, priceUSD: 18, raw: "Elfbar TE Watermelon Ice" },
    ];
    const enriched = enrichWithMatches(items, CATALOG, matchProduct);
    expect(enriched[0].topMatches).toBeDefined();
    expect(enriched[0].bestMatch).toBeTruthy();
    expect(enriched[0].bestMatch.product.id).toBe("p1");
    expect(enriched[0].confidence).toBe("high");
  });

  it("marks medium confidence when only brand+flavor matches (no model)", () => {
    const items = [
      { brand: "Elfbar", flavor: "Watermelon Ice", qty: 20, priceUSD: 18, raw: "Elfbar Watermelon" },
    ];
    const enriched = enrichWithMatches(items, CATALOG, matchProduct);
    expect(enriched[0].bestMatch.product.id).toBe("p1");
    expect(["medium", "high"]).toContain(enriched[0].confidence);
  });

  it("marks low confidence for unknown products", () => {
    const items = [
      { brand: "Marca Nueva", flavor: "Sabor Desconocido Random", qty: 5, priceUSD: 10, raw: "Marca Nueva Sabor" },
    ];
    const enriched = enrichWithMatches(items, CATALOG, matchProduct);
    expect(enriched[0].confidence).toBe("low");
  });

  it("handles empty list", () => {
    expect(enrichWithMatches([], CATALOG, matchProduct)).toEqual([]);
    expect(enrichWithMatches(null, CATALOG, matchProduct)).toEqual([]);
  });
});

describe("COLUMN_ALIASES", () => {
  it("has aliases for all 6 canonical fields", () => {
    expect(Object.keys(COLUMN_ALIASES).sort()).toEqual(
      ["brand", "flavor", "model", "priceUSD", "puffs", "qty"]
    );
  });
});
