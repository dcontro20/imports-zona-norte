// pricingEngine.test.js — batería unitaria por regla de negocio (RN-XX) +
// criterio de aceptación de portabilidad del addendum: este archivo alimenta
// al motor ÚNICAMENTE con objetos de producto y de política escritos a mano.
// No importa nada del sistema anfitrión (ni constants, ni firebase, ni React).
import { describe, it, expect } from "vitest";
import {
  costoReal,
  redondear,
  tieneCosto,
  preciosProducto,
  validarProducto,
  calcularProducto,
  generarLista,
  escalonParaTotal,
  nudgeProximoEscalon,
} from "./pricingEngine.js";

// Política de este negocio (v2026-08) escrita a mano — el motor no la conoce.
const POLITICA = {
  costoAdicionalPct: 0.13,
  metricaEscalon: "unidades",
  escalones: [
    { desde: 20, hasta: 49, margen: 0.28 },
    { desde: 50, hasta: 99, margen: 0.24 },
    { desde: 100, hasta: 199, margen: 0.21 },
    { desde: 200, hasta: null, margen: 0.18 },
  ],
  redondeo: { multiplo: 0.5, direccion: "arriba" },
  margenMinimo: 0.15,
  validaciones: {
    conflictoCanal: { activa: true, umbral: 0.85 },
    margenCliente: { activa: true, umbral: 0.3 },
  },
};

describe("RN-01 — costo real", () => {
  it("aplica el costo adicional proporcional", () => {
    expect(costoReal(8.5, 0.13)).toBe(9.605);
    expect(costoReal(6.5, 0.13)).toBe(7.345);
  });
  it("sin costo adicional, el costo real es el costo", () => {
    expect(costoReal(10)).toBe(10);
    expect(costoReal(10, 0)).toBe(10);
  });
});

describe("RN-03 — redondeo al múltiplo configurado", () => {
  it("hacia arriba al múltiplo", () => {
    expect(redondear(10.2014, { multiplo: 0.5, direccion: "arriba" })).toBe(10.5);
    expect(redondear(16.001, { multiplo: 0.5, direccion: "arriba" })).toBe(16.5);
  });
  it("un múltiplo exacto NO salta al siguiente (epsilon)", () => {
    // 11.5/0.5 = 23.000000000000004 en punto flotante — sin epsilon daría 12.
    expect(redondear(11.5, { multiplo: 0.5, direccion: "arriba" })).toBe(11.5);
    expect(redondear(1300, { multiplo: 100, direccion: "arriba" })).toBe(1300);
  });
  it("dirección abajo y múltiplos de otra escala (pesos)", () => {
    expect(redondear(1234, { multiplo: 100, direccion: "arriba" })).toBe(1300);
    expect(redondear(1234, { multiplo: 100, direccion: "abajo" })).toBe(1200);
    expect(redondear(11, { multiplo: 0.5, direccion: "abajo" })).toBe(11);
  });
  it("sin múltiplo válido devuelve el valor limpio", () => {
    expect(redondear(10.25, { multiplo: 0 })).toBe(10.25);
    expect(redondear(10.25, null)).toBe(10.25);
  });
});

describe("RN-02 + RN-04 — precios por escalón y anti-colapso", () => {
  it("deriva cada escalón de su propio margen (caso real V150 Pro)", () => {
    // costo 8 × 1.13 = 9.04 → 12.56/11.90/11.44/11.02 → redondeo 13/12/11.5/11.5
    // → colapso en el último → baja a 11. Único caso de la lista v2026-08.
    const precios = preciosProducto(costoReal(8, 0.13), POLITICA);
    expect(precios.map((p) => p.precio)).toEqual([13, 12, 11.5, 11]);
    expect(precios.map((p) => p.ajustadoAnticolapso)).toEqual([false, false, false, true]);
  });
  it("el ajuste se encadena si colapsan varios escalones seguidos", () => {
    const politica = {
      costoAdicionalPct: 0,
      escalones: [
        { desde: 10, hasta: 19, margen: 0.2 },
        { desde: 20, hasta: 29, margen: 0.2 },
        { desde: 30, hasta: null, margen: 0.2 },
      ],
      redondeo: { multiplo: 0.5, direccion: "arriba" },
      margenMinimo: 0,
    };
    const precios = preciosProducto(10, politica);
    expect(precios.map((p) => p.precio)).toEqual([12.5, 12, 11.5]);
    expect(precios.map((p) => p.ajustadoAnticolapso)).toEqual([false, true, true]);
  });
  it("margenReal se calcula sobre el precio FINAL, post ajuste", () => {
    const precios = preciosProducto(costoReal(8, 0.13), POLITICA);
    const ultimo = precios[precios.length - 1];
    expect(ultimo.margenReal).toBeCloseTo((11 - 9.04) / 11, 10);
  });
  it("cada escalón queda al menos un múltiplo debajo del anterior, siempre", () => {
    for (const costo of [5, 6.5, 8, 9.75, 11.5, 20, 33.33]) {
      const precios = preciosProducto(costoReal(costo, 0.13), POLITICA);
      for (let i = 1; i < precios.length; i++) {
        expect(precios[i - 1].precio - precios[i].precio).toBeGreaterThanOrEqual(0.5 - 1e-9);
      }
    }
  });
});

