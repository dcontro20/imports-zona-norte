import { describe, it, expect } from "vitest";
import { pickDailyCopy, detectSituation, bankSize } from "./messageCopyBank.js";

// Contexto base reutilizable.
function ctx(over = {}) {
  return {
    slot: "noon",
    daySeed: 20000,
    isWeekend: false,
    stats: { flavors: 50, models: 10, brands: 5, units: 200 },
    newArrivals: [],
    topSellers: [],
    lowStock: [],
    ...over,
  };
}

describe("detectSituation", () => {
  it("novedad tiene prioridad sobre todo", () => {
    expect(detectSituation(ctx({ newArrivals: [{ name: "X" }], lowStock: [{ name: "Y", stock: 1 }], topSellers: [{ name: "Z" }] }))).toBe("novedad");
  });
  it("agotando si no hay novedad", () => {
    expect(detectSituation(ctx({ lowStock: [{ name: "Y", stock: 1 }], topSellers: [{ name: "Z" }] }))).toBe("agotando");
  });
  it("top si no hay novedad ni low stock", () => {
    expect(detectSituation(ctx({ topSellers: [{ name: "Z" }] }))).toBe("top");
  });
  it("normal si no hay señales", () => {
    expect(detectSituation(ctx())).toBe("normal");
  });
});

describe("pickDailyCopy", () => {
  it("devuelve hook, cta y source=bank", () => {
    const c = pickDailyCopy(ctx());
    expect(c.hook.length).toBeGreaterThan(5);
    expect(c.cta.length).toBeGreaterThan(5);
    expect(c.source).toBe("bank");
  });

  it("incluye el número de sabores en el hook", () => {
    const c = pickDailyCopy(ctx({ stats: { flavors: 87, models: 12 } }));
    expect(c.hook).toContain("87");
  });

  it("mediodía y tarde del mismo día dan copys distintos", () => {
    const noon = pickDailyCopy(ctx({ slot: "noon" }));
    const evening = pickDailyCopy(ctx({ slot: "evening" }));
    expect(noon.cta).not.toBe(evening.cta);
  });

  it("días distintos rotan el gancho", () => {
    const d1 = pickDailyCopy(ctx({ daySeed: 20000 }));
    const d2 = pickDailyCopy(ctx({ daySeed: 20001 }));
    expect(d1.hook).not.toBe(d2.hook);
  });

  it("finde usa pool de finde (vibra distinta a día de semana)", () => {
    const wk = pickDailyCopy(ctx({ isWeekend: false }));
    const we = pickDailyCopy(ctx({ isWeekend: true }));
    expect(wk.hook).not.toBe(we.hook);
  });

  it("la tarde cierra con urgencia horaria", () => {
    const c = pickDailyCopy(ctx({ slot: "evening" }));
    expect(c.cta.toLowerCase()).toMatch(/hora|último|cierro/);
  });

  it("rellena urgencia de novedad con nombres reales", () => {
    const c = pickDailyCopy(ctx({ newArrivals: [{ name: "Elfbar Watermelon" }, { name: "Lost Mary Blue" }] }));
    expect(c.situation).toBe("novedad");
    expect(c.urgency).toContain("Elfbar Watermelon");
    expect(c.urgency).not.toContain("{names}");
  });

  it("rellena urgencia de agotando con nombre y stock", () => {
    const c = pickDailyCopy(ctx({ lowStock: [{ name: "Geek Bar Pulse", stock: 2 }] }));
    expect(c.situation).toBe("agotando");
    expect(c.urgency).toContain("Geek Bar Pulse");
    expect(c.urgency).toContain("2");
    expect(c.urgency).not.toContain("{");
  });

  it("nunca deja placeholders sin reemplazar", () => {
    const c = pickDailyCopy(ctx({ topSellers: [{ name: "Ignite V150" }] }));
    expect(c.hook).not.toContain("{");
    if (c.urgency) expect(c.urgency).not.toContain("{");
    expect(c.cta).not.toContain("{");
  });

  it("no crashea con contexto vacío", () => {
    const c = pickDailyCopy({});
    expect(c.hook).toBeTruthy();
    expect(c.cta).toBeTruthy();
  });
});

describe("variedad del banco", () => {
  it("genera muchos hooks distintos a lo largo de 14 días sin repetir enseguida", () => {
    const hooks = new Set();
    for (let d = 0; d < 14; d++) {
      for (const slot of ["noon", "evening"]) {
        hooks.add(pickDailyCopy(ctx({ daySeed: 20000 + d, slot })).hook);
      }
    }
    // Con los pools actuales debe haber buena variedad (no 1-2 repetidos).
    expect(hooks.size).toBeGreaterThanOrEqual(8);
  });

  it("bankSize reporta el tamaño de los pools", () => {
    const s = bankSize();
    expect(s.hooksWeekday).toBeGreaterThan(5);
    expect(s.ctaEvening).toBeGreaterThan(2);
  });
});
