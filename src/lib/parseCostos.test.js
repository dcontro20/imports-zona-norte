// parseCostos.test.js — pegar la tabla del proveedor produce un BORRADOR
// revisable, nunca una escritura. Lo que fija esta suite es la matriz de
// formatos reales y, sobre todo, lo que el parser NO hace: adivinar.
import { describe, it, expect } from "vitest";
import { parsearTablaCostos, diffCostos, normalizarNombreModelo } from "./parseCostos.js";

// Catálogo tal como lo entrega el adaptador (marca|modelo).
const MODELOS = [
  { id: "Geek Bar|Pulse X", marca: "Geek Bar", modelo: "Pulse X" },
  { id: "Geek Bar|Z 35K", marca: "Geek Bar", modelo: "Z 35K" },
  { id: "Lost Mary|Dura", marca: "Lost Mary", modelo: "Dura" },
  { id: "Lost Mary|MO", marca: "Lost Mary", modelo: "MO" },
  { id: "Lost Mary|Mixer+", marca: "Lost Mary", modelo: "Mixer+" },
  { id: "Elfbar|TE", marca: "Elfbar", modelo: "TE" },
  { id: "Elfbar|Ice King", marca: "Elfbar", modelo: "Ice King" },
  { id: "Nikbar|30K", marca: "Nikbar", modelo: "30K" },
  { id: "HQD|30K Ice Glaze Plus", marca: "HQD", modelo: "30K Ice Glaze Plus" },
  { id: "Ignite|V250", marca: "Ignite", modelo: "V250" },
  { id: "Ignite|V400 Ice", marca: "Ignite", modelo: "V400 Ice" },
  { id: "Ignite|V400 Sweet", marca: "Ignite", modelo: "V400 Sweet" },
  { id: "Ignite|V500", marca: "Ignite", modelo: "V500" },
];

const idsOk = (r) => r.lineas.filter(l => l.estado === "ok").map(l => [l.id, l.costo]);

describe("parsearTablaCostos — formatos que manda el proveedor", () => {
  it("separador libre: tabs, comas, pipes, espacios múltiples", () => {
    const r = parsearTablaCostos(
      "Geek Bar Pulse X\t6.00\nPulse X,6\nIgnite V500 | USD 12\nLost Mary Dura   8,00",
      MODELOS
    );
    expect(idsOk(r)).toEqual([
      ["Geek Bar|Pulse X", 6], ["Geek Bar|Pulse X", 6],
      ["Ignite|V500", 12], ["Lost Mary|Dura", 8],
    ]);
  });

  it("empareja con y sin la marca adelante", () => {
    const r = parsearTablaCostos("Elfbar TE 9.50\nTE 9.50", MODELOS);
    expect(idsOk(r)).toEqual([["Elfbar|TE", 9.5], ["Elfbar|TE", 9.5]]);
  });

  it("el número del NOMBRE no se confunde con el costo", () => {
    // El 30 de "30K", el 250 de "V250" y el 35 de "Z 35K" van pegados a letras.
    const r = parsearTablaCostos(
      "Nikbar 30K 7.50\nV250 10\nGeek Bar Z 35K 7\nHQD 30K Ice Glaze Plus 9",
      MODELOS
    );
    expect(idsOk(r)).toEqual([
      ["Nikbar|30K", 7.5], ["Ignite|V250", 10],
      ["Geek Bar|Z 35K", 7], ["HQD|30K Ice Glaze Plus", 9],
    ]);
  });

  it("tolera mayúsculas, acentos, guiones y el + del nombre", () => {
    const r = parsearTablaCostos("LOST MARY  mixer +   8.50\nlost-mary MIXER+ 8.5", MODELOS);
    expect(idsOk(r)).toEqual([["Lost Mary|Mixer+", 8.5], ["Lost Mary|Mixer+", 8.5]]);
  });

  it("líneas vacías se ignoran; no cuentan como error", () => {
    const r = parsearTablaCostos("\n\nElfbar TE 9.5\n   \n", MODELOS);
    expect(r.resumen).toMatchObject({ total: 1, ok: 1, sinCosto: 0 });
  });
});

describe("parsearTablaCostos — lo que NO hace: adivinar", () => {
  it("un nombre que apunta a varios modelos queda AMBIGUO, sin elegir", () => {
    const modelos = [
      { id: "Ignite|V400 Ice", marca: "Ignite", modelo: "V400" },
      { id: "Ignite|V400 Sweet", marca: "Ignite", modelo: "V400" },
    ];
    const r = parsearTablaCostos("V400 10.00", modelos);
    expect(r.lineas[0].estado).toBe("ambiguo");
    expect(r.lineas[0].candidatos).toEqual(["Ignite|V400 Ice", "Ignite|V400 Sweet"]);
    expect(r.resumen.ok).toBe(0);
  });

  it("no empareja por prefijo: 'V400' no se lleva puesto a 'V400 Ice'", () => {
    const r = parsearTablaCostos("V400 10.00", MODELOS);
    expect(r.lineas[0].estado).toBe("sin_match");
  });

  it("modelo que no existe en el sistema: sin_match, con el nombre para poder crearlo", () => {
    const r = parsearTablaCostos("Ignite V-Mix 11.50", MODELOS);
    expect(r.lineas[0]).toMatchObject({ estado: "sin_match", nombre: "Ignite V-Mix", costo: 11.5 });
  });

  it("línea sin número (encabezado de la tabla pegada) se reporta, no se aplica", () => {
    const r = parsearTablaCostos("Modelo | Costo\nElfbar TE 9.5", MODELOS);
    expect(r.lineas[0].estado).toBe("sin_costo");
    expect(r.resumen).toMatchObject({ ok: 1, sinCosto: 1 });
  });

  it("costo 0 o negativo no es costo válido (RN-18: sin costo no hay lista)", () => {
    const r = parsearTablaCostos("Elfbar TE 0", MODELOS);
    expect(r.lineas[0].estado).toBe("sin_costo");
  });
});

describe("diffCostos — qué cambiaría de verdad", () => {
  const actuales = new Map([["Elfbar|TE", 8.5], ["Ignite|V250", 10]]);

  it("separa lo que cambia de lo que ya estaba igual", () => {
    const { lineas } = parsearTablaCostos("Elfbar TE 9.50\nIgnite V250 10", MODELOS);
    const { cambios, iguales } = diffCostos(lineas, actuales);
    expect(cambios).toEqual([{ id: "Elfbar|TE", etiqueta: "Elfbar TE", antes: 8.5, ahora: 9.5 }]);
    expect(iguales).toEqual(["Ignite|V250"]);
  });

  it("las líneas que no son 'ok' nunca entran al diff", () => {
    const { lineas } = parsearTablaCostos("Ignite V-Mix 11.50\nModelo | Costo", MODELOS);
    expect(diffCostos(lineas, actuales).cambios).toEqual([]);
  });

  it("un modelo sin costo previo aparece como cambio desde 0", () => {
    const { lineas } = parsearTablaCostos("Ignite V500 12", MODELOS);
    expect(diffCostos(lineas, actuales).cambios).toEqual([
      { id: "Ignite|V500", etiqueta: "Ignite V500", antes: 0, ahora: 12 },
    ]);
  });
});

describe("normalizarNombreModelo", () => {
  it("colapsa espacios, puntuación y acentos; conserva el +", () => {
    expect(normalizarNombreModelo("  Geek-Bar   PULSE_X ")).toBe("geek bar pulse x");
    expect(normalizarNombreModelo("Mixer +")).toBe("mixer+");
    expect(normalizarNombreModelo("Ándale")).toBe("andale");
  });
});