describe("RN-05 — piso de margen bloqueante", () => {
  it("bloquea si algún escalón queda debajo del piso", () => {
    // costo real 10, margen objetivo 10% → precio 11.5 → margen real 13% < 15%
    const politica = {
      costoAdicionalPct: 0,
      escalones: [{ desde: 1, hasta: null, margen: 0.1 }],
      redondeo: { multiplo: 0.5, direccion: "arriba" },
      margenMinimo: 0.15,
    };
    const calc = calcularProducto({ id: "x", costo: 10 }, politica);
    expect(calc.publicable).toBe(false);
    expect(calc.bloqueantes).toEqual([
      expect.objectContaining({ regla: "margenMinimo", desde: 1, minimo: 0.15 }),
    ]);
  });
  it("con la política v2026-08 ningún costo del catálogo real bloquea", () => {
    for (const costo of [6.5, 7.5, 8, 8.5, 8.8, 9, 9.5, 9.75, 10, 10.5, 11, 11.5]) {
      const calc = calcularProducto({ id: "p", costo }, POLITICA);
      expect(calc.bloqueantes).toEqual([]);
      expect(calc.publicable).toBe(true);
    }
  });
});

describe("margenAlerta — aviso temprano de erosión (alerta, no bloqueo)", () => {
  const politica = {
    costoAdicionalPct: 0,
    escalones: [
      { desde: 10, hasta: 99, margen: 0.3 },
      { desde: 100, hasta: null, margen: 0.18 },
    ],
    redondeo: { multiplo: 0.5, direccion: "arriba" },
    margenMinimo: 0.15,
    margenAlerta: 0.2,
  };
  it("margen entre piso y alerta ⇒ alerta con el escalón señalado, sin bloquear", () => {
    // costo 10.5 → escalón 2: 10.5/0.82 = 12.80 → 13 → margen real 19,2%:
    // arriba del piso (15%), debajo de la alerta (20%).
    const calc = calcularProducto({ id: "x", costo: 10.5 }, politica);
    const alerta = calc.alertas.find((a) => a.regla === "margenAlerta");
    expect(alerta).toMatchObject({ desde: 100, umbral: 0.2 });
    expect(alerta.margenReal).toBeCloseTo((13 - 10.5) / 13, 10);
    expect(calc.publicable).toBe(true); // alerta ≠ bloqueo
    expect(calc.bloqueantes).toEqual([]);
  });
  it("debajo del piso es bloqueante, NO alerta duplicada", () => {
    const dura = { ...politica, escalones: [{ desde: 10, hasta: null, margen: 0.1 }] };
    const calc = calcularProducto({ id: "x", costo: 10 }, dura);
    expect(calc.bloqueantes).toHaveLength(1);
    expect(calc.alertas.filter((a) => a.regla === "margenAlerta")).toEqual([]);
  });
  it("apagada (0 o ausente) no emite nada", () => {
    const sin = { ...politica, margenAlerta: 0 };
    expect(calcularProducto({ id: "x", costo: 10.5 }, sin).alertas).toEqual([]);
    const { margenAlerta, ...ausente } = politica;
    expect(calcularProducto({ id: "x", costo: 10.5 }, ausente).alertas).toEqual([]);
  });
});

