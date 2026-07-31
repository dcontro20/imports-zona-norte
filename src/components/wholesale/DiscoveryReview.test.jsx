// Test de integración UI ↔ ingesta del discovery (F2).
// Las reglas viven en discoveryImport.js (con sus propios tests); acá se
// testea que la UI CONSUME bien: estados pintados, toggle importar/descartar,
// split del confirm, y el flujo completo montado en Pipeline (banner →
// revisar → setProspects/setDiscoverySuppressed → consumo del staging).
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

import { DiscoveryReviewModal, DiscoverySuppressedModal, DiscoverySearchModal, DiscoveryJobsStatus } from "./DiscoveryReview.jsx";
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

const RESULTADO = {
  id: "job-1", jobId: "job-1", zona: "Palermo", termino: "kiosco",
  at: "2026-07-30T12:00:00Z",
  prospectos: [staged("Alfa"), staged("Beta"), staged("Gamma")],
};

describe("DiscoveryReviewModal", () => {
  it("pinta estados: importable accionable, duplicado y suprimido informativos", () => {
    render(<DiscoveryReviewModal
      open resultado={RESULTADO} onConfirm={vi.fn()} onClose={vi.fn()}
      prospects={[{ businessName: "Beta", placeId: "PID_Beta" }]}
      suprimidos={[{ nombre: "Gamma", direccion: "Gamma 123, CABA" }]}
    />);
    expect(screen.getByText(/1 para importar · 1 duplicados · 1 descartados antes/)).toBeTruthy();
    expect(screen.getByText("duplicado")).toBeTruthy();
    expect(screen.getByText("descartado antes")).toBeTruthy();
    // Solo el importable (Alfa) tiene botones de acción.
    expect(screen.getAllByText("✓ Importar")).toHaveLength(1);
  });

  it("toggle a descartar parte el confirm en altas y supresiones", () => {
    const onConfirm = vi.fn();
    render(<DiscoveryReviewModal open resultado={RESULTADO} onConfirm={onConfirm} onClose={vi.fn()} />);
    // Descartar a Beta (segundo importable).
    fireEvent.click(screen.getAllByText("✗ Descartar")[1]);
    fireEvent.click(screen.getByText("Importar 2"));
    const arg = onConfirm.mock.calls[0][0];
    expect(arg.altas.map(p => p.businessName)).toEqual(["Alfa", "Gamma"]);
    expect(arg.supresiones.map(p => p.businessName)).toEqual(["Beta"]);
    expect(arg.sinMemoria).toEqual([]);
  });

  it("descartado sin identidad suficiente va a sinMemoria y lo avisa", () => {
    const onConfirm = vi.fn();
    const pelado = staged("Fantasma", { address: "", web: "" });
    render(<DiscoveryReviewModal open resultado={{ ...RESULTADO, prospectos: [pelado] }} onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("✗ Descartar"));
    expect(screen.getByText(/sin identidad suficiente/)).toBeTruthy();
    fireEvent.click(screen.getByText("Confirmar"));
    expect(onConfirm.mock.calls[0][0].sinMemoria.map(p => p.businessName)).toEqual(["Fantasma"]);
    expect(onConfirm.mock.calls[0][0].supresiones).toEqual([]);
  });
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

describe("Prospectos (módulo) — flujo de revisión punta a punta en la pestaña Hoy", () => {
  const montar = (extra = {}) => {
    const setProspects = vi.fn();
    const setDiscoverySuppressed = vi.fn();
    const onConsume = vi.fn();
    render(
      <AppContext.Provider value={CTX}>
        <Prospectos
          prospects={[]} setProspects={setProspects}
          clients={[]} setClients={vi.fn()} visits={[]} setVisits={vi.fn()}
          discoveryResults={[RESULTADO]} onConsumeDiscoveryResult={onConsume}
          discoverySuppressed={[]} setDiscoverySuppressed={setDiscoverySuppressed}
          {...extra}
        />
      </AppContext.Provider>,
    );
    return { setProspects, setDiscoverySuppressed, onConsume };
  };

  it("banner visible → revisar → importar: altas con id/fechas, descarte con memoria, staging consumido", () => {
    const { setProspects, setDiscoverySuppressed, onConsume } = montar();
    expect(screen.getByText(/3 descubiertos de "kiosco" — Palermo/)).toBeTruthy();
    fireEvent.click(screen.getByText("Revisar"));
    fireEvent.click(screen.getAllByText("✗ Descartar")[0]);   // descartar Alfa
    fireEvent.click(screen.getByText("Importar 2"));

    // Altas: prev => [...nuevos, ...prev] con id y fechas selladas.
    const nuevos = setProspects.mock.calls[0][0]([]);
    expect(nuevos.map(p => p.businessName)).toEqual(["Beta", "Gamma"]);
    expect(nuevos.every(p => p.id && p.foundAt && p.lastContactAt)).toBe(true);
    expect(nuevos.every(p => p.source === "descubrimiento")).toBe(true);

    // Descarte con memoria, firmado.
    const entradas = setDiscoverySuppressed.mock.calls[0][0]([]);
    expect(entradas.map(e => e.nombre)).toEqual(["Alfa"]);
    expect(entradas[0].por).toBe("Diego");

    expect(onConsume).toHaveBeenCalledWith("job-1");
    expect(CTX.logAudit).toHaveBeenCalledWith("import", "prospect", "job-1", expect.stringContaining("2 altas"));
  });

  it("sin staging no hay banner; con descartados aparece el botón ⛔", () => {
    montar({ discoveryResults: [], discoverySuppressed: [{ id: "s-1", nombre: "X", direccion: "C 1", motivo: "m", at: "2026-07-30" }] });
    expect(screen.queryByText(/descubiertos de/)).toBeNull();
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

  it("abre en Hoy por default, con 🔎 Descubrir y Para hoy", () => {
    montar();
    expect(screen.getByText("🎯 Prospectos")).toBeTruthy();
    expect(screen.getByText("🔎 Descubrir")).toBeTruthy();
    expect(screen.getByText("☀️ Para hoy")).toBeTruthy();
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
    expect(screen.getByText("☀️ Para hoy")).toBeTruthy();
  });
});
