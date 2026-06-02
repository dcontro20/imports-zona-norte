import { describe, it, expect } from "vitest";
import { AUDIENCES, AUDIENCE_LIST, getAudience, getTone, TONES, audienceFitsDay } from "./offerAudiences.js";

describe("AUDIENCES", () => {
  it("tiene las 3 audiencias principales", () => {
    expect(AUDIENCES.individual).toBeTruthy();
    expect(AUDIENCES.groupClients).toBeTruthy();
    expect(AUDIENCES.groupParty).toBeTruthy();
  });

  it("AUDIENCE_LIST tiene 3 items", () => {
    expect(AUDIENCE_LIST).toHaveLength(3);
  });

  it("individual requiere cliente", () => {
    expect(AUDIENCES.individual.needsClient).toBe(true);
  });

  it("groupClients no requiere cliente", () => {
    expect(AUDIENCES.groupClients.needsClient).toBe(false);
  });
});

describe("getAudience", () => {
  it("devuelve la audiencia por key", () => {
    expect(getAudience("individual").key).toBe("individual");
    expect(getAudience("groupClients").key).toBe("groupClients");
  });
  it("fallback a individual si la key no existe", () => {
    expect(getAudience("xxx").key).toBe("individual");
  });
});

describe("TONES", () => {
  it("warm con clientName saluda con nombre", () => {
    expect(TONES.warm.opener({ clientName: "Pedro" })).toMatch(/Pedro/);
  });
  it("warm sin clientName saluda genérico", () => {
    expect(TONES.warm.opener({})).toMatch(/Hola/);
  });
  it("commercial firma IZN", () => {
    expect(TONES.commercial.closer({})).toMatch(/IZN/);
  });
  it("casual menciona finde si weekend", () => {
    expect(TONES.casual.opener({ weekend: true })).toMatch(/finde/);
  });
});

describe("getTone", () => {
  it("matchea tono según audiencia", () => {
    expect(getTone("individual")).toBe(TONES.warm);
    expect(getTone("groupClients")).toBe(TONES.commercial);
    expect(getTone("groupParty")).toBe(TONES.casual);
  });
});

describe("audienceFitsDay", () => {
  it("groupParty solo encaja jueves-sábado", () => {
    expect(audienceFitsDay("groupParty", 4)).toBe(true); // jueves
    expect(audienceFitsDay("groupParty", 5)).toBe(true); // viernes
    expect(audienceFitsDay("groupParty", 6)).toBe(true); // sábado
    expect(audienceFitsDay("groupParty", 1)).toBe(false); // lunes
    expect(audienceFitsDay("groupParty", 3)).toBe(false); // miércoles
  });
  it("individual encaja cualquier día", () => {
    for (let d = 0; d < 7; d++) {
      expect(audienceFitsDay("individual", d)).toBe(true);
    }
  });
});
