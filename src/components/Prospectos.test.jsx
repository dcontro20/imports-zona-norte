// Prospectos.test.jsx — F3 del ciclo v2: ☀️ Hoy como COLAS DE ACCIÓN.
// NO testea reglas de negocio (derivación de etapas, ranking, hechos y zonas
// viven en las libs con sus tests): testea que la pantalla CONSUME bien —
// barra de colas sin ruido, el deck de análisis como decisión comercial, las
// colas de ejecución con su acción primaria, y que cada tap registra el HECHO
// correcto a través de la fuente compartida.
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

const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

// Un prospecto por etapa operativa — los hechos, no las etiquetas, los ubican.
const golden = {   // 🔍 entró solo por el discovery y nadie lo miró
  id: "dsc_PID_GOLDEN", businessName: "Kiosco Golden", zone: "Palermo",
  address: "El Salvador 4813", source: "descubrimiento", ingresoAutomatico: true,
  placeId: "PID_GOLDEN",
  phone: "", rating: 4.4, reviewsCount: 51, categoria: "Kiosco",
  horariosCompletos: "si", descubiertoTermino: "kiosco", descubiertoEn: "Palermo, CABA",
  descubiertoAt: "2026-08-06", urlOrigen: "https://maps.google.com/?cid=1",
};
const conTelefono = {   // 💬 analizado y con teléfono
  id: "p-tel", businessName: "Kiosco Contactar", zone: "Munro", source: "descubrimiento",
  ingresoAutomatico: true, analizadoAt: hace(1), analizadoPor: "Diego", phone: "11-4444-0001",
};
const sinTelefono = {   // 🚶 analizado y sin teléfono (regla automática)
  id: "p-visitar", businessName: "Kiosco Visitar", zone: "Florida", source: "descubrimiento",
  ingresoAutomatico: true, analizadoAt: hace(1), analizadoPor: "Diego", phone: "",
};
const esperando = {     // ⏳ mensaje mandado recién
  id: "p-espera", businessName: "Kiosco Espera", zone: "Vicente López",
  source: "manual", phone: "11-4444-0002", mensajeEnviadoAt: hace(1), mensajeEnviadoPor: "Diego",
};
const vencido = {       // ⏳ con sub-estado reintentar (más de 3 días)
  id: "p-vencido", businessName: "Kiosco Vencido", zone: "Olivos",
  source: "manual", phone: "11-4444-0003", mensajeEnviadoAt: hace(9), mensajeEnviadoPor: "Diego",
};
const visitado = {      // 📋 tiene visita registrada
  id: "p-visitado", businessName: "Kiosco Visitado", zone: "Munro",
  source: "referido", contactName: "Marta", phone: "11-4444-0004",
  calificacion: { vendeCategoria: "no", proveedorEstable: "no", competenciaVisible: "no",
                  tamano: "grande", movimiento: "si", actualizadoAt: "2026-07-25" },
};
const visitaDeVisitado = {
  id: "v-1", targetId: "p-visitado", targetType: "prospect",
  date: "2026-07-25T10:00:00Z", outcome: "interesado", notes: "", byUser: "Gustavo",
};
const negociando = { id: "p-nego", businessName: "Kiosco Negocia", zone: "Munro", source: "manual", respondioAt: hace(1) };

const TODOS = [golden, conTelefono, sinTelefono, esperando, vencido, visitado, negociando];

const montar = (props = {}) => {
  const setProspects = vi.fn();
  const setVisits = vi.fn();
  const setDiscoverySuppressed = vi.fn();
  const setClients = vi.fn();
  render(
    <AppContext.Provider value={CTX}>
      <Prospectos
        prospects={TODOS} setProspects={setProspects}
        clients={[]} setClients={setClients}
        visits={[visitaDeVisitado]} setVisits={setVisits}
        discoverySuppressed={[]} setDiscoverySuppressed={setDiscoverySuppressed}
        {...props}
      />
    </AppContext.Provider>,
  );
  return { setProspects, setVisits, setDiscoverySuppressed, setClients };
};

// Ir a una cola por su chip de la barra.
const irA = (corto) => fireEvent.click(screen.getByText(corto).closest("button"));

