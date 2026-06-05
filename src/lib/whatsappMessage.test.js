import { describe, it, expect } from "vitest";
import {
  generateFullMessage,
  generateShortMessage,
  quickMessageStats,
  getFlavorEmojis,
} from "./whatsappMessage.js";

const RATE = 1500;

const PRODUCTS = [
  { id: "p1", brand: "Elfbar",    model: "TE",    flavor: "Watermelon Ice", puffs: 30000, priceUSD: 25, stock: 8 },
  { id: "p2", brand: "Elfbar",    model: "TE",    flavor: "Cherry",         puffs: 30000, priceUSD: 25, stock: 3 },
  { id: "p3", brand: "Elfbar",    model: "TE",    flavor: "Mango",          puffs: 30000, priceUSD: 25, stock: 0 }, // sin stock
  { id: "p4", brand: "Lost Mary", model: "BM",    flavor: "Cherry Cola",    puffs: 6000,  priceUSD: 14, stock: 5 },
  { id: "p5", brand: "Geek Bar",  model: "Pulse", flavor: "Mango",          puffs: 15000, priceUSD: 18, stock: 2 },
];

describe("getFlavorEmojis", () => {
  it("detecta emojis por palabra del sabor", () => {
    expect(getFlavorEmojis("Watermelon Ice")).toContain("🍉");
    expect(getFlavorEmojis("Watermelon Ice")).toContain("🧊");
  });
  it("devuelve 💨 si no hay match", () => {
    expect(getFlavorEmojis("Tropical Blast")).toBe("💨");
  });
  it("evita duplicados", () => {
    const result = getFlavorEmojis("Ice Ice Cool");
    // 🧊 una sola vez aunque "ice" aparece 2 veces
    expect((result.match(/🧊/g) || []).length).toBe(1);
  });
  it("handles null/undefined", () => {
    expect(getFlavorEmojis(null)).toBe("💨");
    expect(getFlavorEmojis(undefined)).toBe("💨");
    expect(getFlavorEmojis("")).toBe("💨");
  });
});

describe("generateFullMessage", () => {
  it("incluye el header de IZN con contactos", () => {
    const msg = generateFullMessage(PRODUCTS, RATE);
    expect(msg).toContain("IMPORTS ZONA NORTE");
    expect(msg).toContain("IG: @imports.zonanorte");
    expect(msg).toContain("11 6872 5293");
    expect(msg).toContain("Garantía");
  });

  it("incluye productos con stock", () => {
    const msg = generateFullMessage(PRODUCTS, RATE);
    expect(msg).toContain("Watermelon Ice");
    expect(msg).toContain("Cherry Cola");
    expect(msg).toContain("Cherry");
  });

  it("excluye productos sin stock", () => {
    const msg = generateFullMessage(PRODUCTS, RATE);
    // Elfbar TE Mango (p3) está sin stock, Geek Bar Pulse Mango (p5) tiene stock
    // entonces "Mango" solo aparece UNA vez (el de Geek Bar)
    expect(msg.match(/Mango/g)?.length).toBe(1);
  });

  it("calcula precio ARS con el rate", () => {
    const msg = generateFullMessage(PRODUCTS, RATE);
    // Elfbar 25 USD * 1500 = 37500 ARS
    expect(msg).toContain("37.500");
  });

  it("agrupa por marca+modelo+puffs", () => {
    const msg = generateFullMessage(PRODUCTS, RATE);
    // Elfbar TE debería aparecer una sola vez como header de modelo
    const headers = msg.match(/\*ELFBAR TE/g);
    expect(headers?.length).toBe(1);
  });

  it("respeta el orden de marcas (Elfbar primero)", () => {
    const msg = generateFullMessage(PRODUCTS, RATE);
    const elfbarIdx = msg.indexOf("ELFBAR");
    const lostMaryIdx = msg.indexOf("LOST MARY");
    const geekIdx = msg.indexOf("GEEK BAR");
    expect(elfbarIdx).toBeLessThan(geekIdx);
    expect(geekIdx).toBeLessThan(lostMaryIdx);
  });

  it("handles array vacío", () => {
    const msg = generateFullMessage([], RATE);
    expect(msg).toContain("IMPORTS ZONA NORTE");
    expect(msg).not.toContain("PUFFS");
  });
});

describe("generateShortMessage", () => {
  it("incluye solo productos con stock", () => {
    const msg = generateShortMessage(PRODUCTS, RATE);
    expect(msg).toContain("Elfbar");
    expect(msg).toContain("Lost Mary");
  });

  it("muestra stock total agregado por modelo", () => {
    const msg = generateShortMessage(PRODUCTS, RATE);
    // Elfbar TE: 8 + 3 = 11 uds (el de Mango con 0 no cuenta)
    expect(msg).toContain("(11 uds)");
  });

  it("es más corto que el full", () => {
    const full = generateFullMessage(PRODUCTS, RATE);
    const short = generateShortMessage(PRODUCTS, RATE);
    expect(short.length).toBeLessThan(full.length);
  });
});

describe("quickMessageStats", () => {
  it("cuenta sabores con stock", () => {
    const stats = quickMessageStats(PRODUCTS);
    // p1, p2, p4, p5 tienen stock > 0 → 4 sabores
    expect(stats.inStockCount).toBe(4);
  });

  it("cuenta modelos activos", () => {
    const stats = quickMessageStats(PRODUCTS);
    // Elfbar TE, Lost Mary BM, Geek Bar Pulse → 3 modelos
    expect(stats.activeModels).toBe(3);
  });

  it("suma todas las unidades disponibles", () => {
    const stats = quickMessageStats(PRODUCTS);
    // 8 + 3 + 0 + 5 + 2 = 18
    expect(stats.totalUnits).toBe(18);
  });

  it("handles array vacío", () => {
    const stats = quickMessageStats([]);
    expect(stats.inStockCount).toBe(0);
    expect(stats.activeModels).toBe(0);
    expect(stats.totalUnits).toBe(0);
  });

  it("handles null", () => {
    const stats = quickMessageStats(null);
    expect(stats.inStockCount).toBe(0);
  });
});
