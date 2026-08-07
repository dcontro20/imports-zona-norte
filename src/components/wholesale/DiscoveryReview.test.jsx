// Test de integración UI ↔ discovery. Las reglas viven en discoveryImport.js
// (con sus propios tests); acá se testea que la UI CONSUME bien: alta de
// búsqueda, estado de las que corren, descartados con memoria, y —desde F2 del
// ciclo v2— que la pantalla refleja la AUTO-INGESTA (aviso de "por analizar")
// en vez del viejo modal de revisión, que ya no existe.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

// Pipeline importa useResponsive de App.jsx, que arrastra firebase.
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

import { DiscoverySuppressedModal, DiscoverySearchModal, DiscoveryJobsStatus } from "./DiscoveryReview.jsx";
import { Prospectos } from "../Prospectos.jsx";
import { AppContext } from "../../AppContext.js";

afterEach(() => cleanup());

const CTX = { currentUser: { name: "Diego" }, exchangeRate: 1000, logAudit: vi.fn(), logStock: vi.fn() };

const staged = (nombre, over = {}) => ({
  businessName: nombre, zone: "Palermo", address: `${nombre} 123, CABA`, phone: "",
  contactName: "", source: "descubrimiento", notes: "", lat: "", lng: "",
  pipelineStage: "prospecto", via: "google_maps", descubiertoTermino: "kiosco",
  descubiertoEn: "Palermo, CABA, Argentina", descubiertoAt: "2026-07-30",
  placeId: `PID_${nombre}`, urlOrigen: "", clavesIdentidad: [], web: "",
  redSocial: "", categoria: "Kiosco", email: "", rating: 4, reviewsCount: 10,
  horariosCompletos: "si", ...over,
});

// Prospecto tal como lo deja la auto-ingesta: id determinístico + el hecho
// `ingresoAutomatico` sin `analizadoAt` ⇒ etapa operativa `por_analizar`.
const ingresado = (nombre, over = {}) => ({
  ...staged(nombre), id: `dsc_PID_${nombre}`, ingresoAutomatico: true,
  foundAt: "2026-08-06T12:00:00Z", lastContactAt: "2026-08-06T12:00:00Z", ...over,
});

describe("DiscoverySuppressedModal", () => {
  it("lista descartados y rehabilita", () => {
    const onRehabilitar = vi.fn();
    const s = { id: "s-1", nombre: "Kiosco X", direccion: "Calle 1", motivo: "descartado en revisión", at: "2026-07-30", por: "Diego" };
    render(<DiscoverySuppressedModal open suprimidos={[s]} onRehabilitar={onRehabilitar} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("↩ Rehabilitar"));
    expect(onRehabilitar).toHaveBeenCalledWith(s);
  });
});

describe("DiscoverySearchModal — form de nueva búsqueda (§3)", () => {
  // El Input de UI.jsx no asocia label↔input (sin htmlFor): se selecciona por
  // placeholder, y el tope (type number) por su rol spinbutton.
  const llenar = (placeholder, valor) => {
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: valor } });
  };

  it("crea la búsqueda validada; ubicación vacía se compone desde la zona", () => {
    const onCreate = vi.fn();
    render(<DiscoverySearchModal open onClose={vi.fn()} onCreate={onCreate} />);
    llenar("kiosco, maxikiosco, drugstore...", "quioscos");
    llenar("Palermo", "Palermo");
    fireEvent.click(screen.getByText("Buscar"));
    expect(onCreate).toHaveBeenCalledWith({
      termino: "quioscos", zona: "Palermo",
      ubicacion: "Palermo, Buenos Aires, Argentina", tope: 60,
    });
  });

  it("la validación del dominio frena búsquedas incompletas o con tope inválido", () => {
    const onCreate = vi.fn();
    render(<DiscoverySearchModal open onClose={vi.fn()} onCreate={onCreate} />);
    fireEvent.click(screen.getByText("Buscar"));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/sin término/)).toBeTruthy();
    llenar("kiosco, maxikiosco, drugstore...", "kiosco");
    llenar("Palermo", "Palermo");
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "500" } });
    fireEvent.click(screen.getByText("Buscar"));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/techo anti-crawling/)).toBeTruthy();
  });
});

describe("DiscoveryJobsStatus — búsquedas activas", () => {
  it("muestra pendiente/en_curso/error; lo listo no aparece; cancela lo cancelable", () => {
    const onCancel = vi.fn();
    const jobs = [
      { id: "j1", termino: "kiosco", zona: "Palermo", status: "pendiente" },
      { id: "j2", termino: "drugstore", zona: "Núñez", status: "en_curso" },
      { id: "j3", termino: "maxikiosco", zona: "Saavedra", status: "error", error: "gosom no produjo resultados (exit 1)" },
      { id: "j4", termino: "kiosco", zona: "Colegiales", status: "listo" },
    ];
    render(<DiscoveryJobsStatus jobs={jobs} onCancel={onCancel} />);
    expect(screen.getByText(/en cola/)).toBeTruthy();
    expect(screen.getByText(/buscando/)).toBeTruthy();
    expect(screen.getByText(/gosom no produjo resultados/)).toBeTruthy();
    expect(screen.queryByText(/Colegiales/)).toBeNull();
    // Cancelables: el pendiente y el error (el en_curso no se toca).
    const cancelar = screen.getAllByText("✕");
    expect(cancelar).toHaveLength(2);
    fireEvent.click(cancelar[0]);
    expect(onCancel).toHaveBeenCalledWith(jobs[0]);
  });
});

