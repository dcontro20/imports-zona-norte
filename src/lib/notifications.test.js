import { describe, it, expect } from "vitest";
import { parseTime, msUntilTodayTime } from "./notifications.js";

describe("parseTime", () => {
  it("parsea HH:MM", () => {
    expect(parseTime("12:30")).toEqual({ hours: 12, minutes: 30 });
    expect(parseTime("09:05")).toEqual({ hours: 9, minutes: 5 });
  });
  it("default 12:00 si entrada inválida", () => {
    expect(parseTime("")).toEqual({ hours: 12, minutes: 0 });
    expect(parseTime(null)).toEqual({ hours: 12, minutes: 0 });
    expect(parseTime("xyz")).toEqual({ hours: 12, minutes: 0 });
  });
  it("clamp hours 0-23 y minutes 0-59", () => {
    expect(parseTime("25:75")).toEqual({ hours: 23, minutes: 59 });
    expect(parseTime("-1:-1")).toEqual({ hours: 0, minutes: 0 });
  });
});

describe("msUntilTodayTime", () => {
  it("devuelve ms positivos si la hora está en el futuro", () => {
    const now = new Date("2026-06-10T08:00:00");
    const ms = msUntilTodayTime("12:00", now);
    expect(ms).toBe(4 * 60 * 60 * 1000); // 4 horas
  });

  it("devuelve null si la hora ya pasó hoy", () => {
    const now = new Date("2026-06-10T15:00:00");
    expect(msUntilTodayTime("12:00", now)).toBeNull();
  });

  it("devuelve null si la hora es exactamente ahora", () => {
    const now = new Date("2026-06-10T12:00:00");
    expect(msUntilTodayTime("12:00", now)).toBeNull();
  });

  it("maneja minutos correctamente", () => {
    const now = new Date("2026-06-10T11:30:00");
    const ms = msUntilTodayTime("12:00", now);
    expect(ms).toBe(30 * 60 * 1000);
  });
});
