import { describe, it, expect } from "vitest";
import {
  MESSAGE_SLOTS,
  buildCatalogContext,
  templateCopy,
  normalizeCopy,
  composeDailyMessage,
  buildSystemPrompt,
  buildUserPrompt,
  MESSAGE_COPY_SCHEMA,
} from "./messageAgent.js";

// Fecha fija para tests deterministas: jueves 11/06/2026 12:00 ART (15:00 UTC).
const NOW = new Date("2026-06-11T15:00:00Z");

function mkProducts() {
  return [
    { id: "a", brand: "Elfbar", model: "BC10000", flavor: "Watermelon", stock: 5, priceUSD: 10, createdAt: "2026-06-10T12:00:00Z" }, // novedad
    { id: "b", brand: "Lost Mary", model: "BM600", flavor: "Blueberry", stock: 2, priceUSD: 8 }, // low stock
    { id: "c", brand: "Geek Bar", model: "Pulse", flavor: "Sour Apple", stock: 0, priceUSD: 12 }, // sin stock → excluido
    { id: "d", brand: "Elfbar", model: "BC10000", flavor: "Mango", stock: 20, priceUSD: 10 },
    { id: "e", brand: "Ignite", model: "V150", flavor: "Mint", stock: 1, isDeleted: true }, // borrado → excluido
  ];
}

function mkSales() {
  return [
    { date: "2026-06-09", items: [{ productId: "a", qty: 4 }, { productId: "d", qty: 1 }] },
    { date: "2026-06-08", items: [{ productId: "a", qty: 2 }] },
    { date: "2026-01-01", items: [{ productId: "a", qty: 99 }] }, // fuera de los 30 días → no cuenta
    { date: "2026-06-09", isDeleted: true, items: [{ productId: "d", qty: 50 }] }, // borrada → no cuenta
  ];
}

describe("buildCatalogContext", () => {
  it("excluye productos sin stock y borrados de las stats", () => {
    const ctx = buildCatalogContext({ products: mkProducts(), sales: [], now: NOW, slot: "noon" });
    // Quedan a, b, d (c sin stock y e borrado se excluyen).
    expect(ctx.stats.flavors).toBe(3);
    // brands de productos con stock: Elfbar(a,d) + Lost Mary(b) = 2
    expect(ctx.stats.brands).toBe(2);
  });

  it("cuenta marcas y modelos únicos sólo de lo disponible", () => {
    const ctx = buildCatalogContext({ products: mkProducts(), sales: [], now: NOW });
    expect(ctx.stats.brands).toBe(2); // Elfbar, Lost Mary
    expect(ctx.stats.models).toBe(2); // Elfbar|BC10000, Lost Mary|BM600
    expect(ctx.stats.units).toBe(27); // 5 + 2 + 20
  });

  it("topSellers sólo cuenta ventas de los últimos 30 días y con stock vivo", () => {
    const ctx = buildCatalogContext({ products: mkProducts(), sales: mkSales(), now: NOW });
    expect(ctx.topSellers[0].name).toBe("Elfbar BC10000 Watermelon");
    expect(ctx.topSellers[0].units).toBe(6); // 4 + 2 (la de enero y la borrada no cuentan)
  });

  it("detecta novedades por createdAt reciente", () => {
    const ctx = buildCatalogContext({ products: mkProducts(), sales: [], now: NOW });
    expect(ctx.newArrivals.map(n => n.name)).toContain("Elfbar BC10000 Watermelon");
  });

  it("lista lowStock (<=3) ordenado por menos stock", () => {
    const ctx = buildCatalogContext({ products: mkProducts(), sales: [], now: NOW });
    expect(ctx.lowStock[0].name).toBe("Lost Mary BM600 Blueberry");
    expect(ctx.lowStock[0].stock).toBe(2);
  });

  it("marca finde para viernes/sábado/domingo", () => {
    const viernes = new Date("2026-06-12T15:00:00Z");
    expect(buildCatalogContext({ now: viernes }).isWeekend).toBe(true);
    const martes = new Date("2026-06-09T15:00:00Z");
    expect(buildCatalogContext({ now: martes }).isWeekend).toBe(false);
  });

  it("no crashea con data vacía", () => {
    const ctx = buildCatalogContext({});
    expect(ctx.stats.flavors).toBe(0);
    expect(ctx.topSellers).toEqual([]);
    expect(ctx.newArrivals).toEqual([]);
  });
});

