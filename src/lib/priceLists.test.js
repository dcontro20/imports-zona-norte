// priceLists.test.js — listas versionadas e inmutables (RN-12) + estabilidad
// de recálculo (§5.17 / RN-13) + puerta de publicación (RN-05).
import { describe, it, expect } from "vitest";
import {
  siguienteVersion,
  listaVigente,
  construirSnapshot,
  puedePublicar,
  driftContraVigente,
  politicaMotorCambio,
  precioEnLista,
  compararSnapshots,
  alertasDeHoy,
} from "./priceLists.js";
import { DEFAULT_PRICING_POLICY } from "./pricingPolicy.js";

const POLITICA = DEFAULT_PRICING_POLICY;
const productos = (costos) =>
  Object.entries(costos).map(([id, costo]) => {
    const [marca, modelo] = id.split("|");
    return { id, marca, modelo, costo, productIds: [`${id}#1`], sabores: 1 };
  });

const snapshotBase = (over = {}) =>
  construirSnapshot({
    productosMotor: productos({ "Elfbar|TE 30K": 8.5, "Ignite|V250": 10 }),
    politica: POLITICA,
    version: "v2026-08",
    fecha: "2026-08-07T12:00:00.000Z",
    autor: "Gustavo",
    ...over,
  });

describe("siguienteVersion — v<año-mes> con sufijo por republicación", () => {
  it("primera del mes sin sufijo, siguientes numeradas", () => {
    expect(siguienteVersion([], "2026-08-07T12:00:00Z")).toBe("v2026-08");
    const listas = [{ version: "v2026-08" }];
    expect(siguienteVersion(listas, "2026-08-20T12:00:00Z")).toBe("v2026-08.2");
    expect(siguienteVersion([...listas, { version: "v2026-08.2" }], "2026-08-25T12:00:00Z")).toBe("v2026-08.3");
  });
  it("mes nuevo arranca de cero", () => {
    expect(siguienteVersion([{ version: "v2026-08" }], "2026-09-01T12:00:00Z")).toBe("v2026-09");
  });
});

describe("construirSnapshot — el snapshot congela todo (RN-12)", () => {
  it("congela política, costos, precios y trazabilidad", () => {
    const snap = snapshotBase();
    expect(snap).toMatchObject({
      id: "pl_v2026-08", version: "v2026-08",
      publishedAt: "2026-08-07T12:00:00.000Z", publishedBy: "Gustavo",
      publicable: true, sinCosto: [], bloqueados: [],
    });
    expect(snap.filas).toHaveLength(2);
    const te = snap.filas.find((f) => f.id === "Elfbar|TE 30K");
    expect(te.precios.map((p) => p.precio)).toEqual([13.5, 13, 12.5, 12]);
    expect(te.productIds).toEqual(["Elfbar|TE 30K#1"]);
    // La política congelada es una COPIA: mutar la viva no toca el snapshot.
    expect(snap.politica).toEqual(POLITICA);
    expect(snap.politica).not.toBe(POLITICA);
    expect(snap.politica.escalones).not.toBe(POLITICA.escalones);
  });

  it("producto sin costo queda excluido y reportado (RN-18)", () => {
    const snap = construirSnapshot({
      productosMotor: productos({ "Elfbar|TE 30K": 8.5, "Nikbar|Nuevo": 0 }),
      politica: POLITICA, version: "v2026-08", fecha: "2026-08-07T12:00:00Z",
    });
    expect(snap.filas.map((f) => f.id)).toEqual(["Elfbar|TE 30K"]);
    expect(snap.sinCosto).toEqual(["Nikbar|Nuevo"]);
    expect(snap.publicable).toBe(true);
  });
});

