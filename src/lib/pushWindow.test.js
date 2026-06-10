import { describe, it, expect } from "vitest";
import { nowInTZ, dueSlots, WINDOW_MINUTES } from "./pushWindow.js";

describe("nowInTZ", () => {
  it("convierte UTC a hora argentina (UTC-3)", () => {
    // 15:00 UTC = 12:00 ART
    const r = nowInTZ(new Date("2026-06-10T15:00:00Z"));
    expect(r.date).toBe("2026-06-10");
    expect(r.minutes).toBe(12 * 60);
  });

  it("cruza la medianoche correctamente", () => {
    // 02:30 UTC del día 11 = 23:30 ART del día 10
    const r = nowInTZ(new Date("2026-06-11T02:30:00Z"));
    expect(r.date).toBe("2026-06-10");
    expect(r.minutes).toBe(23 * 60 + 30);
  });

  it("medianoche exacta ART no produce hora 24", () => {
    // 03:00 UTC = 00:00 ART
    const r = nowInTZ(new Date("2026-06-11T03:00:00Z"));
    expect(r.date).toBe("2026-06-11");
    expect(r.minutes).toBe(0);
  });
});

describe("dueSlots", () => {
  const config = { noonTime: "12:00", eveningTime: "18:30" };

  it("antes del slot: nada", () => {
    expect(dueSlots(config, 11 * 60 + 59)).toEqual([]);
  });

  it("en el minuto exacto del slot: lo devuelve", () => {
    const due = dueSlots(config, 12 * 60);
    expect(due).toHaveLength(1);
    expect(due[0].slot).toBe("noon");
  });

  it("dentro de la ventana de tolerancia: lo devuelve", () => {
    const due = dueSlots(config, 12 * 60 + WINDOW_MINUTES - 1);
    expect(due.map(d => d.slot)).toEqual(["noon"]);
  });

  it("pasada la ventana: ya no", () => {
    expect(dueSlots(config, 12 * 60 + WINDOW_MINUTES)).toEqual([]);
  });

  it("slot de la tarde independiente del mediodía", () => {
    const due = dueSlots(config, 18 * 60 + 35);
    expect(due.map(d => d.slot)).toEqual(["evening"]);
  });

  it("si los slots se solapan en ventana devuelve ambos", () => {
    const tight = { noonTime: "12:00", eveningTime: "12:10" };
    const due = dueSlots(tight, 12 * 60 + 15);
    expect(due.map(d => d.slot)).toEqual(["noon", "evening"]);
  });

  it("config vacío usa defaults 12:00 y 18:30", () => {
    expect(dueSlots({}, 12 * 60).map(d => d.slot)).toEqual(["noon"]);
    expect(dueSlots({}, 18 * 60 + 30).map(d => d.slot)).toEqual(["evening"]);
  });

  it("cada slot trae title y body listos para mandar", () => {
    const [slot] = dueSlots(config, 12 * 60);
    expect(slot.title).toContain("Mediodía");
    expect(slot.body.length).toBeGreaterThan(10);
  });
});