describe("templateCopy", () => {
  it("varía el gancho según el día de la semana", () => {
    const jueves = templateCopy(buildCatalogContext({ products: mkProducts(), now: NOW, slot: "noon" }));
    const lunes = templateCopy(buildCatalogContext({ products: mkProducts(), now: new Date("2026-06-08T15:00:00Z"), slot: "noon" }));
    expect(jueves.hook).not.toBe(lunes.hook);
  });

  it("el slot de la tarde cambia el cierre (CTA con urgencia horaria)", () => {
    const ctx = buildCatalogContext({ products: mkProducts(), now: NOW, slot: "evening" });
    const copy = templateCopy(ctx);
    expect(copy.cta.toLowerCase()).toContain("horas");
  });

  it("prioriza novedades en la línea de urgencia", () => {
    const ctx = buildCatalogContext({ products: mkProducts(), now: NOW, slot: "noon" });
    const copy = templateCopy(ctx);
    expect(copy.urgency).toContain("🆕");
  });

  it("sin novedades, cae a últimas unidades", () => {
    const noNew = mkProducts().map(p => ({ ...p, createdAt: undefined, addedDate: undefined }));
    const ctx = buildCatalogContext({ products: noNew, now: NOW, slot: "noon" });
    const copy = templateCopy(ctx);
    expect(copy.urgency).toContain("Últimas unidades");
  });

  it("marca source=template", () => {
    expect(templateCopy(buildCatalogContext({})).source).toBe("template");
  });
});

describe("normalizeCopy", () => {
  it("recorta strings largos y respeta null en urgency", () => {
    const out = normalizeCopy({ hook: "x".repeat(500), urgency: null, cta: "dale" }, "ai");
    expect(out.hook.length).toBe(200);
    expect(out.urgency).toBeNull();
    expect(out.cta).toBe("dale");
    expect(out.source).toBe("ai");
  });

  it("convierte urgency vacío a null", () => {
    expect(normalizeCopy({ hook: "h", urgency: "   ", cta: "c" }).urgency).toBeNull();
  });

  it("tolera campos faltantes o tipos raros sin romper", () => {
    const out = normalizeCopy({ hook: 123, cta: undefined });
    expect(out.hook).toBe("");
    expect(out.cta).toBe("");
    expect(out.urgency).toBeNull();
  });
});

describe("composeDailyMessage", () => {
  const copy = { hook: "Jueves pre-finde 🎉", urgency: "🆕 Recién llegados: Elfbar Watermelon", cta: "Escribime 📲", source: "ai" };
  const catalog = "🔥 IMPORTS ZONA NORTE 🔥\n\n*ELFBAR BC10000*\n* Watermelon 🍉";

  it("ensambla hook + urgency + catálogo + cta en orden", () => {
    const msg = composeDailyMessage(copy, catalog);
    const iHook = msg.indexOf("Jueves");
    const iUrg = msg.indexOf("Recién llegados");
    const iCat = msg.indexOf("IMPORTS ZONA NORTE");
    const iCta = msg.indexOf("Escribime");
    expect(iHook).toBeLessThan(iUrg);
    expect(iUrg).toBeLessThan(iCat);
    expect(iCat).toBeLessThan(iCta);
  });

  it("omite urgency cuando es null sin dejar líneas vacías colgando", () => {
    const msg = composeDailyMessage({ ...copy, urgency: null }, catalog);
    expect(msg).not.toContain("\n\n\n");
    expect(msg).toContain("Jueves pre-finde");
  });

  it("funciona con copy de template", () => {
    const ctx = buildCatalogContext({ products: mkProducts(), now: NOW, slot: "noon" });
    const msg = composeDailyMessage(templateCopy(ctx), catalog);
    expect(msg).toContain("IMPORTS ZONA NORTE");
    expect(msg.length).toBeGreaterThan(catalog.length);
  });

  it("si no hay catálogo igual arma el copy", () => {
    const msg = composeDailyMessage(copy, "");
    expect(msg).toContain("Jueves");
    expect(msg).toContain("Escribime");
  });
});

describe("prompts", () => {
  it("el system prompt prohíbe inventar productos/precios", () => {
    const sp = buildSystemPrompt();
    expect(sp.toLowerCase()).toContain("no inventes");
    expect(sp.toLowerCase()).toContain("json");
  });

  it("el user prompt incluye día, horario y señales del contexto", () => {
    const ctx = buildCatalogContext({ products: mkProducts(), sales: mkSales(), now: NOW, slot: "evening" });
    const up = buildUserPrompt(ctx);
    expect(up).toContain("tarde");
    expect(up).toMatch(/sabores/);
    expect(up).toContain("Watermelon"); // top seller / novedad mencionado
  });

  it("el schema pide los 3 campos y no permite extras", () => {
    expect(MESSAGE_COPY_SCHEMA.required).toEqual(["hook", "urgency", "cta"]);
    expect(MESSAGE_COPY_SCHEMA.additionalProperties).toBe(false);
  });
});

describe("MESSAGE_SLOTS", () => {
  it("define exactamente noon y evening", () => {
    expect(MESSAGE_SLOTS.map(s => s.id)).toEqual(["noon", "evening"]);
  });
});