describe("estabilidad §5.17 — el margen absorbe movimientos chicos de costo", () => {
  const base = snapshotBase();

  it("costo movido MENOS que el umbral: conserva los precios de la base", () => {
    // 8.5 → 8.67 = +2% (< 3%): los precios no se mueven, el margen absorbe.
    const snap = construirSnapshot({
      productosMotor: productos({ "Elfbar|TE 30K": 8.67, "Ignite|V250": 10 }),
      politica: POLITICA, version: "v2026-08.2", fecha: "2026-08-20T12:00:00Z", base,
    });
    const te = snap.filas.find((f) => f.id === "Elfbar|TE 30K");
    expect(te.precios.map((p) => p.precio)).toEqual([13.5, 13, 12.5, 12]);
    expect(te.estabilizada).toBe(true);
    // El margen real refleja el costo NUEVO, no el viejo.
    expect(te.costoReal).toBeCloseTo(8.67 * 1.13, 10);
    expect(te.precios[0].margenReal).toBeCloseTo((13.5 - 8.67 * 1.13) / 13.5, 10);
  });

  it("costo movido MÁS que el umbral: recalcula ese producto (y solo ese)", () => {
    // 8.5 → 9.5 = +11,8%: recalcula. V250 quieto: conserva.
    const snap = construirSnapshot({
      productosMotor: productos({ "Elfbar|TE 30K": 9.5, "Ignite|V250": 10 }),
      politica: POLITICA, version: "v2026-08.2", fecha: "2026-08-20T12:00:00Z", base,
    });
    const te = snap.filas.find((f) => f.id === "Elfbar|TE 30K");
    const v250 = snap.filas.find((f) => f.id === "Ignite|V250");
    expect(te.precios.map((p) => p.precio)).toEqual([15, 14.5, 14, 13.5]); // costo real 10.735
    expect(te.estabilizada).toBe(false);
    expect(v250.estabilizada).toBe(true);
  });

  it("si cambió la parte MOTOR de la política, la estabilidad no aplica", () => {
    const politicaNueva = { ...POLITICA, margenMinimo: 0.16 };
    const snap = construirSnapshot({
      productosMotor: productos({ "Elfbar|TE 30K": 8.67, "Ignite|V250": 10 }),
      politica: politicaNueva, version: "v2026-08.2", fecha: "2026-08-20T12:00:00Z", base,
    });
    expect(snap.filas.every((f) => f.estabilizada === false)).toBe(true);
  });

  it("el umbral se mide contra el costo de REFERENCIA de la vigente, no contra la republicación anterior", () => {
    // Anti erosión silenciosa: 8.5 → 8.67 (+2%, estabiliza) → 8.84.
    // Contra la republicación anterior sería +1,96% (nunca recalcularía);
    // contra la referencia real (8.5) es +4% > 3% ⇒ RECALCULA.
    const v2 = construirSnapshot({
      productosMotor: productos({ "Elfbar|TE 30K": 8.67, "Ignite|V250": 10 }),
      politica: POLITICA, version: "v2026-08.2", fecha: "2026-08-14T12:00:00Z", base,
    });
    const teV2 = v2.filas.find((f) => f.id === "Elfbar|TE 30K");
    expect(teV2.estabilizada).toBe(true);
    // La referencia viaja intacta: sigue siendo el costo real que originó los precios.
    expect(teV2.costoRealReferencia).toBeCloseTo(8.5 * 1.13, 10);

    const v3 = construirSnapshot({
      productosMotor: productos({ "Elfbar|TE 30K": 8.84, "Ignite|V250": 10 }),
      politica: POLITICA, version: "v2026-08.3", fecha: "2026-08-21T12:00:00Z", base: v2,
    });
    const teV3 = v3.filas.find((f) => f.id === "Elfbar|TE 30K");
    expect(teV3.estabilizada).toBe(false); // acumulado 4% > 3%: repreciado
    expect(teV3.costoRealReferencia).toBeCloseTo(8.84 * 1.13, 10); // referencia nueva
    expect(teV3.precios.map((p) => p.precio)).toEqual([14, 13.5, 13, 12.5]); // 9.9892/0.72→13.87→14
  });

  it("driftContraVigente también mide contra la referencia (pide republicar por acumulación)", () => {
    const v2 = construirSnapshot({
      productosMotor: productos({ "Elfbar|TE 30K": 8.67, "Ignite|V250": 10 }),
      politica: POLITICA, version: "v2026-08.2", fecha: "2026-08-14T12:00:00Z", base,
    });
    // 8.84 vs la republicación (8.67) sería +1,96% — pero vs la referencia (8.5) es +4%.
    const drift = driftContraVigente({
      vigente: v2, productosMotor: productos({ "Elfbar|TE 30K": 8.84, "Ignite|V250": 10 }), politica: POLITICA,
    });
    expect(drift.necesitaRepublicar).toBe(true);
    expect(drift.costosMovidos[0]).toMatchObject({ id: "Elfbar|TE 30K" });
    expect(drift.costosMovidos[0].antes).toBeCloseTo(8.5 * 1.13, 10);
  });

  it("el piso manda: si conservar el precio viola el piso, recalcula (RN-05 > §5.17)", () => {
    // Política con margen del último escalón pegado al piso: 15.2% objetivo,
    // piso 15%. Un +2% de costo (bajo el umbral 3%) rompería el piso si se
    // conservara el precio → el producto se recalcula en vez de estabilizarse.
    const politica = {
      ...POLITICA,
      escalones: [
        { desde: 20, hasta: 99, margen: 0.2 },
        { desde: 100, hasta: null, margen: 0.152 },
      ],
    };
    const base2 = construirSnapshot({
      productosMotor: productos({ "Elfbar|TE 30K": 10 }),
      politica, version: "v2026-08", fecha: "2026-08-07T12:00:00Z",
    });
    const margenBase = base2.filas[0].precios[1].margenReal;
    expect(margenBase).toBeGreaterThanOrEqual(0.15); // publicable de base
    const snap = construirSnapshot({
      productosMotor: productos({ "Elfbar|TE 30K": 10.2 }),
      politica, version: "v2026-08.2", fecha: "2026-08-20T12:00:00Z", base: base2,
    });
    const fila = snap.filas[0];
    // No importa el camino (estabilizada o no): NINGÚN precio publicado viola el piso.
    for (const esc of fila.precios) {
      expect(esc.margenReal).toBeGreaterThanOrEqual(0.15 - 1e-9);
    }
    expect(fila.estabilizada).toBe(false);
  });
});

