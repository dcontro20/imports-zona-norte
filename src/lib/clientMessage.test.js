import { describe, it, expect } from "vitest";
import { clientFavoritesInStock, buildClientMessage } from "./clientMessage.js";

const products = [
  { id: "p1", brand: "Elfbar", model: "BC10000", flavor: "Sandía", priceUSD: 10, stock: 5 },
  { id: "p2", brand: "Lost Mary", model: "OS5000", flavor: "Menta", priceUSD: 9, stock: 0 }, // sin stock
  { id: "p3", brand: "Ignite", model: "V80", flavor: "Uva", priceUSD: 12, stock: 3 },
];
const sales = [
  { clientId: "c1", items: [{ productId: "p1", qty: 2 }, { productId: "p3", qty: 1 }] },
  { clientId: "c1", items: [{ productId: "p1", qty: 1 }] },
  { clientId: "c1", items: [{ productId: "p2", qty: 5 }] }, // p2 sin stock → no aparece
  { clientId: "c2", items: [{ productId: "p3", qty: 9 }] }, // otro cliente
];

describe("clientFavoritesInStock", () => {
  it("ordena por frecuencia y excluye sin stock", () => {
    const favs = clientFavoritesInStock("c1", sales, products);
    expect(favs.map(p => p.id)).toEqual(["p1", "p3"]); // p1 (3) > p3 (1); p2 excluido sin stock
  });
  it("vacío si el cliente no compró nada en stock", () => {
    expect(clientFavoritesInStock("cX", sales, products)).toEqual([]);
  });
});

describe("buildClientMessage", () => {
  it("personaliza con nombre y favoritos en stock", () => {
    const stat = { id: "c1", name: "Ana", daysSinceLast: 20 };
    const msg = buildClientMessage(stat, sales, products, { exchangeRate: 1000 });
    expect(msg.text).toContain("¡Hola Ana!");
    expect(msg.text).toContain("Hace 20 días");
    expect(msg.text).toContain("Elfbar BC10000 — Sandía");
    expect(msg.text).toContain("Ignite V80 — Uva");
    expect(msg.text).not.toContain("Lost Mary"); // sin stock
    expect(msg.hasStock).toBe(true);
    expect(msg.productsUsed).toHaveLength(2);
  });

  it("precio convertido con rate", () => {
    const stat = { id: "c1", name: "Ana", daysSinceLast: 5 };
    const msg = buildClientMessage(stat, sales, products, { exchangeRate: 1000 });
    expect(msg.text).toContain("$10.000"); // 10 USD * 1000
  });

  it("sin favoritos en stock → ofrece lista", () => {
    const stat = { id: "cX", name: "Beto", daysSinceLast: 3 };
    const msg = buildClientMessage(stat, sales, products, {});
    expect(msg.hasStock).toBe(false);
    expect(msg.text).toContain("¿Querés que te pase la lista");
  });

  it("sin nombre no rompe", () => {
    const msg = buildClientMessage({ id: "c1", daysSinceLast: 30 }, sales, products, {});
    expect(msg.text).toContain("¡Hola!");
  });

  it("recencia baja usa gancho neutro", () => {
    const msg = buildClientMessage({ id: "c1", name: "Ana", daysSinceLast: 2 }, sales, products, {});
    expect(msg.text).toContain("novedades");
    expect(msg.text).not.toContain("Hace 2 días");
  });
});
