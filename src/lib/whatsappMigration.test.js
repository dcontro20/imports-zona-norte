// whatsappMigration.test.js — lo que se blinda acá: idempotencia (la segunda
// corrida no escribe), re-derivación (phone editado ⇒ el campo persistido se
// corrige solo en la próxima carga) y la semántica sin-teléfono ≠ inválido.
import { describe, it, expect } from "vitest";
import { migrarTelefonosWa, derivarTelefonoWa } from "./whatsappMigration.js";

const base = (extra = {}) => ({ id: "p-1", businessName: "Kiosco Golden", zone: "Martínez", ...extra });

describe("derivarTelefonoWa", () => {
  it("teléfono válido → telefonoWa 549, no inválido", () => {
    expect(derivarTelefonoWa(base({ phone: "011 2363-1422" })))
      .toEqual({ telefonoWa: "5491123631422", telefonoInvalido: false });
  });

  it("teléfono presente que no normaliza → inválido", () => {
    expect(derivarTelefonoWa(base({ phone: "4321-1000" })))
      .toEqual({ telefonoWa: null, telefonoInvalido: true });
  });

  it("sin teléfono NO es inválido (es otra cola)", () => {
    expect(derivarTelefonoWa(base({ phone: "" })))
      .toEqual({ telefonoWa: null, telefonoInvalido: false });
    expect(derivarTelefonoWa(base())).toEqual({ telefonoWa: null, telefonoInvalido: false });
  });
});

describe("migrarTelefonosWa", () => {
  it("estampa válidos e inválidos; a los sin-teléfono no les mete campos", () => {
    const { prospects, didChange, counts } = migrarTelefonosWa([
      base({ id: "a", phone: "011 2363-1422" }),
      base({ id: "b", phone: "4321-1000" }),
      base({ id: "c" }),
    ]);
    expect(didChange).toBe(true);
    expect(prospects[0]).toMatchObject({ telefonoWa: "5491123631422", telefonoInvalido: false });
    expect(prospects[1]).toMatchObject({ telefonoWa: null, telefonoInvalido: true });
    expect("telefonoWa" in prospects[2]).toBe(false); // sin ruido de campos
    expect(counts).toEqual({ total: 3, validos: 1, invalidos: 1, sinTelefono: 1, cambiados: 2 });
  });

  it("idempotente: la segunda corrida no cambia nada (mismas referencias)", () => {
    const primera = migrarTelefonosWa([
      base({ id: "a", phone: "011 2363-1422" }),
      base({ id: "b", phone: "4321-1000" }),
      base({ id: "c" }),
    ]);
    const segunda = migrarTelefonosWa(primera.prospects);
    expect(segunda.didChange).toBe(false);
    expect(segunda.counts.cambiados).toBe(0);
    expect(segunda.prospects).toBe(primera.prospects); // ni siquiera un array nuevo
  });

  it("re-deriva si phone cambió después de estampado (el persistido no queda stale)", () => {
    const estampado = migrarTelefonosWa([base({ id: "a", phone: "011 2363-1422" })]).prospects[0];
    // Gustavo corrige el número en la ficha:
    const editado = { ...estampado, phone: "11 2709-0000" };
    const { prospects, didChange } = migrarTelefonosWa([editado]);
    expect(didChange).toBe(true);
    expect(prospects[0].telefonoWa).toBe("5491127090000");
  });

  it("teléfono arreglado limpia telefonoInvalido; teléfono borrado limpia telefonoWa", () => {
    const invalido = migrarTelefonosWa([base({ id: "a", phone: "4321-1000" })]).prospects[0];
    const arreglado = migrarTelefonosWa([{ ...invalido, phone: "0221 15 456-7890" }]).prospects[0];
    expect(arreglado).toMatchObject({ telefonoWa: "5492214567890", telefonoInvalido: false });

    const valido = migrarTelefonosWa([base({ id: "b", phone: "011 2363-1422" })]).prospects[0];
    const sinTel = migrarTelefonosWa([{ ...valido, phone: "" }]).prospects[0];
    expect(sinTel).toMatchObject({ telefonoWa: null, telefonoInvalido: false });
  });

  it("preserva el resto de los campos y las referencias de los no tocados", () => {
    const intacto = base({ id: "c" });
    const conHecho = base({ id: "a", phone: "011 2363-1422", analizadoAt: "2026-08-01T10:00:00Z", isDeleted: true });
    const { prospects } = migrarTelefonosWa([conHecho, intacto, null]);
    expect(prospects[0]).toMatchObject({ analizadoAt: "2026-08-01T10:00:00Z", isDeleted: true });
    expect(prospects[1]).toBe(intacto); // sin teléfono: misma referencia
    expect(prospects[2]).toBe(null);    // huecos preservados
  });

  it("los soft-borrados también se estampan (restaurar devuelve data al día)", () => {
    const { prospects } = migrarTelefonosWa([base({ id: "a", phone: "011 2363-1422", isDeleted: true })]);
    expect(prospects[0].telefonoWa).toBe("5491123631422");
  });

  it("array vacío / sin argumento → no-op", () => {
    expect(migrarTelefonosWa([]).didChange).toBe(false);
    expect(migrarTelefonosWa().didChange).toBe(false);
  });
});
