import { describe, it, expect } from "vitest";
import { cobranzaMessage, presentationMessage } from "./wholesaleMessage.js";

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
