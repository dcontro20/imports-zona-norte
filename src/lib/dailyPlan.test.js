import { describe, it, expect } from "vitest";
import { buildDailyPlan, calcMessageStreak } from "./dailyPlan.js";
import { pickWeeklyPromo, weekKey } from "./weeklyPromo.js";

const offerEntry = (isoTimestamp, audience = "groupClients") => ({
  id: `a-${isoTimestamp}`, entityType: "offer", action: "create",
  timestamp: isoTimestamp,
  details: { audience },
});

describe("buildDailyPlan", () => {
  it("todos los días tienen 2 slots de presencia (mediodía + tarde)", () => {
    const plan = buildDailyPlan({ now: new Date("2026-06-08T10:00:00") }); // lunes
    expect(plan.slots).toHaveLength(2);
    expect(plan.slots[0].kind).toBe("presence");
    expect(plan.slots[0].audience).toBe("groupClients");
    expect(plan.slots[1].kind).toBe("presence");
  });

  it("domingo también tiene los 2 slots (presencia diaria sin excepción)", () => {
    const plan = buildDailyPlan({ now: new Date("2026-06-14T10:00:00") }); // domingo
    expect(plan.slots).toHaveLength(2);
    expect(plan.slots[0].kind).toBe("presence");
  });

  it("incluye sugerencia de promo extra del día (opcional)", () => {
    const plan = buildDailyPlan({ now: new Date("2026-06-11T10:00:00") }); // jueves
    expect(plan.promoSuggestion).toBeTruthy();
  });

  it("marca slot mediodía como enviado si hay envío antes de las 16h", () => {
    const auditLog = [offerEntry("2026-06-08T12:30:00")];
    const plan = buildDailyPlan({ auditLog, now: new Date("2026-06-08T15:00:00") });
    expect(plan.slots[0].sent).toBe(true);
    expect(plan.slots[1].sent).toBe(false);
  });

  it("marca slot tarde como enviado si hay envío después de las 16h", () => {
    const auditLog = [offerEntry("2026-06-08T18:45:00")];
    const plan = buildDailyPlan({ auditLog, now: new Date("2026-06-08T20:00:00") });
    expect(plan.slots[0].sent).toBe(false);
    expect(plan.slots[1].sent).toBe(true);
  });

  it("ignora envíos de otros días", () => {
    const auditLog = [offerEntry("2026-06-07T12:00:00")];
    const plan = buildDailyPlan({ auditLog, now: new Date("2026-06-08T15:00:00") });
    expect(plan.slots[0].sent).toBe(false);
    expect(plan.sentCountToday).toBe(0);
  });
});

describe("calcMessageStreak", () => {
  it("0 si nunca mandó", () => {
    const s = calcMessageStreak([], new Date("2026-06-10T12:00:00"));
    expect(s.current).toBe(0);
    expect(s.sentToday).toBe(false);
  });

  it("cuenta días consecutivos hacia atrás", () => {
    const auditLog = [
      offerEntry("2026-06-10T12:00:00"),
      offerEntry("2026-06-09T12:00:00"),
      offerEntry("2026-06-08T12:00:00"),
    ];
    const s = calcMessageStreak(auditLog, new Date("2026-06-10T15:00:00"));
    expect(s.current).toBe(3);
    expect(s.sentToday).toBe(true);
  });

  it("no rompe la racha si hoy todavía no mandó (cuenta desde ayer)", () => {
    const auditLog = [
      offerEntry("2026-06-09T12:00:00"),
      offerEntry("2026-06-08T12:00:00"),
    ];
    const s = calcMessageStreak(auditLog, new Date("2026-06-10T10:00:00"));
    expect(s.current).toBe(2);
    expect(s.sentToday).toBe(false);
  });

  it("racha cortada por un día sin envíos", () => {
    const auditLog = [
      offerEntry("2026-06-10T12:00:00"),
      offerEntry("2026-06-07T12:00:00"), // gap 08 y 09
    ];
    const s = calcMessageStreak(auditLog, new Date("2026-06-10T15:00:00"));
    expect(s.current).toBe(1);
  });

  it("best streak detecta la mejor racha histórica", () => {
    const auditLog = [
      offerEntry("2026-06-01T12:00:00"),
      offerEntry("2026-06-02T12:00:00"),
      offerEntry("2026-06-03T12:00:00"),
      offerEntry("2026-06-04T12:00:00"),
      offerEntry("2026-06-10T12:00:00"),
    ];
    const s = calcMessageStreak(auditLog, new Date("2026-06-10T15:00:00"));
    expect(s.best).toBe(4);
    expect(s.current).toBe(1);
  });
});

describe("pickWeeklyPromo", () => {
  const IDEAS = [
    { id: "liq1", category: "liquidar", impact: { capitalFreedARS: 100000, marginPct: 20 } },
    { id: "pack1", category: "packfiesta", impact: { comboPriceARS: 80000 } },
    { id: "stock1", category: "stocklist", impact: {} }, // NO es promo
    { id: "mix1", category: "mix", impact: { productCount: 4 } },
  ];

  it("elige la de mayor score como main", () => {
    const r = pickWeeklyPromo(IDEAS, { now: new Date("2026-06-10") });
    expect(r.main.id).toBe("liq1"); // 100k × 1.2 = 120k > 80k pack
  });

  it("excluye categorías que no son promo (stocklist)", () => {
    const r = pickWeeklyPromo(IDEAS, { now: new Date("2026-06-10") });
    const allIds = [r.main, ...r.alternatives].map(i => i.id);
    expect(allIds).not.toContain("stock1");
  });

  it("devuelve hasta 2 alternativas", () => {
    const r = pickWeeklyPromo(IDEAS, { now: new Date("2026-06-10") });
    expect(r.alternatives.length).toBeLessThanOrEqual(2);
  });

  it("skipIds permite descartar la principal", () => {
    const r = pickWeeklyPromo(IDEAS, { now: new Date("2026-06-10"), skipIds: ["liq1"] });
    expect(r.main.id).not.toBe("liq1");
  });

  it("main null si no hay promos elegibles", () => {
    const r = pickWeeklyPromo([{ id: "x", category: "stocklist" }], {});
    expect(r.main).toBeNull();
  });
});

describe("weekKey", () => {
  it("misma semana → misma key (lunes a domingo)", () => {
    expect(weekKey(new Date("2026-06-08T10:00:00"))) // lunes
      .toBe(weekKey(new Date("2026-06-14T22:00:00"))); // domingo
  });
  it("semanas distintas → keys distintas", () => {
    expect(weekKey(new Date("2026-06-08")))
      .not.toBe(weekKey(new Date("2026-06-15")));
  });
});
