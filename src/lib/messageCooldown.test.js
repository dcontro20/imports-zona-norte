import { describe, it, expect } from "vitest";
import { daysSinceLastMessage, messagesInLastDays, checkCooldown } from "./messageCooldown.js";

const NOW = new Date("2026-06-15T12:00:00");
const daysAgoISO = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

function offerEntry(audience, clientId, daysAgo, id = `a-${daysAgo}`) {
  return {
    id, entityType: "offer", action: "create",
    timestamp: daysAgoISO(daysAgo),
    details: { audience, clientId },
  };
}

describe("daysSinceLastMessage", () => {
  it("devuelve null si no hay mensajes a ese destinatario", () => {
    expect(daysSinceLastMessage([], { audience: "individual", clientId: "c1", now: NOW })).toBeNull();
  });

  it("calcula días desde el último mensaje individual", () => {
    const log = [offerEntry("individual", "c1", 3), offerEntry("individual", "c1", 10)];
    expect(daysSinceLastMessage(log, { audience: "individual", clientId: "c1", now: NOW })).toBe(3);
  });

  it("filtra correctamente por clientId", () => {
    const log = [offerEntry("individual", "c2", 1), offerEntry("individual", "c1", 10)];
    expect(daysSinceLastMessage(log, { audience: "individual", clientId: "c1", now: NOW })).toBe(10);
  });
});

describe("messagesInLastDays", () => {
  it("cuenta solo dentro de la ventana", () => {
    const log = [
      offerEntry("groupClients", null, 2),
      offerEntry("groupClients", null, 5),
      offerEntry("groupClients", null, 10), // fuera de los 7 días
    ];
    expect(messagesInLastDays(log, { audience: "groupClients", days: 7, now: NOW })).toBe(2);
  });
});

describe("checkCooldown", () => {
  it("individual: bloquea si último mensaje fue hace <4d", () => {
    const log = [offerEntry("individual", "c1", 2)];
    const result = checkCooldown(log, { audience: "individual", clientId: "c1", now: NOW });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("individual_cooldown");
    expect(result.warning).toMatch(/2d/);
  });

  it("individual: ok si pasaron 5+ días", () => {
    const log = [offerEntry("individual", "c1", 6)];
    const result = checkCooldown(log, { audience: "individual", clientId: "c1", now: NOW });
    expect(result.ok).toBe(true);
  });

  it("individual: ok si nunca le mandaste antes", () => {
    expect(checkCooldown([], { audience: "individual", clientId: "c1", now: NOW }).ok).toBe(true);
  });

  it("groupClients: bloquea si ya mandaste 3 esta semana", () => {
    const log = [
      offerEntry("groupClients", null, 1, "a"),
      offerEntry("groupClients", null, 3, "b"),
      offerEntry("groupClients", null, 5, "c"),
    ];
    const result = checkCooldown(log, { audience: "groupClients", now: NOW });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("group_quota");
  });

  it("groupClients: warning suave si va por el penúltimo", () => {
    const log = [
      offerEntry("groupClients", null, 1, "a"),
      offerEntry("groupClients", null, 3, "b"),
    ];
    const result = checkCooldown(log, { audience: "groupClients", now: NOW });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("near_quota");
  });

  it("groupParty: bloquea con 2 esta semana (cuota más baja)", () => {
    const log = [
      offerEntry("groupParty", null, 1, "a"),
      offerEntry("groupParty", null, 4, "b"),
    ];
    const result = checkCooldown(log, { audience: "groupParty", now: NOW });
    expect(result.ok).toBe(false);
  });

  it("respeta limits override", () => {
    const log = [offerEntry("individual", "c1", 2)];
    const result = checkCooldown(log, {
      audience: "individual", clientId: "c1", now: NOW,
      limits: { individualCooldownDays: 1 },
    });
    expect(result.ok).toBe(true);
  });
});
