import { describe, it, expect } from "vitest";
import {
  normalize, tokenize, levenshtein, stringSimilarity,
  brandMatch, extractPuffs, matchProduct, confidenceMeta,
} from "./fuzzyMatch.js";

const CATALOG = [
  { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon Ice", puffs: "30000" },
  { id: "p2", brand: "Elfbar", model: "TE", flavor: "Açai Banana Ice", puffs: "30000" },
  { id: "p3", brand: "Elfbar", model: "Ice King", flavor: "Watermelon Ice", puffs: "40000" },
  { id: "p4", brand: "Lost Mary", model: "BM6000", flavor: "Cherry Cola", puffs: "6000" },
  { id: "p5", brand: "Lost Mary", model: "BM6000", flavor: "Blueberry Sour", puffs: "6000" },
  { id: "p6", brand: "Geek Bar", model: "Pulse", flavor: "Mango Ice", puffs: "15000" },
];

describe("normalize", () => {
  it("strips diacritics", () => {
    expect(normalize("Açaí Bañó")).toBe("acai bano");
  });
  it("lowercases and collapses spaces", () => {
    expect(normalize("  HELLO   World  ")).toBe("hello world");
  });
  it("removes punctuation", () => {
    expect(normalize("Tutti-Frutti, Mix!")).toBe("tutti frutti mix");
  });
  it("handles null/empty", () => {
    expect(normalize(null)).toBe("");
    expect(normalize(undefined)).toBe("");
    expect(normalize("")).toBe("");
  });
});

describe("tokenize", () => {
  it("splits into significant words", () => {
    expect(tokenize("Watermelon Ice de Açai")).toEqual(["watermelon", "ice", "acai"]);
  });
  it("removes stopwords", () => {
    expect(tokenize("la cherry y the cola")).toEqual(["cherry", "cola"]);
  });
});

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });
  it("returns full length when one is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });
  it("computes edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("watermelon", "watermellon")).toBe(1);
  });
});

describe("stringSimilarity", () => {
  it("returns 1 for identical after normalization", () => {
    expect(stringSimilarity("Açai Banana", "acai banana")).toBeCloseTo(1, 2);
  });
  it("returns near-1 for minor typo", () => {
    expect(stringSimilarity("watermelon ice", "watermellon ice")).toBeGreaterThan(0.85);
  });
  it("returns 0 for completely different strings", () => {
    expect(stringSimilarity("apple", "banana")).toBeLessThan(0.3);
  });
  it("handles empty strings", () => {
    expect(stringSimilarity("", "")).toBe(1);
    expect(stringSimilarity("a", "")).toBe(0);
  });
});

describe("brandMatch", () => {
  it("matches exact brand", () => {
    const r = brandMatch("Elfbar", ["Elfbar", "Lost Mary", "Geek Bar"]);
    expect(r.brand).toBe("Elfbar");
    expect(r.score).toBe(1);
  });
  it("matches brand with spaces", () => {
    const r = brandMatch("Elf Bar", ["Elfbar", "Lost Mary"]);
    expect(r.brand).toBe("Elfbar");
    expect(r.score).toBe(1);
  });
  it("matches brand case-insensitive", () => {
    const r = brandMatch("LOST MARY", ["Elfbar", "Lost Mary"]);
    expect(r.brand).toBe("Lost Mary");
  });
  it("returns null brand if no match candidates", () => {
    expect(brandMatch("", ["Elfbar"])).toEqual({ brand: null, score: 0 });
  });
});

describe("extractPuffs", () => {
  it("parses 30k notation", () => {
    expect(extractPuffs("Elfbar TE 30k")).toBe("30000");
  });
  it("parses raw number", () => {
    expect(extractPuffs("30000 puffs")).toBe("30000");
  });
  it("parses with puffs suffix", () => {
    expect(extractPuffs("Modelo X 15000 puffs")).toBe("15000");
  });
  it("returns null when none found", () => {
    expect(extractPuffs("solo texto")).toBeNull();
    expect(extractPuffs("")).toBeNull();
  });
});

describe("matchProduct", () => {
  it("returns high-confidence match for exact brand+model+flavor", () => {
    const r = matchProduct(
      { brand: "Elfbar", model: "TE", flavor: "Watermelon Ice" },
      CATALOG
    );
    expect(r[0].product.id).toBe("p1");
    expect(r[0].confidence).toBe("high");
  });

  it("disambiguates by puffs when brand/flavor coincide", () => {
    const r40k = matchProduct(
      { brand: "Elfbar", flavor: "Watermelon Ice", puffs: "40000" },
      CATALOG
    );
    expect(r40k[0].product.id).toBe("p3");
  });

  it("handles typos with medium confidence", () => {
    const r = matchProduct(
      { brand: "Elfbar", flavor: "Watermellon Ice" }, // typo
      CATALOG
    );
    expect(r[0].product.id).toBe("p1");
    expect(["medium", "high"]).toContain(r[0].confidence);
  });

  it("matches diacritics-insensitive", () => {
    const r = matchProduct(
      { brand: "Elfbar", flavor: "Acai Banana" }, // no acentos
      CATALOG
    );
    expect(r[0].product.id).toBe("p2");
  });

  it("returns low confidence for unknown product", () => {
    const r = matchProduct(
      { brand: "Elfbar", flavor: "Producto Nuevo Random Inventado" },
      CATALOG
    );
    expect(r[0].confidence).toBe("low");
  });

  it("infers brand from raw text when not provided", () => {
    const r = matchProduct(
      { raw: "Lost Mary BM6000 Cherry Cola" },
      CATALOG
    );
    expect(r[0].product.brand).toBe("Lost Mary");
  });

  it("returns empty array for empty catalog", () => {
    expect(matchProduct({ brand: "X" }, [])).toEqual([]);
  });

  it("limits to topN", () => {
    const r = matchProduct({ raw: "Elfbar" }, CATALOG, { topN: 2 });
    expect(r.length).toBeLessThanOrEqual(2);
  });

  it("scores include breakdown for debugging", () => {
    const r = matchProduct({ brand: "Elfbar", flavor: "Watermelon Ice" }, CATALOG);
    expect(r[0].breakdown).toBeDefined();
    expect(r[0].breakdown.flavorScore).toBeGreaterThan(0.5);
  });
});

describe("confidenceMeta", () => {
  it("maps high to green", () => {
    expect(confidenceMeta("high").emoji).toBe("🟢");
  });
  it("maps medium to amber", () => {
    expect(confidenceMeta("medium").emoji).toBe("🟡");
  });
  it("maps low/default to red", () => {
    expect(confidenceMeta("low").emoji).toBe("🔴");
    expect(confidenceMeta(undefined).emoji).toBe("🔴");
  });
});
