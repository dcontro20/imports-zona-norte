import { describe, it, expect } from "vitest";
import {
  extractOffersFromAuditLog,
  suggestOffersForSale,
  linkSalesToOffers,
  calcConversionStats,
  offersForClient,
  recentGroupOffers,
} from "./offerHistory.js";

const AUDIT_LOG = [
  {
    id: "audit_1", entityType: "offer", action: "create",
    timestamp: "2026-06-01T10:00:00", user: "Diego",
    description: 'Envió oferta "Reactivar a Juan" a Juan vía whatsapp',
    details: {
      audience: "individual", ideaCategory: "reactivar", offerType: "reactivar",
      method: "whatsapp", clientId: "c1", productIds: ["p1"], suggestedDiscountPct: 10,
    },
  },
  {
    id: "audit_2", entityType: "offer", action: "create",
    timestamp: "2026-06-02T11:00:00", user: "Diego",
    description: 'Envió oferta "Stock list" a Mi grupo de WhatsApp vía copia',
    details: {
      audience: "groupClients", ideaCategory: "stocklist", offerType: "stocklist",
      method: "copia", clientId: null, productIds: ["p1", "p2"], suggestedDiscountPct: 0,
    },
  },
  {
    id: "audit_3", entityType: "sale", action: "create",
    timestamp: "2026-06-03T12:00:00", user: "Diego",
    description: "Venta a Juan",
    details: {},
  },
  {
    id: "audit_4", entityType: "offer", action: "create",
    timestamp: "2026-06-03T09:00:00", user: "Diego",
    description: 'Envió oferta "Pack fiesta"',
    details: {
      audience: "groupParty", ideaCategory: "packfiesta", offerType: "packfiesta",
      method: "share", clientId: null, productIds: ["p1", "p2", "p3"], suggestedDiscountPct: 15,
    },
  },
];

describe("extractOffersFromAuditLog", () => {
  it("filtra solo entries de oferta y normaliza estructura", () => {
    const offers = extractOffersFromAuditLog(AUDIT_LOG);
    expect(offers).toHaveLength(3);
    expect(offers[0].audience).toBe("groupParty"); // más reciente primero
    expect(offers[0].productIds).toEqual(["p1", "p2", "p3"]);
  });

  it("ordena desc por timestamp", () => {
    const offers = extractOffersFromAuditLog(AUDIT_LOG);
    expect(offers[0].timestamp).toBe("2026-06-03T09:00:00");
    expect(offers[2].timestamp).toBe("2026-06-01T10:00:00");
  });

  it("handles auditLog vacío", () => {
    expect(extractOffersFromAuditLog([])).toEqual([]);
    expect(extractOffersFromAuditLog(null)).toEqual([]);
  });

  it("ignora entries que no son offer", () => {
    const offers = extractOffersFromAuditLog(AUDIT_LOG);
    expect(offers.every(o => o.id !== "audit_3")).toBe(true);
  });
});

describe("suggestOffersForSale", () => {
  const offers = extractOffersFromAuditLog(AUDIT_LOG);

  it("matchea oferta individual al mismo cliente dentro de 14d", () => {
    const sale = { clientId: "c1", date: "2026-06-05T12:00:00" };
    const sugs = suggestOffersForSale(offers, sale);
    expect(sugs.length).toBeGreaterThan(0);
    expect(sugs[0].matchType).toBe("client");
    expect(sugs[0].offer.clientId).toBe("c1");
  });

  it("matchea oferta grupal dentro de 7d", () => {
    const sale = { clientId: "c2", date: "2026-06-04T12:00:00" }; // 2d después de stocklist grupal
    const sugs = suggestOffersForSale(offers, sale);
    // Encuentra ofertas grupales recientes
    expect(sugs.some(s => s.matchType === "group")).toBe(true);
  });

  it("no matchea ofertas posteriores a la venta", () => {
    const sale = { clientId: "c1", date: "2026-05-30T12:00:00" }; // antes de todas
    const sugs = suggestOffersForSale(offers, sale);
    expect(sugs).toEqual([]);
  });

  it("no matchea oferta a OTRO cliente individual", () => {
    const sale = { clientId: "c99", date: "2026-06-02T12:00:00" };
    const sugs = suggestOffersForSale(offers, sale);
    // Match solo grupales en este caso
    expect(sugs.every(s => s.matchType !== "client")).toBe(true);
  });

  it("ordena por score (más reciente y match-cliente primero)", () => {
    const sale = { clientId: "c1", date: "2026-06-05T12:00:00" };
    const sugs = suggestOffersForSale(offers, sale);
    expect(sugs[0].score).toBeGreaterThan(sugs[sugs.length - 1].score);
  });
});