describe("Prospectos — barra de colas (criterio: nunca ruidoso)", () => {
  it("una cola por etapa operativa, con su conteo", () => {
    montar();
    for (const corto of ["Por analizar", "Contactar", "Visitar", "Esperando", "Visitados", "Cerrar"]) {
      expect(screen.getByText(corto)).toBeTruthy();
    }
    // Los vencidos son lo único que grita dentro de la espera.
    expect(screen.getByText("1 para reintentar")).toBeTruthy();
  });

  it("las colas SIN trabajo no se muestran; 🔍 queda siempre (es la puerta de entrada)", () => {
    montar({ prospects: [conTelefono], visits: [] });
    expect(screen.getByText("Contactar")).toBeTruthy();
    expect(screen.getByText("Por analizar")).toBeTruthy();
    expect(screen.queryByText("Esperando")).toBeNull();
    expect(screen.queryByText("Cerrar")).toBeNull();
  });

  it("arranca en la primera cola CON trabajo: la pantalla ya propone la siguiente acción", () => {
    // Sin nada para analizar, el trabajo empieza en "Contactar".
    montar({ prospects: [conTelefono, visitado], visits: [visitaDeVisitado] });
    expect(screen.getByText(/Kiosco Contactar/)).toBeTruthy();
    expect(screen.queryByText(/Kiosco Visitado ›/)).toBeNull();
  });
});

describe("Prospectos — cola 🔍: el DECK de análisis (criterio: es una decisión, no una revisión)", () => {
  it("muestra UN negocio por vez con su expediente y la pregunta explícita", () => {
    montar();
    expect(screen.getByText("Kiosco Golden")).toBeTruthy();
    expect(screen.getByText("¿Vale la pena trabajarlo?")).toBeTruthy();
    // El expediente: lo que se necesita para juzgar.
    expect(screen.getByText(/51 reseñas/)).toBeTruthy();
    expect(screen.getByText(/abre todos los días/)).toBeTruthy();
    expect(screen.getByText(/Sin teléfono — va a la cola de visitar/)).toBeTruthy();
    expect(screen.getByText(/Encontrado buscando "kiosco"/)).toBeTruthy();
  });

  it("✓ Trabajar registra el HECHO del análisis (no una etapa)", () => {
    const { setProspects } = montar();
    fireEvent.click(screen.getByText("✓ Trabajar"));
    const lista = setProspects.mock.calls[0][0]([{ ...golden }]);
    expect(lista[0].analizadoAt).toBeTruthy();
    expect(lista[0].analizadoPor).toBe("Diego");
    expect(lista[0].etapa).toBeUndefined();        // la etapa se DERIVA, nunca se escribe
    expect(lista[0].pipelineStage).toBeUndefined();
  });

  it("✗ Descartar recuerda (supresión) y saca el prospecto de la vista", () => {
    const { setProspects, setDiscoverySuppressed } = montar();
    fireEvent.click(screen.getByText("✗ Descartar"));
    const entradas = setDiscoverySuppressed.mock.calls[0][0]([]);
    expect(entradas[0].nombre).toBe("Kiosco Golden");
    expect(entradas[0].claves).toContain("pid:PID_GOLDEN");
    const lista = setProspects.mock.calls[0][0]([{ ...golden }]);
    expect(lista[0].isDeleted).toBe(true);
    expect(lista[0].descartadoAt).toBeTruthy();
  });

  it("saltear no registra nada: manda el negocio al final de la fila", () => {
    const otro = { ...golden, id: "dsc_OTRO", businessName: "Kiosco Otro", placeId: "PID_OTRO" };
    const { setProspects } = montar({ prospects: [golden, otro], visits: [] });
    expect(screen.getByText("Kiosco Golden")).toBeTruthy();
    fireEvent.click(screen.getByText("Saltear por ahora"));
    expect(screen.getByText("Kiosco Otro")).toBeTruthy();
    expect(setProspects).not.toHaveBeenCalled();   // postergar no es decidir
  });

  it("con la cola vacía, el deck ofrece conseguir más (el discovery vive acá)", () => {
    montar({ prospects: [], visits: [] });
    expect(screen.getByText(/Nada para analizar/)).toBeTruthy();
    expect(screen.getByText("🔎 Descubrir")).toBeTruthy();
  });

  it("las zonas sin mayorista pre-cargan la búsqueda desde la misma cola", () => {
    montar();
    // El 🔎 del chip de zona (el otro "🔎" de la pantalla es el ícono del
    // expediente en el deck, que no es un botón).
    const chipZona = screen.getAllByText("🔎").map(e => e.closest("button")).filter(Boolean)[0];
    fireEvent.click(chipZona);
    expect(screen.getByPlaceholderText("Palermo").value).not.toBe("");
  });
});

