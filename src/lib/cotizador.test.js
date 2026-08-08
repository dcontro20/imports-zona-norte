// cotizador.test.js — cotización contra lista publicada, carga rápida (g),
// FX por fuentes con banda, presupuesto congelado y motivo de no-cierre.
import { describe, it, expect } from "vitest";
import {
  normalizarTexto, parseLineaRapida, buscarModelos, agregarLinea,
  cotizar, resolverFx, divergenciaFxConLista,
  emitirPresupuesto, presupuestoTexto, presupuestoVencido,
  marcarGanado, marcarPerdido, MOTIVOS_NO_CIERRE,
} from "./cotizador.js";
import { construirSnapshot } from "./priceLists.js";
import { DEFAULT_PRICING_POLICY } from "./pricingPolicy.js";

const POLITICA = DEFAULT_PRICING_POLICY; // mínimos 20u / USD 200, buffer 3%, 48hs, 3%/7d
const LISTA = construirSnapshot({
  productosMotor: [
    { id: "Lost Mary|MO 20K", marca: "Lost Mary", modelo: "MO 20K", costo: 6.5, productIds: [], sabores: 1 },
    { id: "Elfbar|TE 30K", marca: "Elfbar", modelo: "TE 30K", costo: 8.5, productIds: [], sabores: 1 },
    { id: "Elfbar|40K Sweet King", marca: "Elfbar", modelo: "40K Sweet King", costo: 9.75, productIds: [], sabores: 1 },
    { id: "Ignite|V250", marca: "Ignite", modelo: "V250", costo: 10, productIds: [], sabores: 1 },
  ],
  politica: POLITICA, version: "v2026-08", fecha: "2026-08-07T12:00:00.000Z",
});

describe("carga rápida (g) — parse de línea", () => {
  it("cantidad adelante o atrás, misma línea", () => {
    expect(parseLineaRapida("10 ice king")).toEqual({ qty: 10, consulta: "ice king" });
    expect(parseLineaRapida("ice king 10")).toEqual({ qty: 10, consulta: "ice king" });
  });
  it("sin cantidad ⇒ 1; los dígitos DENTRO del nombre no son cantidad", () => {
    expect(parseLineaRapida("te 30k")).toEqual({ qty: 1, consulta: "te 30k" });
    expect(parseLineaRapida("5 te 30k")).toEqual({ qty: 5, consulta: "te 30k" });
    expect(parseLineaRapida("v250")).toEqual({ qty: 1, consulta: "v250" });
  });
  it("vacío ⇒ nada", () => {
    expect(parseLineaRapida("")).toEqual({ qty: 0, consulta: "" });
  });
});

describe("carga rápida (g) — búsqueda de modelos", () => {
  it("lo que EMPIEZA con lo tipeado va antes que lo que lo contiene en el medio", () => {
    // "te" → TE 30K (empieza) primero; V250 matchea por contener ("Igni-te") y va después.
    const r = buscarModelos("te", LISTA);
    expect(r.map(f => f.modelo)).toEqual(["TE 30K", "V250"]);
    // "king" → Sweet King empieza por palabra del modelo... no: contiene. Chequeo
    // del otro lado: "sweet" empieza en el medio del modelo "40K Sweet King" →
    // igual matchea por contains.
    expect(buscarModelos("sweet", LISTA).map(f => f.modelo)).toEqual(["40K Sweet King"]);
  });
  it("matchea por marca además de modelo, sin mayúsculas ni acentos", () => {
    expect(buscarModelos("IGNITE", LISTA)[0].modelo).toBe("V250");
    expect(buscarModelos("élfbar", LISTA).length).toBeGreaterThan(0);
    expect(normalizarTexto("Élfbar  TÉ")).toBe("elfbar te");
  });
  it("consulta vacía ⇒ nada", () => {
    expect(buscarModelos("", LISTA)).toEqual([]);
  });
});

describe("carga rápida (g) — agregarLinea SUMA sobre el mismo modelo", () => {
  it("no crea segunda línea del mismo modelo; concatena notas", () => {
    let lineas = agregarLinea([], { modeloId: "Elfbar|TE 30K", qty: 5, nota: "menta" });
    lineas = agregarLinea(lineas, { modeloId: "Elfbar|TE 30K", qty: 3, nota: "uva" });
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ qty: 8, nota: "menta, uva" });
    lineas = agregarLinea(lineas, { modeloId: "Ignite|V250", qty: 2 });
    expect(lineas).toHaveLength(2);
  });
});

