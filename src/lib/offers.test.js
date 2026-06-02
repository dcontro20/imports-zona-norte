import { describe, it, expect } from "vitest";
import {
  productPriceARS,
  applyDiscount,
  suggestLiquidation,
  buildOfferMessage,
  whatsappLink,
} from "./offers.js";

const RATE = 1000;
const PRODUCTS = [
  { id: "p1", brand: "Elfbar", model: "TE", flavor: "Watermelon Ice", puffs: "30000", priceARS: 29100, stock: 10 },
  { id: "p2", brand: "Lost Mary", model: "BM", flavor: "Cherry Cola", puffs: "6000", priceUSD: 14, stock: 5 },
  { id: "p3", brand: "Geek", model: "Pulse", flavor: "Mango", puffs: "15000", priceARS: 30000, stock: 2 },
];

describe("productPriceARS", () => {
  it("uses priceARS when present", () => {
    expect(productPriceARS(PRODUCTS[0], RATE)).toBe(29100);
  });
  it("falls back to priceUSD × rate", () => {
    expect(productPriceARS(PRODUCTS[1], RATE)).toBe(14000);
  });
  it("returns 0 for null", () => {
    expect(productPriceARS(null, RATE)).toBe(0);
  });
});

describe("applyDiscount", () => {
  it("applies percent and rounds to hundreds", () => {
    expect(applyDiscount(29100, 20)).toBe(23300); // 23280 → 23300
  });
  it("clamps to 0-100", () => {
    expect(applyDiscount(1000, 150)).toBe(0);
    expect(applyDiscount(1000, -10)).toBe(1000);
  });
});

describe("suggestLiquidation", () => {
  it("suggests slow movers with enough stock", () => {
    const stats = {
      p1: { velocity30dPerDay: 0.01 }, // muy lento → >60d para 10u
      p2: { velocity30dPerDay: 5 },    // rápido → no liquidar
      p3: { velocity30dPerDay: 0 },    // sin ventas
    };
    const result = suggestLiquidation(PRODUCTS, stats, { minStock: 3 });
    const ids = result.map(r => r.product.id);
    expect(ids).toContain("p1");
    expect(ids).not.toContain("p2"); // rápido
    expect(ids).not.toContain("p3"); // stock 2 < minStock 3
  });

  it("includes never-sold products with stock (Infinity daysToClear)", () => {
    const stats = { p1: { velocity30dPerDay: 0 } };
    const result = suggestLiquidation([PRODUCTS[0]], stats, { minStock: 3 });
    expect(result[0].daysToClear).toBe(Infinity);
  });
});

describe("buildOfferMessage", () => {
  it("builds destacado message", () => {
    const offer = { type: "destacado", products: [{ product: PRODUCTS[0] }] };
    const msg = buildOfferMessage(offer, RATE);
    expect(msg.full).toContain("OFERTA");
    expect(msg.full).toContain("Elfbar TE Watermelon Ice");
    expect(msg.full).toContain("$29.100");
    expect(msg.stories).toContain("Watermelon Ice");
  });

  it("uses special price when given", () => {
    const offer = { type: "destacado", products: [{ product: PRODUCTS[0], specialPriceARS: 25000 }] };
    const msg = buildOfferMessage(offer, RATE);
    expect(msg.full).toContain("$25.000");
    expect(msg.full).not.toContain("$29.100");
  });

  it("builds combo message with saving", () => {
    const offer = { type: "combo", comboQty: 3, comboPriceARS: 75000, products: [{ product: PRODUCTS[0] }] };
    const msg = buildOfferMessage(offer, RATE);
    expect(msg.full).toContain("Llevá");
    expect(msg.full).toContain("$75.000");
    expect(msg.full).toMatch(/ahorr/i);
  });

  it("builds liquidacion with struck-through price", () => {
    const offer = { type: "liquidacion", discountPct: 20, products: [{ product: PRODUCTS[0] }] };
    const msg = buildOfferMessage(offer, RATE);
    expect(msg.full).toContain("LIQUIDACIÓN");
    expect(msg.full).toContain("-20%");
    expect(msg.full).toContain("~$29.100~"); // tachado
  });

  it("builds descuento general", () => {
    const offer = { type: "descuento", discountPct: 15, products: [{ product: PRODUCTS[0] }] };
    const msg = buildOfferMessage(offer, RATE);
    expect(msg.full).toContain("15% OFF");
  });

  it("includes footer", () => {
    const offer = { type: "destacado", products: [], footer: "Llamame!" };
    const msg = buildOfferMessage(offer, RATE);
    expect(msg.full).toContain("Llamame!");
  });
});