describe("Prospectos — colas de ejecución: misma gramática, acción primaria propia", () => {
  it("💬 Contactar ofrece presentar y llamar", () => {
    montar();
    irA("Contactar");
    expect(screen.getByText(/Kiosco Contactar/)).toBeTruthy();
    expect(screen.getByText("💬 Presentar")).toBeTruthy();
    expect(screen.getByText("📞 Llamar")).toBeTruthy();
  });

  it("🚶 Visitar ofrece registrar la visita", () => {
    montar();
    irA("Visitar");
    expect(screen.getByText(/Kiosco Visitar/)).toBeTruthy();
    expect(screen.getByText("📋 Visita")).toBeTruthy();
  });

  it("⏳ Esperando: lo vencido va primero, marcado, y con opción de reescribir", () => {
    montar();
    irA("Esperando");
    const nombres = screen.getAllByText(/Kiosco (Espera|Vencido)/).map(e => e.textContent);
    expect(nombres[0]).toContain("Kiosco Vencido");
    expect(screen.getByText("reintentar")).toBeTruthy();
    expect(screen.getByText("💬 Reescribir")).toBeTruthy();
  });

  it("🟢 Respondió y 🔴 No responde registran su hecho", () => {
    const { setProspects } = montar();
    irA("Esperando");
    fireEvent.click(screen.getAllByText("🟢 Respondió")[0]);
    expect(setProspects.mock.calls[0][0]([{ ...vencido }])[0].respondioAt).toBeTruthy();
    fireEvent.click(screen.getAllByText("🔴 No responde")[1]);
    expect(setProspects.mock.calls[1][0]([{ ...esperando }])[0].noRespondeAt).toBeTruthy();
  });

  it("📋 Visitados ofrece cerrar: negociar o convertir", () => {
    const { setProspects } = montar();
    irA("Visitados");
    expect(screen.getByText(/Kiosco Visitado/)).toBeTruthy();
    fireEvent.click(screen.getByText("🤝 Negociando"));
    expect(setProspects.mock.calls[0][0]([{ ...visitado }])[0].negociacionAt).toBeTruthy();
  });

  it("🤝 Cerrar convierte a mayorista con la fuente compartida", () => {
    const { setProspects, setClients } = montar();
    irA("Cerrar");
    expect(screen.getByText(/Kiosco Negocia/)).toBeTruthy();
    fireEvent.click(screen.getByText("✓ Convertir"));
    expect(setClients.mock.calls[0][0]([])[0].type).toBe("mayorista");
    expect(setProspects.mock.calls[0][0]([{ ...negociando }])[0].convertedClientId).toBeTruthy();
  });

  it("tocar cualquier card abre la Ficha (el expediente, desde cualquier etapa)", () => {
    montar();
    irA("Contactar");
    fireEvent.click(screen.getByText(/Kiosco Contactar/));
    expect(screen.getByText("Ficha — Kiosco Contactar")).toBeTruthy();
  });
});

describe("Prospectos — presentar deja rastro (el gap que cerró F3)", () => {
  it("mandar por WhatsApp registra mensajeEnviadoAt y limpia el 'no responde'", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => {});
    const { setProspects } = montar();
    irA("Contactar");
    fireEvent.click(screen.getByText("💬 Presentar"));
    fireEvent.click(screen.getByText("💬 Mandar por WhatsApp"));
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("wa.me/1144440001"), "_blank", "noopener");
    const lista = setProspects.mock.calls[0][0]([{ ...conTelefono, noRespondeAt: hace(2) }]);
    expect(lista[0].mensajeEnviadoAt).toBeTruthy();
    expect(lista[0].mensajeEnviadoPor).toBe("Diego");
    expect(lista[0].noRespondeAt).toBe("");
    openSpy.mockRestore();
  });

  it("copiar NO cuenta como enviado: hay que confirmarlo (derivar de hechos, no de intenciones)", () => {
    const { setProspects } = montar();
    irA("Visitar");   // sin teléfono: el camino es copiar y confirmar
    fireEvent.click(screen.getByText("💬 Presentar"));
    expect(screen.queryByText("✅ Ya lo mandé")).toBeNull();
    expect(setProspects).not.toHaveBeenCalled();
  });
});