describe("cotizar — RN-06/07: escalón por total, todas las líneas al mismo escalón", () => {
  it("30 unidades mezcladas ⇒ escalón 20-49 para todas", () => {
    const c = cotizar({
      lineas: [
        { modeloId: "Lost Mary|MO 20K", qty: 20 },
        { modeloId: "Ignite|V250", qty: 10 },
      ],
      lista: LISTA, politica: POLITICA,
    });
    expect(c.ok).toBe(true);
    expect(c.escalon.desde).toBe(20);
    expect(c.lineas.map(l => l.precioUSD)).toEqual([10.5, 16]);
    expect(c.totalUSD).toBe(20 * 10.5 + 10 * 16);
  });
  it("60 unidades ⇒ salta el escalón 50-99 y TODAS las líneas repreciadas", () => {
    const c = cotizar({
      lineas: [{ modeloId: "Lost Mary|MO 20K", qty: 30 }, { modeloId: "Ignite|V250", qty: 30 }],
      lista: LISTA, politica: POLITICA,
    });
    expect(c.escalon.desde).toBe(50);
    expect(c.lineas.map(l => l.precioUSD)).toEqual([10, 15]);
  });
  it("(k) utilidad y margen del pedido, internos", () => {
    const c = cotizar({ lineas: [{ modeloId: "Elfbar|TE 30K", qty: 20 }], lista: LISTA, politica: POLITICA });
    // 20 × (13.5 − 9.605) = 77.9
    expect(c.utilidadUSD).toBeCloseTo(77.9, 10);
    expect(c.margenPct).toBeCloseTo(77.9 / 270, 10);
  });
});

describe("cotizar — RN-08 bloqueantes y RN-18", () => {
  it("el pedido de prueba del producto de entrada PASA (20× MO 20K = USD 210 ≥ 200)", () => {
    const c = cotizar({ lineas: [{ modeloId: "Lost Mary|MO 20K", qty: 20 }], lista: LISTA, politica: POLITICA });
    expect(c.ok).toBe(true);
    expect(c.motivosBloqueo).toEqual([]);
  });
  it("debajo del mínimo de unidades: bloquea pero precia provisional al primer escalón", () => {
    const c = cotizar({ lineas: [{ modeloId: "Ignite|V250", qty: 5 }], lista: LISTA, politica: POLITICA });
    expect(c.ok).toBe(false);
    expect(c.bajoMinimo).toBe(true);
    expect(c.motivosBloqueo.some(m => m.includes("mínimo de 20 unidades"))).toBe(true);
    expect(c.lineas[0].precioUSD).toBe(16); // provisional: primer escalón
  });
  it("modelo fuera de la lista vigente bloquea con motivo (RN-18)", () => {
    const c = cotizar({ lineas: [{ modeloId: "Nikbar|Fantasma", qty: 25 }], lista: LISTA, politica: POLITICA });
    expect(c.ok).toBe(false);
    expect(c.motivosBloqueo.some(m => m.includes("Fantasma"))).toBe(true);
  });
});

describe("cotizar — RN-09: nudge de frontera PARA EL VENDEDOR (f)", () => {
  it("a 46 unidades: faltan 4 para el 50-99, con el ahorro CONCRETO del pedido cargado", () => {
    const c = cotizar({
      lineas: [{ modeloId: "Lost Mary|MO 20K", qty: 23 }, { modeloId: "Ignite|V250", qty: 23 }],
      lista: LISTA, politica: POLITICA,
    });
    expect(c.nudge).toMatchObject({ faltan: 4, desde: 50 });
    // Ahorro: 23×(10.5−10) + 23×(16−15) = 11.5 + 23 = 34.5 USD
    expect(c.nudge.ahorroUSD).toBeCloseTo(34.5, 10);
  });
  it("lejos de la frontera no hay nudge", () => {
    const c = cotizar({ lineas: [{ modeloId: "Lost Mary|MO 20K", qty: 30 }], lista: LISTA, politica: POLITICA });
    expect(c.nudge).toBeNull();
  });
});

