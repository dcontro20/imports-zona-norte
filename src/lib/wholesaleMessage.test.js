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

describe("presentationMessage — primer contacto (2026-08-07: uno solo para todos)", () => {
  it("es EXACTAMENTE el texto acordado, con el nombre del kiosco", () => {
    const msg = presentationMessage({ businessName: "Kiosco Mario" }, { remitente: "Gustavo" });
    expect(msg).toBe("Hola, ¿cómo estás? Mi nombre es Gustavo. ¿Me comunico con Kiosco Mario?");
  });

  it("el remitente es quien escribe: el mismo texto sale firmado por Diego", () => {
    const msg = presentationMessage({ businessName: "Kiosco Mario" }, { remitente: "Diego" });
    expect(msg).toBe("Hola, ¿cómo estás? Mi nombre es Diego. ¿Me comunico con Kiosco Mario?");
  });

  // Lo que este cambio SACÓ: nada de tier, precios, marcas ni zona. El primer
  // mensaje no vende — solo confirma con quién estás hablando.
  it("no lleva precios, tier, marcas ni zona", () => {
    const msg = presentationMessage(
      { businessName: "Kiosco Mario", contactName: "Mario", zone: "Tigre", wholesaleTier: "A" },
      { remitente: "Gustavo" },
    );
    expect(msg).not.toMatch(/\$|precio|lista|Elfbar|Lost Mary|mayorista|Tigre|Imports/i);
    expect(msg.split("\n")).toHaveLength(1);
  });

  it("el mismo texto para cualquier kiosco: solo cambia el nombre", () => {
    const a = presentationMessage({ businessName: "Kiosco A", wholesaleTier: "A" }, { remitente: "Gustavo" });
    const b = presentationMessage({ businessName: "Kiosco B", wholesaleTier: "C" }, { remitente: "Gustavo" });
    expect(a.replace("Kiosco A", "X")).toBe(b.replace("Kiosco B", "X"));
  });

  it("un cliente mayorista usa `name` si no tiene businessName", () => {
    expect(presentationMessage({ name: "Maxi Munro" }, { remitente: "Gustavo" }))
      .toContain("¿Me comunico con Maxi Munro?");
  });

  it("sin nombre del negocio NO inventa la pregunta; sin remitente no firma", () => {
    expect(presentationMessage({}, { remitente: "Gustavo" })).toBe("Hola, ¿cómo estás? Mi nombre es Gustavo.");
    expect(presentationMessage({ businessName: "Kiosco X" })).toBe("Hola, ¿cómo estás? ¿Me comunico con Kiosco X?");
    expect(presentationMessage()).toBe("Hola, ¿cómo estás?");
  });
});

// (F6: los tests de priceListItems/priceListText se retiraron con los
// generadores por tier — la lista compartible vive en
// wholesaleMessage.escalones.test.js contra la lista PUBLICADA.)
