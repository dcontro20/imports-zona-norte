import { describe, it, expect } from "vitest";
import { cobranzaMessage } from "./wholesaleMessage.js";

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
