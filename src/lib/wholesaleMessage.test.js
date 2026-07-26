import { describe, it, expect } from "vitest";
import { cobranzaMessage, presentationMessage, priceListItems, priceListText } from "./wholesaleMessage.js";

const NOW = new Date("2026-07-14T12:00:00Z").getTime();
const ago = (d) => new Date(NOW - d * 86400000).toISOString();

const client = { id: "c1", businessName: "Kiosco A", contactName: "Ana" };
const sales = [
  { id: "s1", saleType: "mayorista", clientId: "c1", total: 30000, payments: [], date: ago(40) },
  { id: "s2", saleType: "mayorista", clientId: "c1", total: 15000, payments: [{ amount: 5000 }], date: ago(2) },
];

describe("cobranzaMessage", () => {
  it("arma el mensaje con total, detalle y días del más viejo", () => {
    const msg = cobranzaMessage(client, sales, NOW);
    expect(msg).toContain("Ana");
    expect(msg).toContain("Total a saldar: $40.000");
    expect(msg).toContain("$30.000 pendiente");
    expect(msg).toContain("$10.000 pendiente");
    expect(msg).toContain("40 días");
  });
  it("devuelve vacío si no debe nada", () => {
    expect(cobranzaMessage({ id: "z" }, sales, NOW)).toBe("");
    const pagado = [{ id: "x", saleType: "mayorista", clientId: "c9", total: 100, payments: [{ amount: 100 }], date: ago(1) }];
    expect(cobranzaMessage({ id: "c9" }, pagado, NOW)).toBe("");
  });
});

describe("presentationMessage (Bloque 2 — front de ventas)", () => {
  const products = [
    { id: "p1", brand: "Elfbar", model: "TE", flavor: "Sandía", stock: 10, priceUSD: 25, priceByChannel: { mayorista_c: 18 } },
    { id: "p2", brand: "Lost Mary", model: "BM", flavor: "Cherry", stock: 5, priceUSD: 20, priceByChannel: { mayorista_c: 15 } },
    { id: "p3", brand: "Geek", model: "P", flavor: "Mango", stock: 0, priceUSD: 22, priceByChannel: { mayorista_c: 16 } }, // sin stock
    { id: "p4", brand: "Nikbar", model: "X", flavor: "Uva", stock: 8, priceUSD: 19 }, // sin lista de tier
  ];
  it("saluda al contacto, menciona la zona y muestra precios del tier (solo con stock + lista)", () => {
    const msg = presentationMessage(
      { businessName: "Kiosco Mario", contactName: "Mario", zone: "Tigre" },
      { tier: "C", products, exchangeRate: 1000 }
    );
    expect(msg).toContain("Hola Mario!");
    expect(msg).toContain("de Tigre");
    expect(msg).toContain("Elfbar TE Sandía: $18.000");
    expect(msg).toContain("Lost Mary BM Cherry: $15.000");
    expect(msg).not.toContain("Mango");   // sin stock
    expect(msg).not.toContain("Nikbar");  // sin lista de tier
  });
  it("sin productos con tier o sin rate → mensaje sin bloque de precios, igual usable", () => {
    const msg = presentationMessage({ businessName: "Kiosco X" }, { tier: "A", products, exchangeRate: 1000 });
    expect(msg).not.toContain("referencia de precios");
    expect(msg).toContain("Imports Zona Norte");
    expect(msg).toContain("lista completa");
  });
  it("target mínimo (sin contacto/zona) no rompe", () => {
    const msg = presentationMessage({}, { tier: "B" });
    expect(msg.startsWith("Hola!")).toBe(true);
  });
});

describe("priceListItems / priceListText (Bloque 2.2 — lista de precios)", () => {
  const products = [
    { id: "p1", brand: "Elfbar", model: "TE", flavor: "Sandía", stock: 10, priceUSD: 25, priceByChannel: { mayorista_b: 20 } },
    { id: "p2", brand: "Elfbar", model: "TE", flavor: "Ananá", stock: 4, priceUSD: 25, priceByChannel: { mayorista_b: 20 } },
    { id: "p3", brand: "Lost Mary", model: "BM", flavor: "Cherry", stock: 5, priceUSD: 22, priceByChannel: { mayorista_b: 17 } },
    { id: "p4", brand: "Elfbar", model: "TE", flavor: "Uva", stock: 0, priceUSD: 25, priceByChannel: { mayorista_b: 20 } },  // sin stock
    { id: "p5", brand: "Geek", model: "P", flavor: "Mango", stock: 9, priceUSD: 21 },                                        // sin lista tier B
    { id: "p6", brand: "Nikbar", model: "X", flavor: "Menta", stock: 3, priceUSD: 19, isDeleted: true, priceByChannel: { mayorista_b: 15 } },
  ];
  it("agrupa por marca (alfabético) y filtra sin stock / sin lista / borrados", () => {
    const groups = priceListItems(products, "B", 1000);
    expect(groups.map(g => g.brand)).toEqual(["Elfbar", "Lost Mary"]);
    expect(groups[0].items.map(i => i.label)).toEqual(["TE Ananá", "TE Sandía"]);
    expect(groups[0].items[0].priceARS).toBe(20000);
  });
  it("el texto NO menciona el tier y lleva fecha + disclaimer del dólar", () => {
    const txt = priceListText(products, { tier: "B", exchangeRate: 1000, now: new Date("2026-07-24T12:00:00") });
    expect(txt).not.toMatch(/tier/i);
    expect(txt).toContain("Precios al 24/07/2026");
    expect(txt).toContain("sujetos a variación del dólar");
    expect(txt).toContain("*ELFBAR*");
    expect(txt).toContain("• TE Sandía — $20.000");
    expect(txt).not.toContain("Uva");   // sin stock
    expect(txt).not.toContain("Mango"); // sin lista de tier
  });
  it("sin productos con lista → texto vacío", () => {
    expect(priceListText(products, { tier: "A", exchangeRate: 1000 })).toBe("");
  });
});
