// Test de integración UI ↔ Prospect Engine (Fase 5.1).
// NO testea reglas de negocio (viven en las libs puras, con sus 114 tests):
// testea que el Pipeline CONSUME bien la fachada — orden de las columnas por
// `posicion` (U2) y chip de prioridad + aviso de poca información (U3).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent } from "@testing-library/react";

// Pipeline importa useResponsive de App.jsx, que arrastra firebase.
vi.mock("../firebase.js", () => ({
  auth: {}, db: {}, firebaseApp: {}, APP_CHECK_SITE_KEY: "",
  onAuthChange: () => () => {},
  getUserProfile: () => null,
  loginWithEmail: vi.fn(), logout: vi.fn(),
  updatePresence: vi.fn(), subscribePresence: () => () => {},
  saveToFirestore: vi.fn(), mergeIntoFirestore: vi.fn(),
  subscribeToFirestore: () => () => {}, clearFirestoreCache: vi.fn(),
  lastKnownTimestamps: {}, lastWriteError: null, clearWriteError: vi.fn(),
  isOwner: () => true, canDelete: () => true, canViewFinances: () => true,
}));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: () => () => {} }));

import { Pipeline } from "./Pipeline.jsx";
import { AppContext } from "../AppContext.js";

// Con globals:false vitest no auto-registra el cleanup de testing-library.
afterEach(() => cleanup());

const CTX = { currentUser: { name: "Gustavo" }, exchangeRate: 1000, logAudit: vi.fn(), logStock: vi.fn() };

// Tres prospectos en la MISMA etapa (contactado), cargados en orden inverso al
// que el engine debería rankear:
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

const renderPipeline = (props = {}) => render(
  <AppContext.Provider value={CTX}>
    <Pipeline prospects={prospects} setProspects={vi.fn()} clients={clients} setClients={vi.fn()}
      visits={visits} setVisits={vi.fn()} products={products} sales={sales} {...props} />
  </AppContext.Provider>,
);

// La columna "Contactado" del kanban (el div que contiene ese header).
const columnaContactado = () => screen.getByText("Contactado").closest("div").parentElement;

describe("Pipeline — consumo del Prospect Engine (U2 + U3)", () => {
  it("U2: las tarjetas se ordenan por el ranking, no por orden de carga", () => {
    renderPipeline();
    // el " ›" es el affordance de "abrir ficha" (Fase 5.2), no parte del nombre
    const nombres = within(columnaContactado())
      .getAllByText(/^Kiosco /).map(n => n.textContent.replace(" ›", ""));
    expect(nombres).toStrictEqual(["Kiosco Estrella", "Kiosco Pelado", "Kiosco Flojo"]);
  });

  it("U3: cada prospecto muestra su chip de prioridad", () => {
    renderPipeline();
    const col = within(columnaContactado());
    // La etiqueta la da el dominio (ETIQUETA_PRIORIDAD); el Badge la pone en
    // mayúsculas por CSS, así que el texto del DOM sigue siendo el original.
    expect(col.getByText("Alta")).toBeTruthy();
    expect(col.getAllByText(/^(Muy alta|Alta|Media|Baja|Sin datos)$/).length).toBe(3);
  });

  it("U3: el aviso de poca información aparece solo donde corresponde", () => {
    renderPipeline();
    const col = within(columnaContactado());
    const avisos = col.getAllByText("todavía con poca información");
    expect(avisos.length).toBe(1);   // solo el pelado (confianza < 0.60)
    // y está dentro de la tarjeta del pelado
    expect(avisos[0].closest("div").parentElement.textContent).toContain("Kiosco Pelado");
  });

  it("los mayoristas (columnas de cliente) no reciben chip ni ranking", () => {
    renderPipeline();
    const colActivo = screen.getByText("Activo").closest("div").parentElement;
    const card = within(colActivo).getByText("Maxi Munro").closest("div").parentElement;
    expect(card.textContent).not.toMatch(/Muy alta|Sin datos|poca información/);
  });

  it("no explota sin datasets de contexto (degradación honesta)", () => {
    renderPipeline({ sales: [], visits: [], clients: [] });
    expect(within(columnaContactado()).getAllByText(/^Kiosco /).length).toBe(3);
  });
});

// --- Fase 5.2: ficha de diagnóstico ---

const abrirDiagnostico = (nombre) => {
  renderPipeline();
  const header = screen.getAllByTitle("Ver diagnóstico").find(el => el.textContent.includes(nombre));
  fireEvent.click(header);
  return screen.getByText(/^Diagnóstico — /).closest("div").parentElement;
};

describe("Pipeline — ficha de diagnóstico (Fase 5.2)", () => {
  it("tocar el encabezado de la tarjeta abre la ficha del prospecto correcto", () => {
    const modal = abrirDiagnostico("Kiosco Estrella");
    expect(within(modal).getByText("Diagnóstico — Kiosco Estrella")).toBeTruthy();
    // veredicto (texto del dominio, no armado en la UI)
    expect(within(modal).getByText("Alta oportunidad")).toBeTruthy();
  });

  it("muestra las 3 razones con su respaldo numérico", () => {
    const modal = abrirDiagnostico("Kiosco Estrella");
    expect(within(modal).getByText(/^Oportunidad \d+$/)).toBeTruthy();
    expect(within(modal).getByText(/^Encaje \d+$/)).toBeTruthy();
    expect(within(modal).getByText(/^medido con \d+ de 13 señales$/)).toBeTruthy();
  });

  it("el '¿Por qué?' lista los 13 criterios con su valor y sus fuentes", () => {
    const modal = abrirDiagnostico("Kiosco Estrella");
    expect(within(modal).getByText("¿Por qué?")).toBeTruthy();
    // una pregunta de cada dimensión + la evidencia que la respalda
    expect(within(modal).getByText("¿No tiene proveedor estable de la categoría?")).toBeTruthy();
    expect(within(modal).getByText("¿Local medio o grande?")).toBeTruthy();
    expect(within(modal).getAllByText(/^calificacion_/).length).toBeGreaterThan(0);
    // los resúmenes por dimensión los redacta el dominio
    expect(within(modal).getByText("8/8 criterios con datos")).toBeTruthy();
    expect(within(modal).getByText("5/5 criterios con datos")).toBeTruthy();
  });

  it("cierra el diagnóstico con el próximo paso y sus pendientes", () => {
    const conCalificacion = abrirDiagnostico("Kiosco Estrella");
    expect(within(conCalificacion).getByText(/siguiente acción recomendada/)).toBeTruthy();
    expect(within(conCalificacion).queryByText(/completar la calificación/)).toBeNull();
    cleanup();
    const sinCalificar = abrirDiagnostico("Kiosco Pelado");
    expect(within(sinCalificar).getByText(/completar la calificación de visita/)).toBeTruthy();
  });

  it("los mayoristas no abren ficha (no están en el ranking)", () => {
    renderPipeline();
    const colActivo = screen.getByText("Activo").closest("div").parentElement;
    expect(within(colActivo).queryByTitle("Ver diagnóstico")).toBeNull();
  });
});