describe("puedePublicar — RN-05 como puerta", () => {
  it("lista sana publica; lista con piso violado NO", () => {
    expect(puedePublicar(snapshotBase()).ok).toBe(true);
    const politicaDura = { ...POLITICA, margenMinimo: 0.35 };
    const snap = construirSnapshot({
      productosMotor: productos({ "Elfbar|TE 30K": 8.5 }),
      politica: politicaDura, version: "v2026-08", fecha: "2026-08-07T12:00:00Z",
    });
    const res = puedePublicar(snap);
    expect(res.ok).toBe(false);
    expect(res.motivos[0]).toContain("Elfbar TE 30K");
  });
  it("lista vacía no publica", () => {
    const snap = construirSnapshot({
      productosMotor: [], politica: POLITICA, version: "v2026-08", fecha: "2026-08-07T12:00:00Z",
    });
    expect(puedePublicar(snap).ok).toBe(false);
  });
});

describe("listaVigente + driftContraVigente (RN-13)", () => {
  const vigente = snapshotBase();

  it("vigente = la última publicada", () => {
    const otra = { ...snapshotBase({ version: "v2026-08.2" }), publishedAt: "2026-08-20T12:00:00.000Z" };
    expect(listaVigente([vigente, otra]).version).toBe("v2026-08.2");
    expect(listaVigente([])).toBeNull();
    expect(listaVigente(null)).toBeNull();
  });

  it("sin movimientos no pide republicar", () => {
    const drift = driftContraVigente({
      vigente, productosMotor: productos({ "Elfbar|TE 30K": 8.5, "Ignite|V250": 10 }), politica: POLITICA,
    });
    expect(drift.necesitaRepublicar).toBe(false);
  });

  it("costo movido más del umbral pide republicar y dice cuál", () => {
    const drift = driftContraVigente({
      vigente, productosMotor: productos({ "Elfbar|TE 30K": 9.5, "Ignite|V250": 10 }), politica: POLITICA,
    });
    expect(drift.necesitaRepublicar).toBe(true);
    expect(drift.costosMovidos).toHaveLength(1);
    expect(drift.costosMovidos[0].id).toBe("Elfbar|TE 30K");
    expect(drift.costosMovidos[0].pct).toBeGreaterThan(0.03);
  });

  it("movimiento menor al umbral NO pide republicar (el margen lo absorbe)", () => {
    const drift = driftContraVigente({
      vigente, productosMotor: productos({ "Elfbar|TE 30K": 8.67, "Ignite|V250": 10 }), politica: POLITICA,
    });
    expect(drift.necesitaRepublicar).toBe(false);
  });

  it("producto nuevo con costo / retirado / cambio de política motor piden republicar", () => {
    const nuevos = driftContraVigente({
      vigente,
      productosMotor: productos({ "Elfbar|TE 30K": 8.5, "Ignite|V250": 10, "Nikbar|X": 9 }),
      politica: POLITICA,
    });
    expect(nuevos.nuevos).toEqual(["Nikbar|X"]);
    expect(nuevos.necesitaRepublicar).toBe(true);

    const retirados = driftContraVigente({
      vigente, productosMotor: productos({ "Elfbar|TE 30K": 8.5 }), politica: POLITICA,
    });
    expect(retirados.retirados).toEqual(["Ignite|V250"]);

    const politica = driftContraVigente({
      vigente, productosMotor: productos({ "Elfbar|TE 30K": 8.5, "Ignite|V250": 10 }),
      politica: { ...POLITICA, escalones: POLITICA.escalones.slice(0, 2) },
    });
    expect(politica.politicaCambio).toBe(true);
    expect(politica.necesitaRepublicar).toBe(true);
  });

  it("cambio en parámetros de INTEGRACIÓN (vigencia, buffer) no es cambio de motor", () => {
    expect(politicaMotorCambio(POLITICA, { ...POLITICA, vigenciaHoras: 72, bufferFxPct: 0.05 })).toBe(false);
    expect(politicaMotorCambio(POLITICA, { ...POLITICA, margenMinimo: 0.2 })).toBe(true);
  });

  it("sin lista vigente: pide publicar si hay productos con costo", () => {
    expect(driftContraVigente({ vigente: null, productosMotor: productos({ "A|B": 5 }), politica: POLITICA }).necesitaRepublicar).toBe(true);
    expect(driftContraVigente({ vigente: null, productosMotor: [], politica: POLITICA }).necesitaRepublicar).toBe(false);
  });
});

