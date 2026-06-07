import { describe, it, expect } from "vitest";
import { calcMonthGoalProgress } from "./dashboardGoal.js";

const RATE = 1000;
const NOW = new Date("2026-06-15T12:00:00"); // junio, día 15 (mitad del mes)

const SALES = [
  { id: "s1", date: "2026-06-01T10:00", total: 50000, currency: "ARS" },
  { id: "s2", date: "2026-06-10T10:00", total: 30000, currency: "ARS" },
  { id: "s3", date: "2026-06-15T10:00", total: 20, currency: "USD", exchangeRate: 1000 },
  { id: "s4", date: "2026-05-30T10:00", total: 100000, currency: "ARS" }, // mes anterior, no cuenta
  { id: "s5", date: "2026-06-08T10:00", total: 99999, currency: "ARS", isDeleted: true }, // borrada
];

describe("calcMonthGoalProgress", () => {
  it("devuelve null si no hay meta configurada", () => {
    expect(calcMonthGoalProgress(SALES, 0, RATE, NOW)).toBeNull();
    expect(calcMonthGoalProgress(SALES, null, RATE, NOW)).toBeNull();
  });

  it("suma ventas del mes actual ignorando otros meses y borradas", () => {
    // 50000 + 30000 + 20*1000 = 100000
    const r = calcMonthGoalProgress(SALES, 500000, RATE, NOW);
    expect(r.revenueARS).toBe(100000);
  });

  it("calcula pct correctamente", () => {
    const r = calcMonthGoalProgress(SALES, 500000, RATE, NOW);
    expect(r.pct).toBe(20); // 100k de 500k
  });

  it("expectedByNow prorratea por días transcurridos", () => {
    // Día 15 de junio (30 días) → expected = 500k * 15/30 = 250k
    const r = calcMonthGoalProgress(SALES, 500000, RATE, NOW);
    expect(r.expectedByNowARS).toBe(250000);
  });

  it("onTrack=false si revenue < expected", () => {
    // 100k revenue vs 250k expected
    const r = calcMonthGoalProgress(SALES, 500000, RATE, NOW);
    expect(r.onTrack).toBe(false);
  });

  it("onTrack=true cuando va bien", () => {
    // Si la meta es bajita (50k), ya la pasamos
    const r = calcMonthGoalProgress(SALES, 50000, RATE, NOW);
    expect(r.onTrack).toBe(true);
    expect(r.pct).toBeGreaterThan(100);
  });

  it("calcula daysRemaining + dailyAvg + dailyNeeded", () => {
    const r = calcMonthGoalProgress(SALES, 500000, RATE, NOW);
    expect(r.daysRemaining).toBe(15); // junio tiene 30, hoy es 15
    expect(r.dailyAvg).toBeCloseTo(100000 / 15);
    expect(r.dailyNeeded).toBeCloseTo((500000 - 100000) / 15);
  });

  it("handles ventas vacías", () => {
    const r = calcMonthGoalProgress([], 500000, RATE, NOW);
    expect(r.revenueARS).toBe(0);
    expect(r.pct).toBe(0);
  });
});
