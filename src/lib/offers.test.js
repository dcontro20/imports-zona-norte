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
  { id: "p4", brand: "Elfbar", model: "TE", flavor: "Banana Ice", puffs: "30000", priceARS: 29100, stock: 4 },
  { id: "p5", brand: "Elfbar", model: "TE", flavor: "Cherry", puffs: "30000", priceARS: 29100, stock: 6 },
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
    expect(applyDiscount(29100, 20)).toBe(23300);
  });
  it("clamps to 0-100", () => {
    expect(applyDiscount(1000, 150)).toBe(0);
    expect(applyDiscount(1000, -10)).toBe(1000);
  });
});

describe("suggestLiquidation", () => {
  it("suggests slow movers with enough stock", () => {
    const stats = {
      p1: { velocity30dPerDay: 0.01 },
      p2: { velocity30dPerDay: 5 },
      p3: { velocity30dPerDay: 0 },
    };
    const result = suggestLiquidation(PRODUCTS, stats, { minStock: 3 });
    const ids = result.map(r => r.product.id);
    expect(ids).toContain("p1");
    expect(ids).not.toContain("p2");
    expect(ids).not.toContain("p3");
  });

  it("includes never-sold products with stock (Infinity daysToClear)", () => {
    const stats = { p1: { velocity30dPerDay: 0 } };
    const result = suggestLiquidation([PRODUCTS[0]], stats, { minStock: 3 });
    expect(result[0].daysToClear).toBe(Infinity);
  });
});

describe("buildOfferMessage - tipos básicos", () => {
  it("destacado incluye producto y precio", () => {
    const offer = { type: "destacado", products: [{ product: PRODUCTS[0] }] };
    const msg = buildOfferMessage(offer, RATE);
    expect(msg.full).toContain("Destacados");
    expect(msg.full).toContain("Watermelon Ice");
    expect(msg.full).toContain("$29.100");
  });

  it("usa special price cuando se pasa", () => {
    const offer = { type: "destacado", products: [{ product: PRODUCTS[0], specialPriceARS: 25000 }] };
    const msg = buildOfferMessage(offer, RATE);
    expect(msg.full).toContain("$25.000");
    expect(msg.full).not.toContain("$29.100");
  });

  it("combo muestra cantidad/precio y calcula ahorro", () => {
    const offer = { type: "combo", comboQty: 3, comboPriceARS: 75000, products: [{ product: PRODUCTS[0] }] };
    const msg = buildOfferMessage(offer, RATE);
    expect(msg.full).toContain("3");
    expect(msg.full).toContain("$75.000");
    expect(msg.full).toMatch(/ahorr/i);
  });

  it("liquidacion muestra precio tachado con descuento", () => {
    const offer = { type: "liquidacion", discountPct: 20, products: [{ product: PRODUCTS[0] }] };
    const msg = buildOfferMessage(offer, RATE);
    expect(msg.full).toContain("Liquidación");
    expect(msg.full).toContain("-20%");
    expect(msg.full).toContain("~$29.100~");
  });

  it("descuento general", () => {
    const offer = { type: "descuento", discountPct: 15, products: [{ product: PRODUCTS[0] }] };
    const msg = buildOfferMessage(offer, RATE);
    expect(msg.full).toContain("15% OFF");
  });

  it("footer custom cuando no hay audience", () => {
    const offer = { type: "destacado", products: [], footer: "Llamame!" };
    const msg = buildOfferMessage(offer, RATE);
    expect(msg.full).toContain("Llamame!");
  });

  it("ningún mensaje firma con nombre personal Diego", () => {
    const tipos = ["destacado", "combo", "liquidacion", "descuento", "stocklist", "recordatorio"];
    tipos.forEach(t => {
      const msg = buildOfferMessage(
        { type: t, products: [{ product: PRODUCTS[0] }], discountPct: 10, comboQty: 2, comboPriceARS: 40000 },
        RATE,
        { audience: "individual", ctx: { clientName: "Pedro" } }
      );
      expect(msg.full).not.toContain("Diego");
    });
  });

  it("usa emoji de sabor en productos", () => {
    const offer = { type: "destacado", products: [{ product: PRODUCTS[0] }] };
    const msg = buildOfferMessage(offer, RATE);
    // Watermelon Ice → 🍉🧊
    expect(msg.full).toContain("🍉");
  });
});

