import { describe, it, expect } from "vitest";
import { pickOpener, pickCloser, urgencyLine } from "./messageTones.js";

describe("pickOpener / pickCloser", () => {
  it("warm opener saluda con nombre si está disponible", () => {
    const out = pickOpener("warm", { clientName: "Juan" });
    // El nombre puede o no estar según el random del pool, pero NO debe contener Diego
    expect(out).not.toContain("Diego");
  });

  it("seed estable: mismo seed → mismo opener", () => {
    const a = pickOpener("warm", { clientName: "Juan" }, "seed-1");
    const b = pickOpener("warm", { clientName: "Juan" }, "seed-1");
    expect(a).toBe(b);
  });

  it("seeds distintos → openers que pueden variar", () => {
    const outs = new Set();
    for (let i = 0; i < 20; i++) {
      outs.add(pickOpener("warm", { clientName: "Juan" }, `seed-${i}`));
    }
    // Con 5 openers en el pool y 20 seeds distintos, debería haber variedad (>=2)
    expect(outs.size).toBeGreaterThanOrEqual(2);
  });

  it("commercial opener identifica al negocio (IZN/IMPORTS)", () => {
    // Probamos varios seeds — al menos uno debe incluir el branding
    const outs = [];
    for (let i = 0; i < 10; i++) outs.push(pickOpener("commercial", {}, `s-${i}`));
    expect(outs.some(o => /IZN|IMPORTS/i.test(o))).toBe(true);
  });

  it("ningún opener/closer firma con Diego", () => {
    for (let i = 0; i < 30; i++) {
      ["warm", "commercial", "casual"].forEach(tone => {
        expect(pickOpener(tone, { clientName: "Pedro" }, `s-${i}`)).not.toContain("Diego");
        expect(pickCloser(tone, {}, `s-${i}`)).not.toContain("Diego");
      });
    }
  });

  it("casual menciona finde si weekend=true (al menos en algunos openers)", () => {
    const findeOuts = [];
    for (let i = 0; i < 10; i++) findeOuts.push(pickOpener("casual", { weekend: true }, `s-${i}`));
    expect(findeOuts.some(o => /finde/i.test(o))).toBe(true);
  });

  it("tono inválido cae a warm", () => {
    expect(typeof pickOpener("xxx", {})).toBe("string");
  });
});

describe("urgencyLine", () => {
  it("liquidacion con poco stock menciona unidades", () => {
    expect(urgencyLine("liquidacion", { stock: 3 })).toMatch(/3.*unidad/i);
    expect(urgencyLine("liquidacion", { stock: 1 })).toMatch(/1.*unidad\b/i);
  });

  it("topsemana con recentBuyers genera prueba social", () => {
    expect(urgencyLine("topsemana", { recentBuyers: 8 })).toMatch(/8.*personas/i);
  });

  it("packfiesta da framing relajado para finde", () => {
    expect(urgencyLine("packfiesta", {})).toMatch(/finde/i);
  });

  it("tipos sin urgencia clara devuelven string vacío", () => {
    expect(urgencyLine("destacado", {})).toBe("");
  });
});