describe("whatsappLink", () => {
  it("builds link with phone and encoded text", () => {
    const link = whatsappLink("Hola mundo", "+595 991 234567");
    expect(link).toBe("https://wa.me/595991234567?text=Hola%20mundo");
  });
  it("works without phone", () => {
    expect(whatsappLink("hi")).toBe("https://wa.me/?text=hi");
  });
});

describe("buildOfferMessage - audiencias", () => {
  it("aplica opener warm para audiencia individual con clientName", () => {
    const msg = buildOfferMessage(
      { type: "destacado", products: [{ product: PRODUCTS[0] }] },
      RATE,
      { audience: "individual", ctx: { clientName: "Juan" } }
    );
    expect(msg.full).toMatch(/Hola Juan/);
    expect(msg.full).toMatch(/Diego.*IZN/);
  });

  it("aplica opener commercial para grupo de clientes", () => {
    const msg = buildOfferMessage(
      { type: "destacado", products: [{ product: PRODUCTS[0] }] },
      RATE,
      { audience: "groupClients" }
    );
    expect(msg.full).toMatch(/IMPORTS ZONA NORTE/);
    expect(msg.full).toMatch(/Reservás por DM/);
  });

  it("aplica opener casual para grupo de fiestas en finde", () => {
    const msg = buildOfferMessage(
      { type: "packfiesta", products: [{ product: PRODUCTS[0] }, { product: PRODUCTS[1] }], comboQty: 2, comboPriceARS: 40000 },
      RATE,
      { audience: "groupParty", ctx: { weekend: true } }
    );
    expect(msg.full).toMatch(/Hola gente/);
    expect(msg.full).toMatch(/finde/);
    expect(msg.full).toMatch(/x privado/);
  });

  it("no aplica tono si no se pasa audiencia (legacy)", () => {
    const msg = buildOfferMessage(
      { type: "destacado", products: [{ product: PRODUCTS[0] }], footer: "Footer custom" },
      RATE
    );
    expect(msg.full).toMatch(/Footer custom/);
    expect(msg.full).not.toMatch(/Hola/);
  });
});

describe("buildOfferMessage - nuevos tipos", () => {
  it("stocklist agrupa por marca con precio", () => {
    const msg = buildOfferMessage(
      { type: "stocklist", products: PRODUCTS.map(p => ({ product: p })) },
      RATE
    );
    expect(msg.full).toMatch(/ELFBAR/);
    expect(msg.full).toMatch(/LOST MARY/);
    expect(msg.full).toMatch(/GEEK/);
    expect(msg.full).toMatch(/Watermelon Ice/);
  });

  it("packfiesta muestra cantidad y precio del pack", () => {
    const msg = buildOfferMessage(
      { type: "packfiesta", products: [{ product: PRODUCTS[0] }, { product: PRODUCTS[1] }], comboQty: 2, comboPriceARS: 50000 },
      RATE
    );
    expect(msg.full).toMatch(/PACK PARA LA FINDE/);
    expect(msg.full).toMatch(/Llevate \*2\*/);
    expect(msg.full).toMatch(/50.000/);
  });

  it("recordatorio es casual sin push duro", () => {
    const msg = buildOfferMessage(
      { type: "recordatorio", products: [{ product: PRODUCTS[0] }] },
      RATE
    );
    expect(msg.full).toMatch(/Zona Norte/);
    expect(msg.full).not.toMatch(/OFERTA/);
    expect(msg.full).not.toMatch(/DESCUENTO/);
  });

  it("drop anuncia productos nuevos", () => {
    const msg = buildOfferMessage(
      { type: "drop", products: [{ product: PRODUCTS[0] }] },
      RATE
    );
    expect(msg.full).toMatch(/DROP NUEVO/);
    expect(msg.full).toMatch(/acaban de llegar/);
  });

  it("restock muestra productos que volvieron", () => {
    const msg = buildOfferMessage(
      { type: "restock", products: [{ product: PRODUCTS[0] }] },
      RATE
    );
    expect(msg.full).toMatch(/VOLVIÓ EL STOCK/);
    expect(msg.full).toMatch(/Watermelon Ice/);
  });
});
