import { describe, it, expect } from "vitest";
import { diffArraysById, applyDiff, mergeIntoServer } from "./arrayMerge.js";

describe("diffArraysById", () => {
  it("detecta adds, updates, removes", () => {
    const prev = [{ id: 1, n: "a" }, { id: 2, n: "b" }, { id: 3, n: "c" }];
    const next = [{ id: 1, n: "a" }, { id: 2, n: "B!" }, { id: 4, n: "d" }];
    const d = diffArraysById(prev, next);
    expect(d.adds).toEqual([{ id: 4, n: "d" }]);
    expect(d.updates).toEqual([{ id: 2, n: "B!" }]);
    expect(d.removeIds).toEqual([3]);
  });

  it("vacío si nada cambió", () => {
    const arr = [{ id: 1 }, { id: 2 }];
    expect(diffArraysById(arr, arr)).toEqual({ adds: [], updates: [], removeIds: [] });
  });

  it("ignora items sin id", () => {
    const d = diffArraysById([{ id: 1 }, { foo: 1 }], [{ id: 1 }, { bar: 2 }]);
    expect(d.adds).toEqual([]);
    expect(d.updates).toEqual([]);
    expect(d.removeIds).toEqual([]);
  });

  it("maneja prev/next no-array", () => {
    expect(diffArraysById(null, [{ id: 1 }])).toEqual({ adds: [{ id: 1 }], updates: [], removeIds: [] });
    expect(diffArraysById([{ id: 1 }], null)).toEqual({ adds: [], updates: [], removeIds: [1] });
    expect(diffArraysById(null, null)).toEqual({ adds: [], updates: [], removeIds: [] });
  });
});

describe("applyDiff (sin concurrencia)", () => {
  it("agrega, actualiza y elimina sobre el server", () => {
    const server = [{ id: 1, n: "a" }, { id: 2, n: "b" }, { id: 3, n: "c" }];
    const diff = { adds: [{ id: 4, n: "d" }], updates: [{ id: 2, n: "B!" }], removeIds: [3] };
    expect(applyDiff(server, diff)).toEqual([
      { id: 1, n: "a" },
      { id: 2, n: "B!" },
      { id: 4, n: "d" },
    ]);
  });

  it("preserva orden de los items existentes", () => {
    const server = [{ id: "c" }, { id: "a" }, { id: "b" }];
    const diff = { adds: [{ id: "d" }], updates: [], removeIds: [] };
    const r = applyDiff(server, diff);
    expect(r.map(x => x.id)).toEqual(["c", "a", "b", "d"]);
  });
});

describe("applyDiff CON concurrencia (la razón por la que existe este módulo)", () => {
  it("Gus agregó algo nuevo entre mi read y write — no se pierde", () => {
    // Diego empezó con [A], agregó B. Mientras tanto Gus agregó C al server.
    const myPrev = [{ id: "A" }];
    const myNext = [{ id: "A" }, { id: "B" }];
    const serverNow = [{ id: "A" }, { id: "C" }]; // Gus metió C en paralelo
    const merged = mergeIntoServer(myPrev, myNext, serverNow);
    const ids = merged.map(x => x.id).sort();
    expect(ids).toEqual(["A", "B", "C"]); // los 3 sobreviven
  });

  it("Diego modifica un item, Gus modifica OTRO item: ambos cambios sobreviven", () => {
    const myPrev = [{ id: "A", v: 1 }, { id: "B", v: 1 }];
    const myNext = [{ id: "A", v: 2 }, { id: "B", v: 1 }];     // Diego cambia A
    const serverNow = [{ id: "A", v: 1 }, { id: "B", v: 9 }];   // Gus cambió B
    const merged = mergeIntoServer(myPrev, myNext, serverNow);
    expect(merged.find(x => x.id === "A").v).toBe(2); // cambio de Diego
    expect(merged.find(x => x.id === "B").v).toBe(9); // cambio de Gus, preservado
  });

  it("Diego y Gus modifican EL MISMO item: last-write-wins (Diego gana porque escribe)", () => {
    // Trade-off documentado: ambos editan el mismo id A. Diego escribe segundo.
    const myPrev = [{ id: "A", v: 1 }];
    const myNext = [{ id: "A", v: 2 }];   // Diego sube a 2
    const serverNow = [{ id: "A", v: 9 }]; // Gus había puesto 9
    const merged = mergeIntoServer(myPrev, myNext, serverNow);
    expect(merged).toEqual([{ id: "A", v: 2 }]); // Diego gana (last-write-wins)
  });

  it("Diego eliminó un item, Gus lo modificó: el delete de Diego gana", () => {
    const myPrev = [{ id: "A", v: 1 }];
    const myNext = [];                       // Diego lo borra
    const serverNow = [{ id: "A", v: 9 }];   // Gus lo había modificado
    const merged = mergeIntoServer(myPrev, myNext, serverNow);
    expect(merged).toEqual([]); // borrado gana
  });

  it("Diego agregó X, Gus también agregó X (mismo id): no se duplica", () => {
    // Improbable salvo si comparten lógica de uid(), pero el sistema no debe romperse.
    const myPrev = [];
    const myNext = [{ id: "X", v: 1 }];
    const serverNow = [{ id: "X", v: 2 }]; // Gus ya lo agregó
    const merged = mergeIntoServer(myPrev, myNext, serverNow);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("X");
  });

  it("Diego modificó algo que Gus eliminó: el modificado se re-agrega", () => {
    // Recuperación: si Gus borra A pero Diego en paralelo lo está modificando,
    // mejor preservar el cambio de Diego que tirarlo silenciosamente.
    const myPrev = [{ id: "A", v: 1 }];
    const myNext = [{ id: "A", v: 2 }]; // Diego modifica
    const serverNow = [];                // Gus había borrado
    const merged = mergeIntoServer(myPrev, myNext, serverNow);
    expect(merged).toEqual([{ id: "A", v: 2 }]);
  });
});
