// prospectActions.test.js — las acciones de gestión del prospecto como ÚNICA
// fuente (kanban + Ficha). El foco está en `descartar`, el mecanismo que
// heredó del modal de revisión el descarte CON MEMORIA (contrato §7) cuando
// la auto-ingesta (ciclo v2, F2) hizo que los descubiertos entren solos.
import { describe, it, expect, vi } from "vitest";
import { makeProspectActions } from "./prospectActions.js";

const prospecto = (over = {}) => ({
  id: "p-1", businessName: "Kiosco Golden", address: "El Salvador 4813, CABA",
  phone: "+54 11 4831-2200", zone: "Palermo", source: "descubrimiento",
  placeId: "PID_GOLDEN", pipelineStage: "prospecto", ingresoAutomatico: true, ...over,
});

// Corre la acción capturando lo que le pasa a cada colección.
function correr(p, extra = {}) {
  const estado = { prospects: [p], suprimidos: [] };
  const acciones = makeProspectActions({
    setProspects: (fn) => { estado.prospects = fn(estado.prospects); },
    setClients: vi.fn(),
    setDiscoverySuppressed: (fn) => { estado.suprimidos = fn(estado.suprimidos); },
    logAudit: estado.logAudit = vi.fn(),
    currentUser: { name: "Diego" },
    ...extra,
  });
  return { acciones, estado };
}

describe("descartar — el 'no me sirve' que RECUERDA", () => {
  it("suprime la identidad, soft-borra el prospecto y firma el descarte", () => {
    const { acciones, estado } = correr(prospecto());
    expect(acciones.descartar(prospecto())).toBe(true);

    expect(estado.suprimidos).toHaveLength(1);
    expect(estado.suprimidos[0].nombre).toBe("Kiosco Golden");
    expect(estado.suprimidos[0].claves).toContain("pid:PID_GOLDEN");
    expect(estado.suprimidos[0].por).toBe("Diego");

    const p = estado.prospects[0];
    expect(p.isDeleted).toBe(true);
    expect(p.descartadoAt).toBe(p.deletedAt);
    expect(estado.logAudit).toHaveBeenCalledWith("discard", "prospect", "p-1", expect.stringContaining("con memoria"));
  });

  it("sin identidad suficiente descarta IGUAL pero avisa que no hay memoria (P5)", () => {
    const sinIdentidad = prospecto({ address: "", web: "" });
    const { acciones, estado } = correr(sinIdentidad);
    expect(acciones.descartar(sinIdentidad)).toBe(false);
    expect(estado.suprimidos).toHaveLength(0);
    expect(estado.prospects[0].isDeleted).toBe(true);
    expect(estado.logAudit).toHaveBeenCalledWith("discard", "prospect", "p-1", expect.stringContaining("sin memoria"));
  });

  it("borrar NO recuerda: es Papelera, no descarte (el descubrimiento lo puede volver a traer)", () => {
    const { acciones, estado } = correr(prospecto());
    acciones.borrar(prospecto());
    expect(estado.prospects[0].isDeleted).toBe(true);
    expect(estado.suprimidos).toHaveLength(0);
  });
});

describe("marcarWhatsApp — dato del prospecto, no hecho de etapa (handoff 2026-08-10)", () => {
  it("true estampa tieneWhatsApp sin tocar hechos ni etapas (no mueve de cola)", () => {
    const { acciones, estado } = correr(prospecto());
    const onHecho = vi.fn();
    const conHecho = correr(prospecto(), { onHecho });
    conHecho.acciones.marcarWhatsApp(prospecto(), true);

    const p = conHecho.estado.prospects[0];
    expect(p.tieneWhatsApp).toBe(true);
    expect(p.mensajeEnviadoAt).toBeUndefined(); // NO registra contacto
    expect(onHecho).not.toHaveBeenCalled();     // el true no avisa: lo cuenta "mensaje enviado"
    expect(conHecho.estado.logAudit).toHaveBeenCalledWith(
      "whatsapp", "prospect", "p-1", expect.stringContaining("confirmado"));
    void acciones; void estado;
  });

  it("false estampa tieneWhatsApp=false, avisa 'sin_whatsapp' y NO registra contacto", () => {
    const onHecho = vi.fn();
    const { acciones, estado } = correr(prospecto(), { onHecho });
    acciones.marcarWhatsApp(prospecto(), false);

    const p = estado.prospects[0];
    expect(p.tieneWhatsApp).toBe(false);
    expect(p.mensajeEnviadoAt).toBeUndefined();
    expect(p.isDeleted).toBeUndefined(); // sigue existiendo, queda en su cola
    expect(onHecho).toHaveBeenCalledWith(expect.objectContaining({ tieneWhatsApp: false }), "sin_whatsapp");
    expect(estado.logAudit).toHaveBeenCalledWith(
      "whatsapp", "prospect", "p-1", expect.stringContaining("no está en WhatsApp"));
  });
});
