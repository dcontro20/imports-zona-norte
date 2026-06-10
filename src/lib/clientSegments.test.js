import { describe, it, expect } from "vitest";
import { segmentClient, segmentAllClients, SEGMENT_LABELS } from "./clientSegments.js";

const NOW = new Date("2026-06-15T12:00:00");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const CLIENTS = [
  { id: "c1", name: "Juan", tier: "vip" },
  { id: "c2", name: "Pedro", tier: "regular" },
  { id: "c3", name: "Lucía", tier: "regular" },
  { id: "c4", name: "Sofia", tier: "regular" },
];

const SALES = [
  // Juan VIP: 3 compras grandes, frecuente
  { clientId: "c1", date: daysAgo(5), total: 50000, currency: "ARS", items: [{ name: "Elfbar TE Watermelon", qty: 2 }] },
  { clientId: "c1", date: daysAgo(15), total: 45000, currency: "ARS", items: [{ name: "Elfbar TE Cherry", qty: 1 }] },
  { clientId: "c1", date: daysAgo(25), total: 60000, currency: "ARS", items: [{ name: "Elfbar TE Mango", qty: 2 }] },
  // Pedro: 1 compra reciente (new)
  { clientId: "c2", date: daysAgo(10), total: 20000, currency: "ARS", items: [{ name: "Geek Pulse", qty: 1 }] },
  // Lucía: 3 compras de marcas variadas (explorer)
  { clientId: "c3", date: daysAgo(20), total: 22000, currency: "ARS", items: [{ name: "Elfbar TE A", qty: 1 }] },
  { clientId: "c3", date: daysAgo(50), total: 18000, currency: "ARS", items: [{ name: "Lost Mary BM", qty: 1 }] },
  { clientId: "c3", date: daysAgo(80), total: 21000, currency: "ARS", items: [{ name: "Geek Pulse", qty: 1 }] },
  { clientId: "c3", date: daysAgo(95), total: 19000, currency: "ARS", items: [{ name: "Ignite V300", qty: 1 }] },
  { clientId: "c3", date: daysAgo(110), total: 20000, currency: "ARS", items: [{ name: "Nikbar X", qty: 1 }] },
  // Sofia: dormida hace 60d
  { clientId: "c4", date: daysAgo(60), total: 15000, currency: "ARS", items: [{ name: "Elfbar TE Banana", qty: 1 }] },
  { clientId: "c4", date: daysAgo(120), total: 12000, currency: "ARS", items: [{ name: "Elfbar TE Apple", qty: 1 }] },
];

describe("segmentClient", () => {
  it("marca VIP por tier manual", () => {
    const seg = segmentClient(CLIENTS[0], SALES, { now: NOW });
    expect(seg.segments).toContain("vip");
  });

  it("detecta cliente frecuente (gap <=14d)", () => {
    const seg = segmentClient(CLIENTS[0], SALES, { now: NOW });
    expect(seg.segments).toContain("frequent");
  });

  it("marca como 'new' al primer comprador reciente", () => {
    const seg = segmentClient(CLIENTS[1], SALES, { now: NOW });
    expect(seg.segments).toContain("new");
  });

  it("detecta explorer cuando hay 5+ marcas distintas", () => {
    const seg = segmentClient(CLIENTS[2], SALES, { now: NOW });
    expect(seg.segments).toContain("explorer");
  });

  it("detecta dormant cuando lastDays > 30", () => {
    const seg = segmentClient(CLIENTS[3], SALES, { now: NOW });
    expect(seg.segments).toContain("dormant");
  });

  it("identifica favoriteBrand del cliente", () => {
    const seg = segmentClient(CLIENTS[0], SALES, { now: NOW });
    expect(seg.favoriteBrand).toBe("Elfbar");
  });

  it("cliente sin compras = new_lead", () => {
    const seg = segmentClient({ id: "x", name: "Nadie" }, [], { now: NOW });
    expect(seg.primarySegment).toBe("new_lead");
    expect(seg.segments).toEqual(["new_lead"]);
  });

  it("handles null client", () => {
    const seg = segmentClient(null, [], {});
    expect(seg.primarySegment).toBe("unknown");
  });
});

describe("segmentAllClients", () => {
  it("devuelve mapa indexado por cliente id", () => {
    const map = segmentAllClients(CLIENTS, SALES, { now: NOW });
    expect(Object.keys(map)).toHaveLength(4);
    expect(map.c1.segments).toContain("vip");
    expect(map.c3.segments).toContain("explorer");
  });

  it("p75 de ticket aplica el flag high_ticket consistentemente", () => {
    const map = segmentAllClients(CLIENTS, SALES, { now: NOW });
    // Juan tiene tickets ~50k, los demás <22k → Juan debería ser high_ticket
    expect(map.c1.segments).toContain("high_ticket");
  });
});

describe("SEGMENT_LABELS", () => {
  it("hay label para cada segmento posible", () => {
    ["vip", "high_ticket", "frequent", "occasional", "dormant", "new", "fanatic", "explorer", "new_lead", "regular", "unknown"]
      .forEach(s => {
        expect(SEGMENT_LABELS[s]).toBeTruthy();
        expect(SEGMENT_LABELS[s].label).toBeTruthy();
      });
  });
});