describe("RN-18 — producto sin costo no se calcula ni publica", () => {
  it("sin costo, costo 0 o negativo ⇒ sinCosto", () => {
    expect(tieneCosto({ costo: 5 })).toBe(true);
    for (const producto of [{}, { costo: 0 }, { costo: -1 }, { costo: null }]) {
      expect(tieneCosto(producto)).toBe(false);
      const calc = calcularProducto({ id: "z", ...producto }, POLITICA);
      expect(calc).toEqual({ id: "z", sinCosto: true, publicable: false });
    }
  });
  it("generarLista los excluye de las filas y los reporta aparte", () => {
    const lista = generarLista(
      [{ id: "a", costo: 8 }, { id: "b" }, { id: "c", costo: 6.5 }],
      POLITICA
    );
    expect(lista.filas.map((f) => f.id)).toEqual(["a", "c"]);
    expect(lista.sinCosto).toEqual(["b"]);
    expect(lista.publicable).toBe(true);
  });
  it("un producto bloqueado deja la lista NO publicable y queda reportado", () => {
    const politica = { ...POLITICA, margenMinimo: 0.35 };
    const lista = generarLista([{ id: "a", costo: 8 }], politica);
    expect(lista.bloqueados).toEqual(["a"]);
    expect(lista.publicable).toBe(false);
    expect(lista.filas).toHaveLength(1); // la fila queda visible con sus bloqueantes
  });
});

describe("RN-14 — validación de conflicto de canal (opcional)", () => {
  it("alerta si el primer escalón supera el umbral del precio de referencia", () => {
    // p1 = 16 > 0.85 × 18 = 15.3 → alerta
    const calc = calcularProducto({ id: "v", costo: 10, precioReferencia: 18 }, POLITICA);
    expect(calc.alertas).toEqual([
      expect.objectContaining({ regla: "conflictoCanal", precio: 16, techo: 15.3 }),
    ]);
    expect(calc.publicable).toBe(true); // es alerta, no bloqueante
  });
  it("caso real V250: 16 vs techo 16.15 — al 84%, sin alerta (SKU bajo vigilancia)", () => {
    const calc = calcularProducto({ id: "v250", costo: 10, precioReferencia: 19 }, POLITICA);
    expect(calc.alertas).toEqual([]);
  });
  it("sin dato no corre y no rompe; desactivada no corre aunque haya dato", () => {
    expect(calcularProducto({ id: "v", costo: 10 }, POLITICA).alertas).toEqual([]);
    const apagada = {
      ...POLITICA,
      validaciones: { ...POLITICA.validaciones, conflictoCanal: { activa: false, umbral: 0.85 } },
    };
    expect(calcularProducto({ id: "v", costo: 10, precioReferencia: 18 }, apagada).alertas).toEqual([]);
  });
});

describe("RN-15 — validación de margen del cliente (opcional)", () => {
  it("caso real V250: precio de calle 38000 ARS al FX 1530 → margen 35,6%, sin alerta", () => {
    // La conversión de moneda es del ADAPTADOR: el motor recibe todo en la misma moneda.
    const calc = calcularProducto({ id: "v250", costo: 10, precioMercado: 38000 / 1530 }, POLITICA);
    expect(calc.alertas).toEqual([]);
  });
  it("alerta si el margen del cliente cae debajo del umbral", () => {
    // p1 = 16, mercado 20 → margen del cliente 20% < 30%
    const calc = calcularProducto({ id: "v", costo: 10, precioMercado: 20 }, POLITICA);
    expect(calc.alertas).toEqual([
      expect.objectContaining({ regla: "margenCliente", minimo: 0.3 }),
    ]);
    expect(calc.alertas[0].margenCliente).toBeCloseTo(0.2, 10);
  });
  it("sin dato no corre y no rompe; desactivada no corre aunque haya dato", () => {
    expect(calcularProducto({ id: "v", costo: 10 }, POLITICA).alertas).toEqual([]);
    const apagada = {
      ...POLITICA,
      validaciones: { ...POLITICA.validaciones, margenCliente: { activa: false, umbral: 0.3 } },
    };
    expect(calcularProducto({ id: "v", costo: 10, precioMercado: 20 }, apagada).alertas).toEqual([]);
  });
  it("las dos alertas pueden convivir en el mismo producto", () => {
    const calc = calcularProducto(
      { id: "v", costo: 10, precioReferencia: 18, precioMercado: 20 },
      POLITICA
    );
    expect(calc.alertas.map((a) => a.regla).sort()).toEqual(["conflictoCanal", "margenCliente"]);
  });
});