describe("precioEnLista — la cotización lee la lista, jamás recalcula (RN-12)", () => {
  const lista = snapshotBase();
  it("resuelve el precio del escalón por total de unidades", () => {
    expect(precioEnLista(lista, "Elfbar|TE 30K", 20)).toMatchObject({ precio: 13.5, desde: 20 });
    expect(precioEnLista(lista, "Elfbar|TE 30K", 75)).toMatchObject({ precio: 13, desde: 50 });
    expect(precioEnLista(lista, "Elfbar|TE 30K", 500)).toMatchObject({ precio: 12, desde: 200 });
  });
  it("debajo del mínimo o producto inexistente ⇒ null", () => {
    expect(precioEnLista(lista, "Elfbar|TE 30K", 10)).toBeNull();
    expect(precioEnLista(lista, "No|Existe", 50)).toBeNull();
  });
});

describe("compararSnapshots — qué cambia antes de publicar", () => {
  const base = snapshotBase();

  it("sin lista vigente: todo entra y hay algo que publicar", () => {
    const cmp = compararSnapshots(null, base);
    expect(cmp.hayCambios).toBe(true);
    expect(cmp.entran.map((f) => f.id)).toEqual(["Elfbar|TE 30K", "Ignite|V250"]);
    expect(cmp.cambios).toEqual([]);
  });

  it("mismos costos y misma política ⇒ NO hay cambios (no se genera versión)", () => {
    const candidato = snapshotBase({ version: "v2026-08.2", fecha: "2026-08-08T12:00:00.000Z", base });
    const cmp = compararSnapshots(base, candidato);
    expect(cmp.hayCambios).toBe(false);
    expect(cmp.cambios).toEqual([]);
    expect(cmp.entran).toEqual([]);
    expect(cmp.salen).toEqual([]);
  });

  it("un costo que se movió de verdad aparece con precios antes/después y delta", () => {
    const candidato = construirSnapshot({
      productosMotor: productos({ "Elfbar|TE 30K": 9.5, "Ignite|V250": 10 }),
      politica: POLITICA, version: "v2026-08.2", fecha: "2026-08-08T12:00:00.000Z", base,
    });
    const cmp = compararSnapshots(base, candidato);
    expect(cmp.hayCambios).toBe(true);
    expect(cmp.cambios).toHaveLength(1);
    expect(cmp.cambios[0]).toMatchObject({
      id: "Elfbar|TE 30K",
      antes: [13.5, 13, 12.5, 12],
      ahora: [15, 14.5, 14, 13.5],
    });
    expect(cmp.cambios[0].deltaPct).toBeCloseTo((15 - 13.5) / 13.5, 10);
  });

  it("modelos que entran y que salen del catálogo", () => {
    const candidato = construirSnapshot({
      productosMotor: productos({ "Elfbar|TE 30K": 8.5, "Nikbar|Ice Baby": 9 }),
      politica: POLITICA, version: "v2026-08.2", fecha: "2026-08-08T12:00:00.000Z", base,
    });
    const cmp = compararSnapshots(base, candidato);
    expect(cmp.entran.map((f) => f.id)).toEqual(["Nikbar|Ice Baby"]);
    expect(cmp.salen.map((f) => f.id)).toEqual(["Ignite|V250"]);
  });

  it("la política sola cambia ⇒ hay algo que publicar aunque ningún precio se mueva", () => {
    // Ej: vigencia del presupuesto — viaja congelada en el snapshot y se
    // declara en la lista compartida.
    const otra = { ...POLITICA, vigenciaHoras: 72 };
    const candidato = construirSnapshot({
      productosMotor: productos({ "Elfbar|TE 30K": 8.5, "Ignite|V250": 10 }),
      politica: otra, version: "v2026-08.2", fecha: "2026-08-08T12:00:00.000Z", base,
    });
    const cmp = compararSnapshots(base, candidato);
    expect(cmp.cambios).toEqual([]);
    expect(cmp.politicaCambio).toBe(true);
    expect(cmp.hayCambios).toBe(true);
  });
});

