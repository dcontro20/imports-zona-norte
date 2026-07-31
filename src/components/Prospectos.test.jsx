// Prospectos.test.jsx — F2 del mini CRM: la pestaña Hoy completa.
// NO testea reglas de negocio (ranking/funnel/zonas viven en las libs con sus
// tests): testea que Hoy CONSUME bien — Top 5 en orden del engine, contador ◍,
// funnel, zonas con búsqueda pre-cargada, últimas visitas con autoría, y que
// las acciones (visita / alta) disparan los modales compartidos.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// Prospectos importa useResponsive de App.jsx, que arrastra firebase.
vi.mock("../firebase.js", () => ({
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

import { Prospectos } from "./Prospectos.jsx";
import { AppContext } from "../AppContext.js";

afterEach(() => cleanup());

const CTX = { currentUser: { name: "Diego" }, exchangeRate: 1000, logAudit: vi.fn(), logStock: vi.fn() };

// estrella: calificado completo + visita interesada ⇒ arriba del ranking.
// pelado-N: sin datos ⇒ abajo, con aviso ◍.
const estrella = {
  id: "p-estrella", businessName: "Kiosco Estrella", zone: "Munro", pipelineStage: "contactado",
  source: "referido", contactName: "Marta", phone: "11-4444-0001",
  calificacion: { vendeCategoria: "no", proveedorEstable: "no", competenciaVisible: "no",
                  tamano: "grande", movimiento: "si", actualizadoAt: "2026-07-25" },
};
const pelados = ["Uno", "Dos", "Tres", "Cuatro", "Cinco"].map((n, i) => ({
  id: `p-${n.toLowerCase()}`, businessName: `Kiosco ${n}`, zone: "Florida",
  pipelineStage: "prospecto", source: "manual",
}));
const visitaEstrella = {
  id: "v-1", targetId: "p-estrella", targetType: "prospect",
  date: "2026-07-25T10:00:00Z", outcome: "interesado", notes: "", byUser: "Gustavo",
};

const montar = (props = {}) => {
  const setProspects = vi.fn();
  const setVisits = vi.fn();
  render(
    <AppContext.Provider value={CTX}>
      <Prospectos
        prospects={[estrella, ...pelados]} setProspects={setProspects}
        clients={[]} setClients={vi.fn()}
        visits={[visitaEstrella]} setVisits={setVisits}
        {...props}
      />
    </AppContext.Provider>,
  );
  return { setProspects, setVisits };
};

describe("Prospectos — Hoy: Para hoy Top 5 (D-3)", () => {
  it("muestra exactamente 5 cards, con el mejor calificado primero", () => {
    montar();
    // 6 trabajables → solo 5 en Para hoy (📋 Visita aparece 1 vez por card).
    expect(screen.getAllByText("📋 Visita")).toHaveLength(5);
    // El estrella encabeza (el engine lo rankea arriba; los pelados, abajo).
    const nombres = screen.getAllByText(/Kiosco (Estrella|Uno|Dos|Tres|Cuatro|Cinco)/)
      .map(el => el.textContent);
    expect(nombres[0]).toContain("Kiosco Estrella");
  });

  it("cada card trae chip de prioridad, próximo paso y acciones directas", () => {
    montar();
    expect(screen.getAllByText("📋 Visita")).toHaveLength(5);
    expect(screen.getAllByText("💬 Presentar")).toHaveLength(5);
    // Los pelados (sin calificar) muestran su aviso ◍ dentro de la card.
    expect(screen.getAllByText("◍").length).toBeGreaterThanOrEqual(4);
  });

  it("muestra el contador de sin calificar", () => {
    montar();
    expect(screen.getByText(/5 sin calificar/)).toBeTruthy();
  });

  it("empty state cuando no hay trabajables", () => {
    montar({ prospects: [], visits: [] });
    expect(screen.getByText(/Sin prospectos para trabajar/)).toBeTruthy();
  });

  it("tocar la card abre el diagnóstico del engine", () => {
    montar();
    // El nombre aparece en la card Y en últimas visitas: clickear la card
    // (primer match) y verificar que el modal agrega una aparición más.
    const antes = screen.getAllByText(/Kiosco Estrella/).length;
    fireEvent.click(screen.getAllByText(/Kiosco Estrella/)[0]);
    expect(screen.getAllByText(/Kiosco Estrella/).length).toBeGreaterThan(antes);
  });
});

describe("Prospectos — Hoy: funnel, zonas y últimas visitas", () => {
  it("funnel con las 4 etapas", () => {
    montar();
    expect(screen.getByText("Prospectos", { selector: "div" })).toBeTruthy();
    expect(screen.getByText("Contactados")).toBeTruthy();
    expect(screen.getByText("Visitados")).toBeTruthy();
    expect(screen.getByText("Mayoristas")).toBeTruthy();
  });

  it("zonas sin mayorista: chip por zona y 🔎 pre-carga la búsqueda", () => {
    montar();
    // Munro y Florida tienen prospectos y cero mayoristas.
    expect(screen.getByText("Munro")).toBeTruthy();
    expect(screen.getByText("Florida")).toBeTruthy();
    // El 🔎 del chip abre el form con la zona YA cargada.
    fireEvent.click(screen.getAllByText("🔎")[0]);
    expect(screen.getByPlaceholderText("Palermo").value).not.toBe("");
  });

  it("últimas visitas con nombre resuelto, resultado y autoría", () => {
    montar();
    expect(screen.getByText("interesado")).toBeTruthy();
    expect(screen.getByText(/Gustavo/)).toBeTruthy();
  });
});

describe("Prospectos — Hoy: acciones", () => {
  it("📋 Visita abre el modal compartido y registra", () => {
    const { setVisits } = montar();
    fireEvent.click(screen.getAllByText("📋 Visita")[0]);
    expect(screen.getByText(/Visita — Kiosco Estrella/)).toBeTruthy();
    fireEvent.click(screen.getByText("Registrar"));
    const nuevas = setVisits.mock.calls[0][0]([]);
    expect(nuevas[0].targetId).toBe("p-estrella");
    expect(nuevas[0].byUser).toBe("Diego");
  });

  it("+ Nuevo prospecto abre el alta compartida y crea", () => {
    const { setProspects } = montar();
    fireEvent.click(screen.getByText("+ Nuevo prospecto"));
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Kiosco Nuevo" } });
    fireEvent.click(screen.getByText("Crear"));
    const lista = setProspects.mock.calls[0][0]([]);
    expect(lista[0].businessName).toBe("Kiosco Nuevo");
    expect(lista[0].pipelineStage).toBe("prospecto");
    expect(lista[0].id).toBeTruthy();
  });
});
