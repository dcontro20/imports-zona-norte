// pricingPolicy.test.js — la política como datos: defaults completos,
// normalización de esquemas viejos, validación de edición y banda de sanidad FX.
import { describe, it, expect } from "vitest";
import {
  DEFAULT_PRICING_POLICY,
  normalizarPolitica,
  validarPolitica,
  fxDentroDeBanda,
} from "./pricingPolicy.js";
import { generarLista } from "./pricingEngine.js";

describe("DEFAULT_PRICING_POLICY — v2026-08 aprobada", () => {
  it("es una política válida", () => {
    expect(validarPolitica(DEFAULT_PRICING_POLICY)).toEqual([]);
  });
  it("alimenta al motor directamente (contrato compatible)", () => {
    const lista = generarLista([{ id: "p", costo: 8.5 }], DEFAULT_PRICING_POLICY);
    expect(lista.publicable).toBe(true);
    expect(lista.filas[0].precios.map((p) => p.precio)).toEqual([13.5, 13, 12.5, 12]);
  });
  it("RN-19: los números del documento estratégico están acá, no en el código", () => {
    expect(DEFAULT_PRICING_POLICY.costoAdicionalPct).toBe(0.13);
    expect(DEFAULT_PRICING_POLICY.escalones.map((e) => e.margen)).toEqual([0.28, 0.24, 0.21, 0.18]);
    expect(DEFAULT_PRICING_POLICY.margenMinimo).toBe(0.15);
    expect(DEFAULT_PRICING_POLICY.pedidoMinimo).toEqual({ unidades: 20, ticketUSD: 220 });
    expect(DEFAULT_PRICING_POLICY.bufferFxPct).toBe(0.03);
    expect(DEFAULT_PRICING_POLICY.vigenciaHoras).toBe(48);
    expect(DEFAULT_PRICING_POLICY.recargoPlazo).toEqual({ pct: 0.03, dias: 7 });
    expect(DEFAULT_PRICING_POLICY.umbralRecalculoPct).toBe(0.03);
  });
});

describe("normalizarPolitica — esquemas viejos salen completos", () => {
  it("null/undefined ⇒ defaults", () => {
    expect(normalizarPolitica(null)).toEqual(DEFAULT_PRICING_POLICY);
    expect(normalizarPolitica(undefined)).toEqual(DEFAULT_PRICING_POLICY);
  });
  it("los campos guardados ganan; los faltantes se completan", () => {
    const politica = normalizarPolitica({ margenMinimo: 0.2 });
    expect(politica.margenMinimo).toBe(0.2);
    expect(politica.escalones).toEqual(DEFAULT_PRICING_POLICY.escalones);
    expect(politica.recargoPlazo).toEqual({ pct: 0.03, dias: 7 });
  });
  it("mergea objetos anidados nivel a nivel", () => {
    const politica = normalizarPolitica({ validaciones: { margenCliente: { activa: false } } });
    expect(politica.validaciones.margenCliente).toEqual({ activa: false, umbral: 0.3 });
    expect(politica.validaciones.conflictoCanal).toEqual({ activa: true, umbral: 0.85 });
  });
  it("escalones: arreglo guardado gana entero, arreglo vacío no pisa los defaults", () => {
    const dos = [{ desde: 10, hasta: 99, margen: 0.3 }, { desde: 100, hasta: null, margen: 0.2 }];
    expect(normalizarPolitica({ escalones: dos }).escalones).toEqual(dos);
    expect(normalizarPolitica({ escalones: [] }).escalones).toEqual(DEFAULT_PRICING_POLICY.escalones);
  });
});

describe("validarPolitica — consistencia de una política editada", () => {
  const conEscalones = (escalones) => ({ ...DEFAULT_PRICING_POLICY, escalones });
  it("detecta huecos entre escalones", () => {
    const errores = validarPolitica(conEscalones([
      { desde: 20, hasta: 49, margen: 0.28 },
      { desde: 60, hasta: null, margen: 0.2 },
    ]));
    expect(errores.some((e) => e.includes("arrancar donde termina"))).toBe(true);
  });
  it("detecta márgenes que no decrecen", () => {
    const errores = validarPolitica(conEscalones([
      { desde: 20, hasta: 49, margen: 0.2 },
      { desde: 50, hasta: null, margen: 0.28 },
    ]));
    expect(errores.some((e) => e.includes("menor que el del escalón anterior"))).toBe(true);
  });
  it("solo el último escalón puede quedar sin techo", () => {
    const errores = validarPolitica(conEscalones([
      { desde: 20, hasta: null, margen: 0.28 },
      { desde: 50, hasta: null, margen: 0.2 },
    ]));
    expect(errores.some((e) => e.includes("solo el último escalón"))).toBe(true);
  });
  it("márgenes fuera de rango y múltiplo inválido", () => {
    expect(validarPolitica(conEscalones([{ desde: 20, hasta: null, margen: 1.2 }]))).not.toEqual([]);
    expect(validarPolitica({ ...DEFAULT_PRICING_POLICY, redondeo: { multiplo: 0 } })).not.toEqual([]);
  });
});

describe("fxDentroDeBanda — sanidad del FX automático", () => {
  it("dentro de la banda del 10%", () => {
    expect(fxDentroDeBanda(1500, 1600, 0.1)).toBe(true);  // +6,7%
    expect(fxDentroDeBanda(1500, 1650, 0.1)).toBe(true);  // +10% exacto: tolerado
    expect(fxDentroDeBanda(1500, 1400, 0.1)).toBe(true);  // -6,7%
  });
  it("fuera de la banda: no se aplica solo", () => {
    expect(fxDentroDeBanda(1500, 1651, 0.1)).toBe(false);
    expect(fxDentroDeBanda(1500, 1200, 0.1)).toBe(false);
    expect(fxDentroDeBanda(1500, 15000, 0.1)).toBe(false); // glitch ×10 de la API
  });
  it("sin último conocido se acepta; valor nuevo inválido se rechaza", () => {
    expect(fxDentroDeBanda(0, 1500, 0.1)).toBe(true);
    expect(fxDentroDeBanda(null, 1500, 0.1)).toBe(true);
    expect(fxDentroDeBanda(1500, 0, 0.1)).toBe(false);
    expect(fxDentroDeBanda(1500, NaN, 0.1)).toBe(false);
  });
  it("banda desactivada (umbral 0/null) acepta todo valor válido", () => {
    expect(fxDentroDeBanda(1500, 15000, 0)).toBe(true);
    expect(fxDentroDeBanda(1500, 15000, null)).toBe(true);
  });
});