describe("linkSalesToOffers", () => {
  it("linkea ventas con linkedOfferId explícito", () => {
    const offers = extractOffersFromAuditLog(AUDIT_LOG);
    const sales = [
      { id: "s1", clientId: "c1", date: "2026-06-05", linkedOfferId: "audit_1" },
    ];
    const linked = linkSalesToOffers(offers, sales);
    const offer1 = linked.find(l => l.offer.id === "audit_1");
    expect(offer1.salesExplicit).toHaveLength(1);
    expect(offer1.salesImplicit).toHaveLength(0);
  });

  it("linkea implícitamente por proximidad cliente+fecha", () => {
    const offers = extractOffersFromAuditLog(AUDIT_LOG);
    const sales = [
      { id: "s2", clientId: "c1", date: "2026-06-05", linkedOfferId: null },
    ];
    const linked = linkSalesToOffers(offers, sales);
    const offer1 = linked.find(l => l.offer.id === "audit_1");
    expect(offer1.salesImplicit.length).toBeGreaterThanOrEqual(1);
  });

  it("ignora ventas borradas", () => {
    const offers = extractOffersFromAuditLog(AUDIT_LOG);
    const sales = [
      { id: "s3", clientId: "c1", date: "2026-06-05", linkedOfferId: "audit_1", isDeleted: true },
    ];
    const linked = linkSalesToOffers(offers, sales);
    const offer1 = linked.find(l => l.offer.id === "audit_1");
    expect(offer1.salesExplicit).toHaveLength(0);
  });
});

describe("calcConversionStats", () => {
  it("calcula conversion por categoría", () => {
    const offers = extractOffersFromAuditLog(AUDIT_LOG);
    const sales = [
      { id: "s1", clientId: "c1", date: "2026-06-04", linkedOfferId: "audit_1" },
    ];
    const stats = calcConversionStats(offers, sales);
    expect(stats.byCategory.reactivar.sent).toBe(1);
    expect(stats.byCategory.reactivar.withSale).toBe(1);
    expect(stats.byCategory.reactivar.conversion).toBe(100);
  });

  it("calcula overall conversion", () => {
    const offers = extractOffersFromAuditLog(AUDIT_LOG);
    const sales = [
      { id: "s1", clientId: "c1", date: "2026-06-04", linkedOfferId: "audit_1" },
    ];
    const stats = calcConversionStats(offers, sales);
    expect(stats.totalSent).toBe(3);
    expect(stats.totalWithSale).toBeGreaterThanOrEqual(1);
  });
});

describe("offersForClient", () => {
  it("filtra solo ofertas a ese cliente dentro de ventana", () => {
    const offers = extractOffersFromAuditLog(AUDIT_LOG);
    const result = offersForClient(offers, "c1", { now: new Date("2026-06-10") });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(o => o.clientId === "c1")).toBe(true);
  });

  it("excluye ofertas grupales", () => {
    const offers = extractOffersFromAuditLog(AUDIT_LOG);
    const result = offersForClient(offers, "c1", { now: new Date("2026-06-10") });
    expect(result.every(o => o.clientId !== null)).toBe(true);
  });
});

describe("recentGroupOffers", () => {
  it("filtra solo ofertas grupales (sin clientId)", () => {
    const offers = extractOffersFromAuditLog(AUDIT_LOG);
    const result = recentGroupOffers(offers, { now: new Date("2026-06-05") });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(o => !o.clientId)).toBe(true);
  });
});
