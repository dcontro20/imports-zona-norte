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

  it("tocar la card abre la FICHA (F3: el centro operativo)", () => {
    montar();
    fireEvent.click(screen.getAllByText(/Kiosco Estrella/)[0]);
    expect(screen.getByText("Ficha — Kiosco Estrella")).toBeTruthy();
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

describe("Prospectos — Ficha (F3: centro operativo)", () => {
  const abrirFicha = (props = {}) => {
    const mounted = montar(props);
    fireEvent.click(screen.getAllByText(/Kiosco Estrella/)[0]);
    return mounted;
  };

  it("secciones completas: datos con tel:, diagnóstico, calificación con autoría, actividad", () => {
    abrirFicha({
      auditLog: [{ id: "a1", timestamp: "2026-07-20T09:00:00Z", user: "Diego", action: "create", entityType: "prospect", entityId: "p-estrella", description: "Prospecto nuevo: Kiosco Estrella" }],
    });
    // Datos: teléfono tappeable
    const tel = document.querySelector('a[href^="tel:"]');
    expect(tel).toBeTruthy();
    // Diagnóstico embebido (render de la fachada: el "¿Por qué?" está)
    expect(screen.getByText("¿Por qué?")).toBeTruthy();
    // Calificación con autoría (estrella calificado el 25/07)
    expect(screen.getByText(/por Sistema|por Diego|por Gustavo|Última:/)).toBeTruthy();
    // Actividad: visita rica + alta del audit (por su detalle — "Alta" a secas
    // colisiona con el chip de prioridad "Alta")
    expect(screen.getByText("Visita: interesado")).toBeTruthy();
    expect(screen.getByText("Prospecto nuevo: Kiosco Estrella")).toBeTruthy();
  });

  it("la procedencia del descubrimiento se muestra cuando corresponde", () => {
    const descubierto = {
      ...estrella, id: "p-desc", businessName: "Kiosco Golden", source: "descubrimiento",
      descubiertoAt: "2026-07-30", descubiertoTermino: "kiosco", rating: 4.4, reviewsCount: 51,
    };
    montar({ prospects: [descubierto], visits: [] });
    fireEvent.click(screen.getAllByText(/Kiosco Golden/)[0]);
    expect(screen.getByText(/Descubierto/)).toBeTruthy();
    // ★ aparece en la card (ProspectMapsLine) Y en la procedencia de la Ficha.
    expect(screen.getAllByText(/★ 4.4/).length).toBeGreaterThanOrEqual(2);
  });

  it("acciones desde la Ficha: avanzar usa la fuente compartida", () => {
    const { setProspects } = abrirFicha();
    fireEvent.click(screen.getByText("→ Avanzar"));
    // estrella estaba en contactado → avanza a visitado (misma regla del kanban)
    const lista = setProspects.mock.calls[0][0]([{ ...estrella }]);
    expect(lista[0].pipelineStage).toBe("visitado");
  });

  it("✏️ Editar abre el form compartido con los datos cargados", () => {
    abrirFicha();
    fireEvent.click(screen.getByText("✏️ Editar"));
    expect(screen.getByText("Editar prospecto")).toBeTruthy();
    expect(screen.getByDisplayValue("Kiosco Estrella")).toBeTruthy();
  });

  it("🗑 Borrar borra (fuente compartida) y cierra la Ficha", () => {
    const { setProspects } = abrirFicha();
    fireEvent.click(screen.getByText("🗑 Borrar"));
    const lista = setProspects.mock.calls[0][0]([{ ...estrella }]);
    expect(lista[0].isDeleted).toBe(true);
    expect(screen.queryByText("Ficha — Kiosco Estrella")).toBeNull();
  });

  it("desde el Embudo también se abre la Ficha (onOpenFicha)", () => {
    montar();
    fireEvent.click(screen.getByText("🎯 Embudo"));
    fireEvent.click(screen.getAllByText(/Kiosco Estrella/)[0]);
    expect(screen.getByText("Ficha — Kiosco Estrella")).toBeTruthy();
  });
});

describe("Prospectos — renglón de Google Maps en las cards (micro-iteración)", () => {
  const descubierto = {
    ...estrella, id: "p-maps", businessName: "Kiosco Maps", zone: "Microcentro",
    source: "descubrimiento", rating: 4.7, reviewsCount: 33,
    phone: "011 5555-1234", address: "Florida 550",
    urlOrigen: "https://maps.google.com/?cid=999",
  };

  it("Para hoy muestra ★/📞/dirección y el link 🗺️ Maps a la ficha real", () => {
    montar({ prospects: [descubierto], visits: [] });
    expect(screen.getByText(/★ 4.7 \(33\) · 📞 011 5555-1234 · Florida 550/)).toBeTruthy();
    const link = screen.getByText("🗺️ Maps");
    expect(link.getAttribute("href")).toBe("https://maps.google.com/?cid=999");
    // El link NO abre la Ficha (stopPropagation).
    fireEvent.click(link);
    expect(screen.queryByText("Ficha — Kiosco Maps")).toBeNull();
  });

  it("sin datos de Maps la card no muestra el renglón (cero ruido)", () => {
    montar({ prospects: [{ id: "p-pelado2", businessName: "Kiosco Pelado", zone: "X", pipelineStage: "prospecto" }], visits: [] });
    expect(screen.queryByText("🗺️ Maps")).toBeNull();
  });

  it("el Embudo también muestra el renglón en sus cards", () => {
    montar({ prospects: [descubierto], visits: [] });
    fireEvent.click(screen.getByText("🎯 Embudo"));
    expect(screen.getByText(/★ 4.7/)).toBeTruthy();
    expect(screen.getByText("🗺️ Maps")).toBeTruthy();
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
