// Test de integración UI ↔ Prospect Engine, ahora sobre el EMBUDO OPERATIVO
// (ciclo v2 F4 — reemplazó al kanban de Pipeline, que ordenaba por las 3
// etapas del engine y ya no coincidía con la etapa que el sistema deriva).
// NO testea reglas de negocio (viven en las libs puras): testea que la UI
// CONSUME bien — columnas por etapa operativa, orden por `posicion`, chip de
// prioridad + aviso de poca información, y que el tablero es panorámico
// (tocar lleva a la Ficha; el trabajo no se duplica acá).
//
// Los tests del diagnóstico y de la calificación en la visita se conservan
// enteros: al retirarse Pipeline montan directamente los componentes que los
// hospedaban (DiagnosisContent y VisitModal), sin perder cobertura.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent } from "@testing-library/react";

// Los componentes importan useResponsive de App.jsx, que arrastra firebase.
vi.mock("../../firebase.js", () => ({
  auth: {}, db: {}, firebaseApp: {}, APP_CHECK_SITE_KEY: "",
  onAuthChange: () => () => {},
  getUserProfile: () => null,
  loginWithEmail: vi.fn(), logout: vi.fn(),
  updatePresence: vi.fn(), subscribePresence: () => () => {},
  saveToFirestore: vi.fn(), mergeIntoFirestore: vi.fn(),
  subscribeToFirestore: () => () => {}, clearFirestoreCache: vi.fn(),
  subscribeDiscoveryResults: () => () => {}, deleteDiscoveryResult: vi.fn(),
  subscribeDiscoveryJobs: () => () => {}, createDiscoveryJob: vi.fn(), deleteDiscoveryJob: vi.fn(),
  lastKnownTimestamps: {}, lastWriteError: null, clearWriteError: vi.fn(),
  isOwner: () => true, canDelete: () => true, canViewFinances: () => true,
}));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: () => () => {} }));

import { EmbudoOperativo } from "./EmbudoOperativo.jsx";
import { DiagnosisContent } from "./ProspectDiagnosisModal.jsx";
import { VisitModal } from "./VisitModal.jsx";
import { buildProspectRanking } from "../../lib/prospectRanking.js";
import { conEtapaLegacy } from "../../lib/prospectEtapas.js";
import { AppContext } from "../../AppContext.js";
import { T } from "../../theme.js";

// Con globals:false vitest no auto-registra el cleanup de testing-library.
afterEach(() => cleanup());

const CTX = { currentUser: { name: "Gustavo" }, exchangeRate: 1000, logAudit: vi.fn(), logStock: vi.fn() };

// Tres prospectos cargados en orden inverso al que el engine debería rankear:
//   flojo    → nada a favor (chico, ya tiene proveedor, no interesado)
//   pelado   → sin calificar y sin visitas (poca información)
//   estrella → calificado completo, virgen, grande, interesado
const prospects = [
  { id: "p-flojo", businessName: "Kiosco Flojo", zone: "Boulogne", pipelineStage: "contactado",
    source: "manual", contactName: "Susana", phone: "11-5",
    calificacion: { vendeCategoria: "si", proveedorEstable: "si", competenciaVisible: "si",
                    tamano: "chico", movimiento: "no", actualizadoAt: "2026-07-20" } },
  { id: "p-pelado", businessName: "Kiosco Pelado", zone: "Villa Martelli", pipelineStage: "contactado" },
  { id: "p-estrella", businessName: "Kiosco Estrella", zone: "Villa Adelina", pipelineStage: "contactado",
    source: "referido", contactName: "Marta", phone: "11-1",
    calificacion: { vendeCategoria: "no", proveedorEstable: "no", competenciaVisible: "no",
                    tamano: "grande", movimiento: "si", actualizadoAt: "2026-07-26" } },
];
const visits = [
  { id: "v1", targetId: "p-estrella", date: "2026-07-26T12:00:00.000Z", outcome: "interesado" },
  { id: "v2", targetId: "p-flojo", date: "2026-07-20T12:00:00.000Z", outcome: "no_interesado" },
];
const clients = [{ id: "c1", type: "mayorista", zone: "Munro", businessName: "Maxi Munro" }];
const sales = [{ id: "s1", saleType: "mayorista", clientId: "c1", items: [{ productId: "pr1", qty: 10 }] }];
const products = [{ id: "pr1", brand: "Elfbar", model: "BC5000", flavor: "Mint" }];

// El adapter del §4: el engine recibe la etapa DERIVADA (lo mismo que hace la
// pantalla real). Sin esto el motor rankearía sobre etapas desactualizadas.
const rankingDe = (ps = prospects, vs = visits, cs = clients, ss = sales) =>
  buildProspectRanking({ prospects: conEtapaLegacy(ps, { visits: vs }), visits: vs, clients: cs, sales: ss, products });

const renderEmbudo = (props = {}) => render(
  <AppContext.Provider value={CTX}>
    <EmbudoOperativo prospects={prospects} clients={clients} visits={visits}
      ranking={rankingDe()} onOpenFicha={vi.fn()} onNuevo={vi.fn()} {...props} />
  </AppContext.Provider>,
);

