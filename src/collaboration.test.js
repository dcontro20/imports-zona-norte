import { describe, it, expect } from "vitest";
import { formatRelative, isPresenceActive, actionIcon, entityLabel, recentActivity } from "./collaboration.js";

describe("formatRelative", () => {
  const now = new Date("2026-06-23T12:00:00").getTime();
  it("recién si < 45s", () => {
    expect(formatRelative("2026-06-23T11:59:30", now)).toBe("recién");
  });
  it("minutos", () => {
    expect(formatRelative("2026-06-23T11:50:00", now)).toBe("hace 10m");
  });
  it("horas", () => {
    expect(formatRelative("2026-06-23T09:00:00", now)).toBe("hace 3h");
  });
  it("ayer", () => {
    expect(formatRelative("2026-06-22T11:00:00", now)).toBe("ayer");
  });
  it("días", () => {
    expect(formatRelative("2026-06-20T12:00:00", now)).toBe("hace 3d");
  });
  it("vacío o inválido", () => {
    expect(formatRelative("", now)).toBe("");
    expect(formatRelative("xyz", now)).toBe("");
    expect(formatRelative(null, now)).toBe("");
  });
});

describe("isPresenceActive", () => {
  const now = new Date("2026-06-23T12:00:00").getTime();
  it("activo si heartbeat < 90s", () => {
    expect(isPresenceActive("2026-06-23T11:59:30", now)).toBe(true);
  });
  it("inactivo si > 90s", () => {
    expect(isPresenceActive("2026-06-23T11:55:00", now)).toBe(false);
  });
  it("inactivo si vacío/inválido", () => {
    expect(isPresenceActive(null, now)).toBe(false);
    expect(isPresenceActive("nope", now)).toBe(false);
  });
});

describe("actionIcon / entityLabel", () => {
  it("mapea acciones conocidas", () => {
    expect(actionIcon("create")).toBe("➕");
    expect(actionIcon("delete")).toBe("🗑️");
    expect(actionIcon("rare")).toBe("•");
  });
  it("mapea entidades", () => {
    expect(entityLabel("sale")).toBe("venta");
    expect(entityLabel("partnerWithdrawal")).toBe("retiro");
    expect(entityLabel("weird")).toBe("weird");
  });
});

describe("recentActivity", () => {
  const log = [
    { action: "create", user: "Diego", entityType: "sale" },
    { action: "login", user: "Gustavo" },
    { action: "update", user: "Sistema", entityType: "product" },
    { action: "delete", user: "Gustavo", entityType: "expense" },
  ];
  it("excluye login y Sistema, respeta limit", () => {
    const r = recentActivity(log, 10);
    expect(r).toHaveLength(2);
    expect(r.map(x => x.user)).toEqual(["Diego", "Gustavo"]);
  });
  it("maneja no-array", () => {
    expect(recentActivity(null)).toEqual([]);
  });
});