describe("resolverFx — fuentes configuradas, manual registrado con banda", () => {
  it("sistema por default; sin cotización del sistema no resuelve", () => {
    expect(resolverFx({ fuenteId: "sistema", sistemaValor: 1530, politica: POLITICA }))
      .toEqual({ ok: true, fx: { valor: 1530, fuente: "sistema" } });
    expect(resolverFx({ fuenteId: "sistema", sistemaValor: 0, politica: POLITICA }).ok).toBe(false);
  });
  it("fuente configurada usa el valor traído por la pantalla", () => {
    const r = resolverFx({ fuenteId: "mep", valorFuente: 1480, sistemaValor: 1530, politica: POLITICA });
    expect(r.fx).toEqual({ valor: 1480, fuente: "mep" });
  });
  it("manual: registrado con autor y DENTRO de la banda; fuera de banda NO pasa", () => {
    const ok = resolverFx({ fuenteId: "manual", valorManual: 1500, sistemaValor: 1530, politica: POLITICA, elegidoPor: "Diego" });
    expect(ok.fx).toEqual({ valor: 1500, fuente: "manual", elegidoPor: "Diego" });
    // 1300 vs 1530 = −15% > banda 10% — la puerta trasera de RN-16, cerrada.
    const mal = resolverFx({ fuenteId: "manual", valorManual: 1300, sistemaValor: 1530, politica: POLITICA });
    expect(mal.ok).toBe(false);
    expect(mal.motivo).toContain("banda de sanidad");
  });
});

describe("divergenciaFxConLista (d) — 'el cliente vio la lista a $X'", () => {
  const listaConFx = { ...LISTA, fxAlPublicar: 1400 };
  it("avisa cuando el FX del presupuesto se aleja del de la lista", () => {
    const d = divergenciaFxConLista(1530, listaConFx, 0.03);
    expect(d).toMatchObject({ divergente: true, fxLista: 1400 });
  });
  it("cerca no avisa; listas viejas sin fxAlPublicar tampoco", () => {
    expect(divergenciaFxConLista(1410, listaConFx, 0.03)).toBeNull();
    expect(divergenciaFxConLista(1530, LISTA, 0.03)).toBeNull();
  });
});

describe("emitirPresupuesto — congela FX, vigencia y versión (RN-10/11, regla e)", () => {
  const cotizacion = cotizar({
    lineas: [{ modeloId: "Elfbar|TE 30K", qty: 20, nota: "menta, uva" }],
    lista: LISTA, politica: POLITICA,
  });
  const quote = emitirPresupuesto({
    id: "q1", cotizacion, lista: LISTA, politica: POLITICA,
    fx: { valor: 1500, fuente: "sistema" },
    cliente: { id: "k1", businessName: "Kiosco El Tano" },
    fecha: "2026-08-08T10:00:00.000Z", autor: "Diego",
  });

  it("el FX queda congelado con buffer explícito; vence a las 48hs", () => {
    expect(quote.fx).toEqual({ valor: 1500, fuente: "sistema", buffer: 0.03, efectivo: 1545 });
    expect(quote.venceAt).toBe("2026-08-10T10:00:00.000Z");
    expect(quote.listVersion).toBe("v2026-08");
    expect(quote.totalARS).toBe(Math.round(270 * 1545));
    expect(quote.plazo).toEqual({ pct: 0.03, dias: 7, totalARS: Math.round(270 * 1545 * 1.03) });
  });

  it("el texto lleva vigencia declarada, versión, notas de sabor — y NADA interno", () => {
    const txt = presupuestoTexto(quote, { nudge: cotizacion.nudge });
    expect(txt).toContain("Lista v2026-08");
    expect(txt).toContain("• TE 30K ×20 (menta, uva)");
    expect(txt).toContain("Válido por 48 hs");
    expect(txt).toContain("Total contado:");
    expect(txt).toContain("A 7 días:");
    expect(txt.toLowerCase()).not.toContain("margen");
    expect(txt.toLowerCase()).not.toContain("costo");
    expect(txt.toLowerCase()).not.toContain("utilidad");
  });

  it("vencimiento derivado; ganado/perdido con motivo obligatorio del catálogo", () => {
    expect(presupuestoVencido(quote, new Date("2026-08-09T10:00:00Z"))).toBe(false);
    expect(presupuestoVencido(quote, new Date("2026-08-10T11:00:00Z"))).toBe(true);
    const ganado = marcarGanado(quote, { saleId: "s1", fecha: "2026-08-09T10:00:00Z" });
    expect(ganado.estado).toBe("ganado");
    expect(presupuestoVencido(ganado, new Date("2026-08-11T00:00:00Z"))).toBe(false); // cerrado no vence
    const perdido = marcarPerdido(quote, { motivo: "precio", fecha: "2026-08-09T10:00:00Z" });
    expect(perdido).toMatchObject({ estado: "perdido", motivoNoCierre: "precio" });
    expect(() => marcarPerdido(quote, { motivo: "me_cayo_mal", fecha: "2026-08-09" })).toThrow();
    expect(MOTIVOS_NO_CIERRE.map(m => m.id)).toEqual(["precio", "stock", "no_respondio"]);
  });
});