describe("whatsappLink", () => {
  it("link con phone y texto encoded", () => {
    const link = whatsappLink("Hola mundo", "+595 991 234567");
    expect(link).toBe("https://wa.me/595991234567?text=Hola%20mundo");
  });
  it("sin phone", () => {
    expect(whatsappLink("hi")).toBe("https://wa.me/?text=hi");
  });
});

describe("buildOfferMessage - audiencias (sin Diego, lenguaje natural)", () => {
  it("warm con clientName aparece en algún lugar del mensaje, sin Diego", () => {
    // Con pool rotativo NO siempre el opener menciona el nombre, pero
    // al menos el cierre nunca debe firmar con Diego.
    const msg = buildOfferMessage(
      { type: "destacado", products: [{ product: PRODUCTS[0] }] },
      RATE,
      { audience: "individual", ctx: { clientName: "Juan" }, seed: "test-warm-juan" }
    );
    expect(msg.full).not.toContain("Diego");
    expect(msg.full).toMatch(/consulta|DM|copa|avisame|aparto|por acá|arreglamos/i);
  });

  it("commercial menciona IZN en opener o closer", () => {
    // Probamos múltiples seeds para asegurar que el branding aparece al menos en uno
    const outs = [];
    for (let i = 0; i < 5; i++) {
      const msg = buildOfferMessage(
        { type: "destacado", products: [{ product: PRODUCTS[0] }] },
        RATE,
        { audience: "groupClients", seed: `commercial-${i}` }
      );
      outs.push(msg.full);
    }
    expect(outs.some(m => /IZN|IMPORTS/i.test(m))).toBe(true);
    outs.forEach(m => {
      expect(m).toMatch(/DM|privado/i);
      expect(m).not.toContain("Diego");
    });
  });

  it("casual con weekend menciona finde en algún seed + nunca Diego", () => {
    // El opener casual con weekend a veces dice "finde", a veces otra cosa.
    // Probamos varios seeds y al menos uno debe mencionarlo. El packfiesta
    // tipo siempre habla de finde en la urgencia.
    const outs = [];
    for (let i = 0; i < 8; i++) {
      const msg = buildOfferMessage(
        { type: "packfiesta", products: [{ product: PRODUCTS[0] }, { product: PRODUCTS[1] }], comboQty: 2, comboPriceARS: 40000 },
        RATE,
        { audience: "groupParty", ctx: { weekend: true }, seed: `casual-${i}` }
      );
      outs.push(msg.full);
    }
    expect(outs.some(m => /finde/i.test(m))).toBe(true);
    outs.forEach(m => {
      expect(m).not.toContain("Diego");
    });
  });
});