describe("Prospectos (módulo) — auto-ingesta reflejada en la pestaña Hoy (F2)", () => {
  const montar = (extra = {}) => render(
    <AppContext.Provider value={CTX}>
      <Prospectos
        prospects={[]} setProspects={vi.fn()}
        clients={[]} setClients={vi.fn()} visits={[]} setVisits={vi.fn()}
        discoverySuppressed={[]} setDiscoverySuppressed={vi.fn()}
        {...extra}
      />
    </AppContext.Provider>,
  );

  // Los descubiertos entran solos (la ingesta corre en App.jsx) y aterrizan en
  // la cola 🔍, que en F3 es el deck de análisis. Ya no hay modal de revisión
  // ni banner aparte: la cola ES el aviso (criterio: nunca ruidoso).
  it("los que entraron solos aterrizan en la cola de análisis, sin revisión manual", () => {
    montar({ prospects: [ingresado("Alfa"), ingresado("Beta")] });
    expect(screen.getByText("Analizar")).toBeTruthy();
    expect(screen.getByText("2 negocios sin decidir")).toBeTruthy();
    expect(screen.getByText("Alfa")).toBeTruthy();
    expect(screen.queryByText("Revisar")).toBeNull();
  });

  // La enmienda del §4: nada se contacta sin análisis humano. Un descubierto
  // sin analizar solo puede estar en 🔍; el analizado ya es trabajo ejecutable.
  it("sin analizar solo aparece en 🔍; el analizado pasa a su cola de ejecución", () => {
    montar({ prospects: [ingresado("Alfa"), ingresado("Beta", { analizadoAt: "2026-08-06T10:00:00Z" })] });
    expect(screen.getByText("1 negocio sin decidir")).toBeTruthy();   // solo Alfa
    expect(screen.getByText("Alfa")).toBeTruthy();
    // Beta (sin teléfono ⇒ regla automática) espera en "Visitar".
    fireEvent.click(screen.getByText("Visitar").closest("button"));
    expect(screen.getAllByText(/Beta/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Alfa/)).toBeNull();
  });

  it("sin nada para analizar, la cola 🔍 ofrece conseguir más y los descartados", () => {
    montar({ discoverySuppressed: [{ id: "s-1", nombre: "X", direccion: "C 1", motivo: "m", at: "2026-07-30" }] });
    expect(screen.getByText(/Nada para analizar/)).toBeTruthy();
    expect(screen.getByText("⛔ Descartados (1)")).toBeTruthy();
  });
});

describe("Prospectos (módulo) — pestañas y alias de deep-link (F1)", () => {
  const montar = (props = {}) => render(
    <AppContext.Provider value={CTX}>
      <Prospectos
        prospects={[]} setProspects={vi.fn()} clients={[]} setClients={vi.fn()}
        visits={[]} setVisits={vi.fn()} {...props}
      />
    </AppContext.Provider>,
  );

  it("abre en Hoy por default, con la barra de colas y el descubrimiento a mano", () => {
    montar();
    expect(screen.getByText("🎯 Prospectos")).toBeTruthy();
    expect(screen.getByText("Analizar")).toBeTruthy();
    expect(screen.getByText("🔎 Descubrir")).toBeTruthy();
  });

  it("Embudo muestra el kanban puro (sin discovery adentro)", () => {
    montar();
    fireEvent.click(screen.getByText("🎯 Embudo"));
    expect(screen.getByText("Embudo de captación")).toBeTruthy();
    expect(screen.getByText("+ Nuevo prospecto")).toBeTruthy();
    // El discovery vive en Hoy: el kanban no trae 🔎 propio.
    expect(screen.queryByText("🔎 Descubrir")).toBeNull();
  });

  it("Zonas muestra el ProspectMap de siempre", () => {
    montar();
    fireEvent.click(screen.getByText("🗺️ Zonas"));
    expect(screen.getByText("🗺️ Prospección por zona")).toBeTruthy();
  });

  it("tabInicial honra los alias históricos: pipeline→embudo, prospectMap→zonas", () => {
    montar({ tabInicial: "embudo" });
    expect(screen.getByText("Embudo de captación")).toBeTruthy();
    cleanup();
    montar({ tabInicial: "zonas" });
    expect(screen.getByText("🗺️ Prospección por zona")).toBeTruthy();
    cleanup();
    // Un tab desconocido cae a Hoy, no rompe.
    montar({ tabInicial: "loQueSea" });
    expect(screen.getByText("Analizar")).toBeTruthy();
  });
});