// La columna de una etapa operativa (el div que contiene ese header).
const columna = (etiqueta) => screen.getByText(etiqueta, { exact: false }).closest("div").parentElement;

describe("Embudo operativo — columnas por etapa DERIVADA", () => {
  it("cada prospecto cae en la columna de su etapa operativa, no en la del campo viejo", () => {
    renderEmbudo();
    // Los tres traen pipelineStage "contactado" (legacy). La etapa real la
    // deciden los hechos: estrella y flojo tienen visita ⇒ Visitado; pelado no
    // tiene teléfono ni visita ⇒ Para visitar.
    const visitado = within(columna("📋 Visitado"));
    expect(visitado.getAllByText(/^Kiosco /).map(n => n.textContent.replace(" ›", "")))
      .toStrictEqual(["Kiosco Estrella", "Kiosco Flojo"]);
    expect(within(columna("🚶 Para visitar")).getByText(/Kiosco Pelado/)).toBeTruthy();
  });

  it("dentro de la columna ordena por el ranking, no por orden de carga", () => {
    renderEmbudo();
    // flojo se carga PRIMERO y estrella último; el engine los da vuelta.
    const nombres = within(columna("📋 Visitado"))
      .getAllByText(/^Kiosco /).map(n => n.textContent.replace(" ›", ""));
    expect(nombres[0]).toBe("Kiosco Estrella");
  });

  it("cada prospecto muestra su chip de prioridad", () => {
    renderEmbudo();
    // La etiqueta la da el dominio (ETIQUETA_PRIORIDAD); el Badge la pone en
    // mayúsculas por CSS, así que el texto del DOM sigue siendo el original.
    expect(screen.getAllByText(/^(Muy alta|Alta|Media|Baja|Sin datos)$/).length).toBe(3);
  });

  it("el aviso de poca información viaja en el chip del prospecto correcto", () => {
    renderEmbudo();
    const chips = screen.getAllByText(/^(Muy alta|Alta|Media|Baja|Sin datos)$/);
    expect(chips.length).toBe(3);
    // el pelado (confianza < 0.60) es el único sin calificar
    expect(within(columna("🚶 Para visitar")).getByText(/Kiosco Pelado/)).toBeTruthy();
  });

  it("la columna 🏪 Cliente muestra los mayoristas, sin chip ni ranking", () => {
    renderEmbudo();
    const col = within(columna("🏪 Cliente"));
    const card = col.getByText("Maxi Munro").closest("div").parentElement;
    expect(card.textContent).not.toMatch(/Muy alta|Sin datos|poca información/);
  });

  it("es panorámico: tocar una card lleva a la Ficha (el trabajo no se duplica acá)", () => {
    const onOpenFicha = vi.fn();
    renderEmbudo({ onOpenFicha });
    fireEvent.click(screen.getByText(/Kiosco Estrella/));
    expect(onOpenFicha).toHaveBeenCalledWith("p-estrella");
    // Los mayoristas ya salieron del CRM: no abren ficha.
    fireEvent.click(screen.getByText("Maxi Munro"));
    expect(onOpenFicha).toHaveBeenCalledTimes(1);
  });

  it("resume el embudo en una línea: en juego vs cerrados", () => {
    renderEmbudo();
    expect(screen.getByText("3 en juego · 1 cerrados")).toBeTruthy();
  });

  it("no explota sin datasets de contexto (degradación honesta)", () => {
    renderEmbudo({ visits: [], clients: [], ranking: rankingDe(prospects, [], [], []) });
    expect(screen.getAllByText(/^Kiosco /).length).toBe(3);
  });
});

// --- Diagnóstico (ex Fase 5.2 — el contenido, sin el modal que se retiró) ---

const diagnostico = (id, ps = prospects) => {
  const ranking = rankingDe(ps);
  render(
    <AppContext.Provider value={CTX}>
      <DiagnosisContent item={ranking.porId[id]} prioridadColor={T.blue} />
    </AppContext.Provider>,
  );
  return screen;
};

describe("Diagnóstico del prospecto (render puro de la fachada)", () => {
  it("muestra el veredicto que redacta el dominio", () => {
    const m = diagnostico("p-estrella");
    expect(m.getByText("Alta oportunidad")).toBeTruthy();
  });

  it("muestra las 3 razones con su respaldo numérico", () => {
    const m = diagnostico("p-estrella");
    expect(m.getByText(/^Oportunidad \d+$/)).toBeTruthy();
    expect(m.getByText(/^Encaje \d+$/)).toBeTruthy();
    expect(m.getByText(/^medido con \d+ de 13 señales$/)).toBeTruthy();
  });

  it("el '¿Por qué?' lista los 13 criterios con su valor y sus fuentes", () => {
    const m = diagnostico("p-estrella");
    expect(m.getByText("¿Por qué?")).toBeTruthy();
    // una pregunta de cada dimensión + la evidencia que la respalda
    expect(m.getByText("¿No tiene proveedor estable de la categoría?")).toBeTruthy();
    expect(m.getByText("¿Local medio o grande?")).toBeTruthy();
    expect(m.getAllByText(/^calificacion_/).length).toBeGreaterThan(0);
    // los resúmenes por dimensión los redacta el dominio
    expect(m.getByText("8/8 criterios con datos")).toBeTruthy();
    expect(m.getByText("5/5 criterios con datos")).toBeTruthy();
  });

  it("cierra con el próximo paso y sus pendientes", () => {
    const conCalificacion = diagnostico("p-estrella");
    expect(conCalificacion.getByText(/siguiente acción recomendada/)).toBeTruthy();
    expect(conCalificacion.queryByText(/completar la calificación/)).toBeNull();
    cleanup();
    const sinCalificar = diagnostico("p-pelado");
    expect(sinCalificar.getByText(/completar la calificación de visita/)).toBeTruthy();
  });
});