describe("RN-06 — escalón por total del pedido", () => {
  it("resuelve los bordes exactos de cada escalón", () => {
    expect(escalonParaTotal(19, POLITICA)).toBeNull(); // debajo del mínimo de volumen
    expect(escalonParaTotal(20, POLITICA)?.margen).toBe(0.28);
    expect(escalonParaTotal(49, POLITICA)?.margen).toBe(0.28);
    expect(escalonParaTotal(50, POLITICA)?.margen).toBe(0.24);
    expect(escalonParaTotal(99, POLITICA)?.margen).toBe(0.24);
    expect(escalonParaTotal(100, POLITICA)?.margen).toBe(0.21);
    expect(escalonParaTotal(199, POLITICA)?.margen).toBe(0.21);
    expect(escalonParaTotal(200, POLITICA)?.margen).toBe(0.18);
    expect(escalonParaTotal(5000, POLITICA)?.margen).toBe(0.18); // hasta: null = sin techo
  });
});

describe("RN-09 — nudge de frontera al siguiente escalón", () => {
  it("avisa cuando falta menos del umbral (proporción del límite)", () => {
    expect(nudgeProximoEscalon(46, POLITICA)).toEqual(
      expect.objectContaining({ desde: 50, faltan: 4 }) // 4/50 = 8% < 10%
    );
    expect(nudgeProximoEscalon(190, POLITICA)).toEqual(
      expect.objectContaining({ desde: 200, faltan: 10 }) // 10/200 = 5%
    );
  });
  it("no avisa si el siguiente escalón está lejos o no existe", () => {
    expect(nudgeProximoEscalon(44, POLITICA)).toBeNull(); // 6/50 = 12%
    expect(nudgeProximoEscalon(45, POLITICA)).toBeNull(); // 10% exacto: "menos del 10%" es estricto
    expect(nudgeProximoEscalon(250, POLITICA)).toBeNull(); // ya está en el último
  });
  it("también empuja hacia el PRIMER escalón (pedido debajo del mínimo)", () => {
    expect(nudgeProximoEscalon(19, POLITICA)).toEqual(
      expect.objectContaining({ desde: 20, faltan: 1 }) // 1/20 = 5%
    );
  });
});

describe("Portabilidad — el motor no asume cantidad de escalones ni rubro", () => {
  it("funciona con DOS escalones y redondeo en pesos (multiplo 100)", () => {
    const politica = {
      costoAdicionalPct: 0.05,
      metricaEscalon: "unidades",
      escalones: [
        { desde: 10, hasta: 99, margen: 0.3 },
        { desde: 100, hasta: null, margen: 0.22 },
      ],
      redondeo: { multiplo: 100, direccion: "arriba" },
      margenMinimo: 0.1,
    };
    const calc = calcularProducto({ id: "harina", costo: 1000 }, politica);
    // costo real 1050 → 1500 (28.57% real) / 1346.15 → 1400 (25% real)
    expect(calc.precios.map((p) => p.precio)).toEqual([1500, 1400]);
    expect(calc.publicable).toBe(true);
    expect(escalonParaTotal(100, politica)?.margen).toBe(0.22);
  });
  it("funciona con SEIS escalones sin tocar nada", () => {
    const politica = {
      costoAdicionalPct: 0,
      metricaEscalon: "unidades",
      escalones: [0.4, 0.36, 0.32, 0.28, 0.24, 0.2].map((margen, i) => ({
        desde: (i + 1) * 10,
        hasta: i === 5 ? null : (i + 2) * 10 - 1,
        margen,
      })),
      redondeo: { multiplo: 0.5, direccion: "arriba" },
      margenMinimo: 0.05,
    };
    const calc = calcularProducto({ id: "p", costo: 9 }, politica);
    expect(calc.precios).toHaveLength(6);
    for (let i = 1; i < 6; i++) {
      expect(calc.precios[i - 1].precio - calc.precios[i].precio).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
  });
  it("ordena escalones defensivamente si la política los trae desordenados", () => {
    const politica = {
      costoAdicionalPct: 0,
      escalones: [
        { desde: 100, hasta: null, margen: 0.2 },
        { desde: 10, hasta: 99, margen: 0.3 },
      ],
      redondeo: { multiplo: 0.5, direccion: "arriba" },
      margenMinimo: 0,
    };
    const precios = preciosProducto(10, politica);
    expect(precios[0].desde).toBe(10);
    expect(precios[0].precio).toBeGreaterThan(precios[1].precio);
  });
  it("validarProducto es una capa separada: se puede llamar sin recalcular", () => {
    const precios = preciosProducto(costoReal(10, 0.13), POLITICA);
    const { bloqueantes, alertas } = validarProducto({ id: "v", costo: 10 }, precios, POLITICA);
    expect(bloqueantes).toEqual([]);
    expect(alertas).toEqual([]);
  });
});