describe("alertasDeHoy — los precios son inmutables, las alertas son una lente", () => {
  // Caso real: V150 Pro es el SKU con anti-colapso de la lista v2026-08 (su
  // escalón 200+ arranca ya 0,2 pts debajo del objetivo). Al absorber una
  // suba de costo del 3% (estabilidad §5.17) queda 2,6 pts debajo — sigue
  // arriba del piso, así que NO bloquea, pero es exactamente la erosión que
  // la alerta tiene que ver venir antes de que el piso la frene.
  const conV150 = (costo) => [{ id: "Ignite|V150 Pro", marca: "Ignite", modelo: "V150 Pro", costo, productIds: ["x"], sabores: 1 }];
  const base = construirSnapshot({
    productosMotor: conV150(8), politica: { ...POLITICA, margenAlertaPuntos: 0.03 },
    version: "v2026-08", fecha: "2026-08-07T12:00:00.000Z",
  });
  const erosionada = construirSnapshot({
    productosMotor: conV150(8.24), politica: { ...POLITICA, margenAlertaPuntos: 0.03 },
    version: "v2026-08.2", fecha: "2026-08-08T12:00:00.000Z", base,
  });

  it("el snapshot conserva precios (§5.17) y el margen real cae contra el objetivo", () => {
    const fila = erosionada.filas[0];
    expect(fila.estabilizada).toBe(true);
    expect(fila.precios.map((e) => e.precio)).toEqual([13, 12, 11.5, 11]);
    const ultimo = fila.precios[fila.precios.length - 1];
    expect(ultimo.margenReal).toBeCloseTo(0.1535, 4); // arriba del piso 15%
    expect(fila.alertas).toEqual([]); // con tolerancia 3 pts no alertaba al publicar
  });

  it("bajar la tolerancia HOY muestra la erosión sin tocar el snapshot publicado", () => {
    const lente = alertasDeHoy(erosionada, conV150(8.24), POLITICA); // 2 pts
    const alertas = lente.get("Ignite|V150 Pro").alertas;
    expect(alertas).toEqual([
      expect.objectContaining({ regla: "margenAlerta", desde: 200, objetivo: 0.18 }),
    ]);
    // El snapshot sigue intacto: los precios son inmutables, la alerta es lente.
    expect(erosionada.filas[0].alertas).toEqual([]);
  });

  it("la lista sana no alerta con la política de hoy (la alerta no es ruido)", () => {
    const lente = alertasDeHoy(base, conV150(8), POLITICA);
    expect(lente.get("Ignite|V150 Pro").alertas).toEqual([]);
  });

  it("un producto que ya no está en el catálogo no rompe la lente", () => {
    const lente = alertasDeHoy(base, [], POLITICA);
    expect(lente.get("Ignite|V150 Pro").bloqueantes).toEqual([]);
  });
});
