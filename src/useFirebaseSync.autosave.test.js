// useFirebaseSync.autosave.test.js — invariante de paridad lectura/escritura.
//
// Origen: B1 (docs/BACKLOG_TECNICO_2026-07-28_prospeccion_y_sync.md). El commit
// f111e5d registró prospects/visits/routes en DATA_KEYS (lectura de Firestore)
// pero omitió sus autosaves (escritura): toda mutación local se perdía al
// refrescar. La clase del bug es "colección registrada a medias", así que el
// test verifica el invariante sobre el FUENTE, no sobre una lista copiada acá:
// cada key declarada en DATA_KEYS tiene que tener su useEffect de smartSave.
// (backupStatus queda afuera a propósito: no está en DATA_KEYS porque es
// solo-lectura — lo escribe scripts/backup.mjs, jamás la app.)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// process.cwd() = raíz del repo (vitest corre desde ahí; import.meta.url no es
// file: bajo el transform de vitest, así que no sirve para resolver el fuente).
const src = readFileSync(join(process.cwd(), "src", "useFirebaseSync.js"), "utf8");

const bloqueKeys = src.match(/const DATA_KEYS = \[([\s\S]*?)\n\];/)?.[1] ?? "";
const declaradas = [...bloqueKeys.matchAll(/key: "(\w+)"/g)].map(m => m[1]);
const conAutosave = new Set([...src.matchAll(/smartSave\("(\w+)"/g)].map(m => m[1]));

describe("useFirebaseSync — paridad DATA_KEYS ↔ autosave (B1)", () => {
  it("el parser del fuente sigue encontrando las estructuras", () => {
    // Si alguien renombra DATA_KEYS o smartSave, esto falla ANTES de que el
    // test de paridad pase en falso por no encontrar nada.
    expect(declaradas.length).toBeGreaterThanOrEqual(20);
    expect(declaradas).toContain("products");
    expect(declaradas).toContain("prospects");
    expect(conAutosave.size).toBeGreaterThanOrEqual(20);
  });

  it("toda key de DATA_KEYS tiene su useEffect de smartSave", () => {
    const sinAutosave = declaradas.filter(k => !conAutosave.has(k));
    expect(sinAutosave).toEqual([]);
  });

  it("las tres colecciones del pivote mayorista persisten (fix B1)", () => {
    expect(conAutosave.has("prospects")).toBe(true);
    expect(conAutosave.has("visits")).toBe(true);
    expect(conAutosave.has("routes")).toBe(true);
  });
});