describe("Prospectos — Ficha: el expediente permanente", () => {
  const abrirFicha = (props = {}) => {
    const m = montar(props);
    irA("Visitados");
    fireEvent.click(screen.getByText(/Kiosco Visitado/));
    return m;
  };

  it("muestra la etapa OPERATIVA (la misma que decide la cola), no la del engine", () => {
    abrirFicha();
    expect(screen.getByText("📋 Visitado")).toBeTruthy();
  });

  it("secciones completas: datos con tel:, diagnóstico, calificación con autoría, actividad", () => {
    abrirFicha({
      auditLog: [{ id: "a1", timestamp: "2026-07-20T09:00:00Z", user: "Diego", action: "create", entityType: "prospect", entityId: "p-visitado", description: "Prospecto nuevo: Kiosco Visitado" }],
    });
    expect(document.querySelector('a[href^="tel:"]')).toBeTruthy();
    expect(screen.getByText("¿Por qué?")).toBeTruthy();
    expect(screen.getByText(/Última:/)).toBeTruthy();
    expect(screen.getByText("Visita: interesado")).toBeTruthy();
    expect(screen.getByText("Prospecto nuevo: Kiosco Visitado")).toBeTruthy();
  });

  it("la Actividad incluye los hechos nuevos del ciclo (builders de la lib)", () => {
    montar({ prospects: [vencido], visits: [] });
    irA("Esperando");
    fireEvent.click(screen.getByText(/Kiosco Vencido/));
    expect(screen.getByText("Presentación enviada")).toBeTruthy();
  });

  it("la procedencia del descubrimiento se muestra cuando corresponde", () => {
    montar({ prospects: [conTelefono], visits: [] });
    irA("Contactar");
    fireEvent.click(screen.getByText(/Kiosco Contactar/));
    expect(screen.getByText(/Descubierto/)).toBeTruthy();
  });

  it("✏️ Editar abre el form compartido con los datos cargados", () => {
    abrirFicha();
    fireEvent.click(screen.getByText("✏️ Editar"));
    expect(screen.getByText("Editar prospecto")).toBeTruthy();
    expect(screen.getByDisplayValue("Kiosco Visitado")).toBeTruthy();
  });

  it("🗑 Borrar borra (fuente compartida) y cierra la Ficha", () => {
    const { setProspects } = abrirFicha();
    fireEvent.click(screen.getByText("🗑 Borrar"));
    expect(setProspects.mock.calls[0][0]([{ ...visitado }])[0].isDeleted).toBe(true);
    expect(screen.queryByText("Ficha — Kiosco Visitado")).toBeNull();
  });

  it("desde el Embudo también se abre la Ficha (onOpenFicha)", () => {
    montar();
    fireEvent.click(screen.getByText("🎯 Embudo"));
    fireEvent.click(screen.getAllByText(/Kiosco Visitado/)[0]);
    expect(screen.getByText("Ficha — Kiosco Visitado")).toBeTruthy();
  });
});

describe("Prospectos — renglón de Google Maps en las cards (micro-iteración)", () => {
  const conMaps = {
    ...conTelefono, id: "p-maps", businessName: "Kiosco Maps", zone: "Microcentro",
    rating: 4.7, reviewsCount: 33, phone: "011 5555-1234", address: "Florida 550",
    urlOrigen: "https://maps.google.com/?cid=999",
  };

  it("las cards muestran ★/📞/dirección y el link 🗺️ Maps a la ficha real", () => {
    montar({ prospects: [conMaps], visits: [] });
    irA("Contactar");
    expect(screen.getByText(/★ 4.7 \(33\) · 📞 011 5555-1234 · Florida 550/)).toBeTruthy();
    const link = screen.getByText("🗺️ Maps");
    expect(link.getAttribute("href")).toBe("https://maps.google.com/?cid=999");
    // El link NO abre la Ficha (stopPropagation).
    fireEvent.click(link);
    expect(screen.queryByText("Ficha — Kiosco Maps")).toBeNull();
  });

  it("sin datos de Maps la card no muestra el renglón (cero ruido)", () => {
    montar({ prospects: [{ id: "p-pelado", businessName: "Kiosco Pelado", zone: "X", phone: "11-1" }], visits: [] });
    irA("Contactar");
    expect(screen.queryByText("🗺️ Maps")).toBeNull();
  });
});

describe("Prospectos — acciones del módulo", () => {
  it("📋 Visita abre el modal compartido y registra", () => {
    const { setVisits } = montar();
    irA("Visitar");
    fireEvent.click(screen.getByText("📋 Visita"));
    expect(screen.getByText(/Visita — Kiosco Visitar/)).toBeTruthy();
    fireEvent.click(screen.getByText("Registrar"));
    const nuevas = setVisits.mock.calls[0][0]([]);
    expect(nuevas[0].targetId).toBe("p-visitar");
    expect(nuevas[0].byUser).toBe("Diego");
  });

  it("+ Nuevo prospecto abre el alta compartida y crea", () => {
    const { setProspects } = montar();
    fireEvent.click(screen.getByText("+ Nuevo prospecto"));
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Kiosco Nuevo" } });
    fireEvent.click(screen.getByText("Crear"));
    const lista = setProspects.mock.calls[0][0]([]);
    expect(lista[0].businessName).toBe("Kiosco Nuevo");
    expect(lista[0].id).toBeTruthy();
  });
});
