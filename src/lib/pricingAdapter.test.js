// pricingAdapter.test.js — la traducción app (sabores) → motor (modelos).
import { describe, it, expect } from "vitest";
import { productosParaMotor, claveModelo } from "./pricingAdapter.js";
import { generarLista } from "./pricingEngine.js";
import { DEFAULT_PRICING_POLICY } from "./pricingPolicy.js";

const sabor = (over = {}) => ({
  id: `p_${Math.abs(JSON.stringify(over).split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 1e9}`,
  brand: "Elfbar", model: "TE 30K", flavor: "Menta", stock: 5,
  priceUSD: 18, costUSDT: 8.5,
  ...over,
});

describe("productosParaMotor — agrupamiento por marca+modelo", () => {
  it("N sabores del mismo modelo colapsan en UN producto del motor", () => {
    const { productosMotor } = productosParaMotor([
      sabor({ id: "a", flavor: "Menta" }),
      sabor({ id: "b", flavor: "Sandía" }),
      sabor({ id: "c", flavor: "Uva" }),
    ]);
    expect(productosMotor).toHaveLength(1);
    expect(productosMotor[0]).toMatchObject({
      id: "Elfbar|TE 30K", marca: "Elfbar", modelo: "TE 30K",
      costo: 8.5, precioReferencia: 18, sabores: 3,
    });
    expect(productosMotor[0].productIds.sort()).toEqual(["a", "b", "c"]);
  });

  it("el pricing es por modelo pero los ids de sabor viajan (el cotizador cuenta por sabor)", () => {
    const { productosMotor } = productosParaMotor([
      sabor({ id: "a" }), sabor({ id: "b", model: "GH 23K", costUSDT: 8.8 }),
    ]);
    expect(productosMotor.map((p) => p.id)).toEqual(["Elfbar|GH 23K", "Elfbar|TE 30K"]);
    expect(productosMotor.every((p) => p.productIds.length === 1)).toBe(true);
  });

  it("borrados no entran; modelo sin costUSDT sale con costo 0 (RN-18 lo excluye después)", () => {
    const { productosMotor } = productosParaMotor([
      sabor({ id: "a", isDeleted: true }),
      sabor({ id: "b", model: "Sin Costo", costUSDT: 0 }),
    ]);
    expect(productosMotor).toHaveLength(1);
    expect(productosMotor[0].costo).toBe(0);
    const lista = generarLista(productosMotor, DEFAULT_PRICING_POLICY);
    expect(lista.sinCosto).toEqual(["Elfbar|Sin Costo"]);
  });

  it("costos distintos dentro del modelo: usa el MÁXIMO y reporta inconsistencia", () => {
    const { productosMotor, inconsistencias } = productosParaMotor([
      sabor({ id: "a", costUSDT: 8.5 }), sabor({ id: "b", costUSDT: 9 }),
    ]);
    expect(productosMotor[0].costo).toBe(9); // conservador: protege el margen
    expect(inconsistencias).toEqual([
      { id: "Elfbar|TE 30K", tipo: "costo", valores: [8.5, 9] },
    ]);
  });

  it("minoristas distintos dentro del modelo: usa el MÍNIMO (validación de canal más estricta)", () => {
    const { productosMotor, inconsistencias } = productosParaMotor([
      sabor({ id: "a", priceUSD: 18 }), sabor({ id: "b", priceUSD: 20 }),
    ]);
    expect(productosMotor[0].precioReferencia).toBe(18);
    expect(inconsistencias.some((i) => i.tipo === "minorista")).toBe(true);
  });

  it("precio de calle: convierte ARS→USD con el fx dado (el motor es agnóstico de moneda)", () => {
    const { productosMotor } = productosParaMotor(
      [sabor({ streetPriceARS: 38000 })], { fx: 1530 });
    expect(productosMotor[0].precioMercado).toBeCloseTo(38000 / 1530, 10);
  });

  it("sin fx no manda precioMercado (la validación opcional no corre sin dato)", () => {
    const { productosMotor } = productosParaMotor([sabor({ streetPriceARS: 38000 })]);
    expect(productosMotor[0].precioMercado).toBeUndefined();
  });

  it("claveModelo es estable y defensiva", () => {
    expect(claveModelo({ brand: "Ignite", model: "V250" })).toBe("Ignite|V250");
    expect(claveModelo(null)).toBe("|");
  });
});