describe("buildOfferMessage - tipos info", () => {
  it("stocklist agrupa por marca con emojis de sabor", () => {
    const msg = buildOfferMessage(
      { type: "stocklist", products: PRODUCTS.map(p => ({ product: p })) },
      RATE
    );
    expect(msg.full).toMatch(/ELFBAR/);
    expect(msg.full).toMatch(/LOST MARY/);
    expect(msg.full).toMatch(/Watermelon Ice/);
    expect(msg.full).toContain("🍉"); // emoji de sabor watermelon
  });

  it("packfiesta muestra cantidad, precio y ahorro", () => {
    const msg = buildOfferMessage(
      { type: "packfiesta", products: [{ product: PRODUCTS[0] }, { product: PRODUCTS[1] }], comboQty: 2, comboPriceARS: 40000 },
      RATE
    );
    expect(msg.full).toMatch(/Pack del finde/i);
    expect(msg.full).toContain("$40.000");
    expect(msg.full).toMatch(/Ahorro/i);
  });

  it("recordatorio sin push duro", () => {
    const msg = buildOfferMessage(
      { type: "recordatorio", products: [{ product: PRODUCTS[0] }] },
      RATE
    );
    expect(msg.full).not.toMatch(/OFERTA|LIQUIDACIÓN|DESCUENTO/);
    expect(msg.full).toMatch(/stock|💨/i);
  });

  it("drop anuncia productos nuevos", () => {
    const msg = buildOfferMessage(
      { type: "drop", products: [{ product: PRODUCTS[0] }] },
      RATE
    );
    expect(msg.full).toMatch(/nuevos|llegaron/i);
  });

  it("restock muestra productos que volvieron", () => {
    const msg = buildOfferMessage(
      { type: "restock", products: [{ product: PRODUCTS[0] }] },
      RATE
    );
    expect(msg.full).toMatch(/Volvieron/);
    expect(msg.full).toContain("Watermelon Ice");
  });
});

describe("buildOfferMessage - nuevos tipos multi-sabor para vender más", () => {
  it("mix3x2 ofrece lleva-N-paga-(N-1) sobre selección", () => {
    const msg = buildOfferMessage(
      { type: "mix3x2", comboQty: 3, products: [{ product: PRODUCTS[0] }, { product: PRODUCTS[1] }, { product: PRODUCTS[2] }] },
      RATE
    );
    expect(msg.full).toMatch(/Llevás 3.*pagás 2/);
    expect(msg.full).toMatch(/regalo|gratis/i);
    expect(msg.full).toContain("Watermelon Ice");
    expect(msg.full).toContain("Cherry Cola");
    expect(msg.full).toContain("Mango");
  });

  it("combomarca arma combo de N sabores de la misma marca", () => {
    const msg = buildOfferMessage(
      {
        type: "combomarca",
        comboQty: 3,
        comboPriceARS: 75000,
        products: [
          { product: PRODUCTS[0] }, // Elfbar
          { product: PRODUCTS[3] }, // Elfbar
          { product: PRODUCTS[4] }, // Elfbar
        ],
      },
      RATE
    );
    expect(msg.full).toMatch(/Combo Elfbar/i);
    expect(msg.full).toContain("$75.000");
    expect(msg.full).toContain("Watermelon Ice");
    expect(msg.full).toContain("Banana Ice");
  });

  it("duplapack ofrece 2da unidad al 50%", () => {
    const msg = buildOfferMessage(
      { type: "duplapack", products: [{ product: PRODUCTS[0] }, { product: PRODUCTS[1] }] },
      RATE
    );
    expect(msg.full).toMatch(/2da unidad/i);
    expect(msg.full).toMatch(/50%/);
    expect(msg.full).toContain("Watermelon Ice");
    expect(msg.full).toContain("Cherry Cola");
  });

  it("topsemana muestra top con descuento si lleva 2+", () => {
    const msg = buildOfferMessage(
      { type: "topsemana", discountPct: 10, products: PRODUCTS.slice(0, 3).map(p => ({ product: p })) },
      RATE
    );
    expect(msg.full).toMatch(/más pedidos/i);
    expect(msg.full).toMatch(/-10%/);
    expect(msg.full).toMatch(/2 o más/);
    expect(msg.full).toContain("Watermelon Ice");
  });

  it("ningún nuevo tipo firma con Diego", () => {
    const tipos = ["mix3x2", "combomarca", "duplapack", "topsemana"];
    tipos.forEach(t => {
      const msg = buildOfferMessage(
        { type: t, products: PRODUCTS.slice(0, 3).map(p => ({ product: p })), comboQty: 3, comboPriceARS: 70000, discountPct: 10 },
        RATE,
        { audience: "individual", ctx: { clientName: "Pedro" } }
      );
      expect(msg.full).not.toContain("Diego");
    });
  });
});
