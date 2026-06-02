import { describe, it, expect } from "vitest";
import { weeklyCalendar, todaySuggestions, isWeekend, nextFitDay } from "./offerCalendar.js";

describe("weeklyCalendar", () => {
  it("devuelve 7 días empezando en lunes", () => {
    const week = weeklyCalendar({ now: new Date("2026-06-03T12:00:00") }); // miércoles
    expect(week).toHaveLength(7);
    expect(week[0].dayName).toBe("Lunes");
    expect(week[6].dayName).toBe("Domingo");
  });

  it("marca el día actual como isToday", () => {
    const week = weeklyCalendar({ now: new Date("2026-06-03T12:00:00") });
    const today = week.find(d => d.isToday);
    expect(today).toBeTruthy();
    expect(today.dayName).toBe("Miércoles");
  });

  it("cada día tiene sugerencias (o lista vacía)", () => {
    const week = weeklyCalendar();
    week.forEach(d => {
      expect(Array.isArray(d.suggestions)).toBe(true);
    });
  });

  it("viernes tiene sugerencia para grupo de fiestas", () => {
    const week = weeklyCalendar({ now: new Date("2026-06-05T12:00:00") }); // viernes
    const friday = week.find(d => d.dayName === "Viernes");
    const hasParty = friday.suggestions.some(s => s.audience === "groupParty");
    expect(hasParty).toBe(true);
  });

  it("lunes tiene sugerencia para grupo de clientes", () => {
    const week = weeklyCalendar({ now: new Date("2026-06-01T12:00:00") }); // lunes
    const monday = week.find(d => d.dayName === "Lunes");
    const hasGroupClients = monday.suggestions.some(s => s.audience === "groupClients");
    expect(hasGroupClients).toBe(true);
  });
});

describe("todaySuggestions", () => {
  it("devuelve solo las sugerencias del día actual", () => {
    const sugs = todaySuggestions({ now: new Date("2026-06-05T12:00:00") }); // viernes
    expect(sugs.length).toBeGreaterThan(0);
    expect(sugs.some(s => s.audience === "groupParty")).toBe(true);
  });
});

describe("isWeekend", () => {
  it("detecta sábado como finde", () => {
    expect(isWeekend(new Date("2026-06-06T12:00:00"))).toBe(true); // sábado
  });
  it("detecta lunes como no finde", () => {
    expect(isWeekend(new Date("2026-06-01T12:00:00"))).toBe(false); // lunes
  });
});

describe("nextFitDay", () => {
  it("encuentra el próximo día con sugerencia para una audiencia", () => {
    // Lunes — el próximo día con groupParty debería ser jueves o viernes
    const next = nextFitDay("groupParty", { now: new Date("2026-06-01T12:00:00") });
    expect(next).toBeTruthy();
    expect(["Jueves", "Viernes", "Sábado"]).toContain(next.dayName);
  });
});
