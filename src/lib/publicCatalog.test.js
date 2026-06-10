import { describe, it, expect } from "vitest";
import { createCatalogSnapshot, catalogPublicURL, catalogShareMessage, clientOrderLink, isCatalogExpired } from "./publicCatalog.js";

const PRODUCTS = [
  { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon", puffs: 30000, stock: 5, priceARS: 30000 },
  { id: "p2", brand: "Lost Mary", model: "BM", flavor: "Cherry", puffs: 6000, stock: 3, priceUSD: 14 },
  { id: "p3", brand: "Geek", model: "X", flavor: "Mango", stock: 0 }, // sin stock NO incluir
  { id: "p4", brand: "X", isDeleted: true, stock: 99 }, // borrado NO incluir
];

describe("createCatalogSnapshot", () => {
  it("genera snapshot con slug + items en stock", () => {
    const s = createCatalogSnapshot({ products: PRODUCTS, exchangeRate: 1000 });
    expect(s.slug).toBeTruthy();
    expect(s.items).toHaveLength(2);
    expect(s.items.find(i => i.id === "p3")).toBeFalsy();
    expect(s.items.find(i => i.id === "p4")).toBeFalsy();
  });

  it("calcula priceARS desde priceUSD si no hay priceARS", () => {
    const s = createCatalogSnapshot({ products: [PRODUCTS[1]], exchangeRate: 1500 });
    expect(s.items[0].priceARS).toBe(21000); // 14 × 1500
  });

  it("incluye stats agregados", () => {
    const s = createCatalogSnapshot({ products: PRODUCTS, exchangeRate: 1000 });
    expect(s.stats.productCount).toBe(2);
    expect(s.stats.totalUnits).toBe(8);
    expect(s.stats.brands).toBe(2);
  });

  it("expiresAt por defecto = 14 días", () => {
    const s = createCatalogSnapshot({ products: PRODUCTS });
    const days = (new Date(s.expiresAt) - new Date(s.createdAt)) / 86400000;
    expect(Math.round(days)).toBe(14);
  });

  it("acepta promoNote opcional", () => {
    const s = createCatalogSnapshot({ products: PRODUCTS, promoNote: "Envío gratis este fin de semana" });
    expect(s.promoNote).toBe("Envío gratis este fin de semana");
  });
});

describe("catalogPublicURL", () => {
  it("arma URL /c/<slug>", () => {
    const url = catalogPublicURL("junio-abc1", "https://miapp.com");
    expect(url).toBe("https://miapp.com/c/junio-abc1");
  });
});

describe("catalogShareMessage", () => {
  it("genera mensaje WA con link y stats", () => {
    const snap = createCatalogSnapshot({ products: PRODUCTS, exchangeRate: 1000 });
    const url = catalogPublicURL(snap.slug, "https://miapp.com");
    const msg = catalogShareMessage(snap, url);
    expect(msg).toContain("IMPORTS ZONA NORTE");
    expect(msg).toContain(url);
    expect(msg).toContain("2 sabores");
  });

  it("incluye promoNote si existe", () => {
    const snap = createCatalogSnapshot({ products: PRODUCTS, promoNote: "PROMO: Envío gratis" });
    const msg = catalogShareMessage(snap, "https://m.com/c/x");
    expect(msg).toContain("PROMO: Envío gratis");
  });
});

describe("clientOrderLink", () => {
  it("arma wa.me con productos pre-seleccionados", () => {
    const snap = createCatalogSnapshot({ products: PRODUCTS, exchangeRate: 1000 });
    const link = clientOrderLink(snap, ["p1"]);
    expect(link).toContain("wa.me/5491168725293");
    expect(decodeURIComponent(link)).toContain("Watermelon");
  });
});

describe("isCatalogExpired", () => {
  it("false si todavía no expiró", () => {
    const snap = createCatalogSnapshot({ products: PRODUCTS });
    expect(isCatalogExpired(snap)).toBe(false);
  });
  it("true si expiresAt en el pasado", () => {
    const snap = { expiresAt: "2020-01-01T00:00:00" };
    expect(isCatalogExpired(snap)).toBe(true);
  });
});

import { encodeCatalogToURL, decodeCatalogFromURL, isCatalogURL } from "./publicCatalog.js";

describe("encodeCatalogToURL / decodeCatalogFromURL — roundtrip", () => {
  it("encode + decode devuelve snapshot equivalente", () => {
    const snap = createCatalogSnapshot({ products: PRODUCTS, exchangeRate: 1000 });
    const url = encodeCatalogToURL(snap, "https://miapp.com");
    expect(url).toContain("/c/");
    expect(url).toContain("#d=");
    const decoded = decodeCatalogFromURL(url);
    expect(decoded).toBeTruthy();
    expect(decoded.slug).toBe(snap.slug);
    expect(decoded.items.length).toBe(snap.items.length);
  });

  it("handles caracteres unicode (emojis, ñ)", () => {
    const snap = createCatalogSnapshot({ products: PRODUCTS, promoNote: "🎉 Envío gratis ñoño" });
    const url = encodeCatalogToURL(snap, "https://m.com");
    const decoded = decodeCatalogFromURL(url);
    expect(decoded.promoNote).toBe("🎉 Envío gratis ñoño");
  });

  it("decode devuelve null para URL sin hash", () => {
    expect(decodeCatalogFromURL("https://m.com/c/x")).toBeNull();
  });

  it("decode devuelve null para hash inválido", () => {
    expect(decodeCatalogFromURL("https://m.com/c/x#d=garbage!!!")).toBeNull();
  });
});

describe("isCatalogURL", () => {
  it("detecta paths /c/...", () => {
    expect(isCatalogURL("/c/junio-abc1")).toBe(true);
    expect(isCatalogURL("/dashboard")).toBe(false);
    expect(isCatalogURL("/")).toBe(false);
  });
});