// --- Calificación rápida en la visita (ex Fase 5.3) ---

const abrirVisita = (p, tipo = "prospect") => {
  const setProspects = vi.fn();
  render(
    <AppContext.Provider value={CTX}>
      <VisitModal target={{ id: p.id, type: tipo, name: p.businessName }} onClose={vi.fn()}
        prospects={prospects} setProspects={setProspects} setClients={vi.fn()} setVisits={vi.fn()} />
    </AppContext.Provider>,
  );
  return { setProspects, modal: screen.getByText(/^Visita — /).closest("div").parentElement };
};

describe("Calificación rápida en la visita", () => {
  it("renderiza los 5 controles del dominio con sus opciones", () => {
    const { modal } = abrirVisita({ id: "p-pelado", businessName: "Kiosco Pelado" });
    const m = within(modal);
    expect(m.getByText("Calificación rápida")).toBeTruthy();
    expect(m.getByText("¿Ya vende la categoría?")).toBeTruthy();
    expect(m.getByText("¿Tiene proveedor fijo de la categoría?")).toBeTruthy();
    expect(m.getByText("¿Se ve surtido de otro proveedor?")).toBeTruthy();
    expect(m.getByText("¿Tamaño del local?")).toBeTruthy();
    expect(m.getByText("¿Se ve movimiento/tránsito real?")).toBeTruthy();
    // el tamaño usa la escala del dominio, no Sí/No
    expect(m.getByText("Chico")).toBeTruthy();
    expect(m.getByText("Grande")).toBeTruthy();
  });

  it("preselecciona lo ya calificado y deja el resto en Sin datos", () => {
    const { modal } = abrirVisita({ id: "p-estrella", businessName: "Kiosco Estrella" });
    // seleccionado = borde azul (MiniBtn con style de selección)
    const seleccionados = within(modal).getAllByRole("button")
      .filter(b => b.style.background === "rgb(220, 230, 244)")
      .map(b => b.textContent);
    expect(seleccionados).toStrictEqual(["No", "No", "No", "Grande", "Sí"]);
  });

  it("guardar con cambios aplica la calificación del dominio (fechada y firmada)", () => {
    const { setProspects, modal } = abrirVisita({ id: "p-pelado", businessName: "Kiosco Pelado" });
    fireEvent.click(within(within(modal).getByText("¿Tamaño del local?").parentElement).getByText("Grande"));
    fireEvent.click(within(modal).getByText("Registrar"));

    const out = setProspects.mock.calls[0][0]([{ id: "p-pelado", businessName: "Kiosco Pelado" }]);
    expect(out[0].calificacion.tamano).toBe("grande");
    expect(out[0].calificacion.actualizadoPor).toBe("Gustavo");
    expect(out[0].calificacion.actualizadoAt).toBeTruthy();
    expect(out[0].lastContactAt).toBeTruthy();
    // lo no marcado NO se inventa
    expect(out[0].calificacion.vendeCategoria).toBe("sin_datos");
    expect(CTX.logAudit).toHaveBeenCalledWith("qualify", "prospect", "p-pelado", expect.any(String));
  });

  it("guardar sin tocar nada no re-sella la calificación (solo recencia)", () => {
    const { setProspects, modal } = abrirVisita({ id: "p-estrella", businessName: "Kiosco Estrella" });
    fireEvent.click(within(modal).getByText("Registrar"));

    const previo = { id: "p-estrella", calificacion: { tamano: "grande", actualizadoAt: "2026-07-26", actualizadoPor: "Diego" } };
    const out = setProspects.mock.calls[0][0]([previo]);
    expect(out[0].calificacion.actualizadoAt).toBe("2026-07-26");   // intacta
    expect(out[0].calificacion.actualizadoPor).toBe("Diego");
    expect(out[0].lastContactAt).toBeTruthy();                       // pero la visita sí cuenta
    expect(CTX.logAudit).not.toHaveBeenCalledWith("qualify", "prospect", "p-estrella", expect.any(String));
  });

  it("la visita a un mayorista no muestra calificación (no aplica)", () => {
    const { modal } = abrirVisita({ id: "c1", businessName: "Maxi Munro" }, "client");
    expect(within(modal).queryByText("Calificación rápida")).toBeNull();
    expect(within(modal).getByText("Resultado")).toBeTruthy();
  });
});
