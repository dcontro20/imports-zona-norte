import { describe, it, expect, beforeEach } from "vitest";
import { reportError, getStoredErrors, clearStoredErrors, errorStats } from "./errorReporter.js";

describe("errorReporter", () => {
  beforeEach(() => {
    clearStoredErrors();
  });

  it("reportError almacena entry con campos esperados", () => {
    const entry = reportError(new Error("Test error"), { user: "Diego" });
    expect(entry.message).toBe("Test error");
    expect(entry.timestamp).toBeTruthy();
    expect(entry.context.user).toBe("Diego");
  });

  it("reportError persiste en localStorage", () => {
    reportError(new Error("Err 1"));
    reportError(new Error("Err 2"));
    const stored = getStoredErrors();
    expect(stored).toHaveLength(2);
    expect(stored[0].message).toBe("Err 1");
  });

  it("acepta string como error", () => {
    const e = reportError("Simple message");
    expect(e.message).toBe("Simple message");
  });

  it("errorStats cuenta errores totales y de últimos 24h", () => {
    reportError(new Error("E1"));
    reportError(new Error("E2"));
    reportError(new Error("E1")); // mismo mensaje
    const s = errorStats();
    expect(s.total).toBe(3);
    expect(s.last24h).toBe(3);
    expect(s.topMessages[0].msg).toBe("E1");
    expect(s.topMessages[0].count).toBe(2);
  });

  it("clearStoredErrors limpia todo", () => {
    reportError(new Error("test"));
    clearStoredErrors();
    expect(getStoredErrors()).toEqual([]);
  });
});
