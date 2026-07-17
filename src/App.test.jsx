// Smoke test de App.jsx — NO testea lógica de negocio (eso vive en las libs
// puras). Testea el ciclo de montaje real del componente raíz:
//
//   loading (authLoading) → login (!currentUser) → sesión iniciada
//
// Ese recorrido cruza los dos early returns de App. Si algún hook queda
// declarado DESPUÉS de esos returns (violación de Rules of Hooks), React
// tira "Rendered more hooks than during the previous render" al pasar de
// login a sesión — exactamente el bug de pantalla en blanco del 2026-07-16
// (useMemo de visibleNavItems declarado después del return de login).
// Las 1015 pruebas puras no lo detectaban porque ninguna renderiza App.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, within, fireEvent, waitFor, cleanup } from "@testing-library/react";

// Holder hoisted para capturar el callback de onAuthChange y poder disparar
// las transiciones de auth desde el test.
const authState = vi.hoisted(() => ({ callback: null }));

// Superficie completa de firebase.js que consumen App.jsx y useFirebaseSync.js.
// subscribeToFirestore nunca responde: syncStatus queda "connecting", que es
// suficiente para montar el layout sin tocar red ni Firestore.
vi.mock("./firebase.js", () => ({
  auth: {},
  db: {},
  firebaseApp: {},
  APP_CHECK_SITE_KEY: "",
  onAuthChange: (cb) => { authState.callback = cb; return () => { authState.callback = null; }; },
  getUserProfile: (u) => (u ? { name: "Diego", color: "#1E2B4A", icon: "👤", role: "owner", email: u.email, uid: u.uid } : null),
  loginWithEmail: vi.fn(async () => {}),
  logout: vi.fn(async () => {}),
  updatePresence: vi.fn(async () => {}),
  subscribePresence: () => () => {},
  saveToFirestore: vi.fn(async () => {}),
  mergeIntoFirestore: vi.fn(async () => {}),
  subscribeToFirestore: () => () => {},
  clearFirestoreCache: vi.fn(async () => {}),
  lastKnownTimestamps: {},
  lastWriteError: null,
  clearWriteError: vi.fn(),
  isOwner: () => true,
  canDelete: () => true,
  canViewFinances: () => true,
}));

// useFirebaseSync importa onAuthStateChanged directo de firebase/auth.
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth, cb) => { cb({ uid: "diego", email: "dcontro20@gmail.com" }); return () => {}; },
}));

// Notification API no existe en jsdom.
vi.mock("./lib/notifications.js", () => ({
  scheduleDailyNotifications: vi.fn(),
  cancelScheduled: vi.fn(),
  hasPermission: () => false,
}));

import App from "./App.jsx";

// App monta 3 chunks lazy apenas hay sesión: la página default (Dashboard) y
// los FABs QuickSale/QuickWithdrawal (siempre montados, con open=false). Si el
// test termina con esos import() en vuelo, rechazan con EnvironmentTeardownError
// cuando vitest desmonta el entorno (flaky, ~1 de cada 3 corridas). Importarlos
// acá los deja resueltos en la caché del module runner antes de cerrar el test.
const drainLazyChunks = () => act(async () => {
  await Promise.all([
    import("./components/Dashboard.jsx"),
    import("./components/DashboardMayorista.jsx"), // home en modo mayorista (default)
    import("./components/QuickSale.jsx"),
    import("./components/QuickWithdrawal.jsx"),
  ]);
});

// El <nav> del sidebar — para asertar sobre el menú sin falsos positivos
// con textos del contenido de la página.
const getNav = () => document.querySelector("nav");

// Con globals:false vitest no registra el auto-cleanup de testing-library:
// sin esto los renders se acumulan entre tests (queries duplicadas).
afterEach(() => cleanup());

beforeEach(() => {
  localStorage.clear();
  authState.callback = null;
  // dolarapi / CriptoYa: sin red en tests.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
});

describe("App — smoke de montaje (Rules of Hooks)", () => {
  it("monta loading → login → sesión sin romper el orden de hooks", async () => {
    render(<App />);

    // 1) Auth resolviendo → pantalla de carga (primer early return)
    expect(screen.getByText("Cargando...")).toBeTruthy();
    expect(authState.callback).toBeTypeOf("function");

    // 2) Auth resuelve SIN usuario → pantalla de login (segundo early return)
    await act(async () => { authState.callback(null); });
    expect(screen.getByText("Entrar")).toBeTruthy();

    // 3) Login → layout completo. Acá render pasa de N hooks (early return)
    //    a todos los hooks de App: un hook condicional explota en este paso.
    await act(async () => {
      authState.callback({ uid: "diego", email: "dcontro20@gmail.com" });
    });

    // El nav renderiza visibleNavItems (el useMemo del bug original).
    // Default: modo MINORISTA (decisión Diego 2026-07-17) → se ven las
    // pantallas minoristas + compartidas.
    const nav = getNav();
    expect(within(nav).getByText("Dashboard")).toBeTruthy();
    expect(within(nav).getByText("Ventas")).toBeTruthy();
    expect(within(nav).getByText("Clientes")).toBeTruthy();
    // Compartidas visibles en ambos modos
    expect(within(nav).getByText("Stock")).toBeTruthy();
    expect(within(nav).getByText("Caja")).toBeTruthy();
    // Aserción inversa (Tanda F.1): las pantallas del otro modo NO aparecen
    // en el nav — el modo FILTRA, no reordena.
    expect(within(nav).queryByText("Kioscos")).toBeNull();
    expect(within(nav).queryByText("Panel mayorista")).toBeNull();
    expect(within(nav).queryByText("Rutas")).toBeNull();

    await drainLazyChunks();
  });

  it("monta directo a sesión iniciada (usuario ya logueado al abrir)", async () => {
    render(<App />);

    // Simula el caso real de Diego: sesión persistida, auth resuelve directo
    // con usuario. loading → app completa en un solo salto.
    await act(async () => {
      authState.callback({ uid: "diego", email: "dcontro20@gmail.com" });
    });

    expect(screen.getAllByText("Ventas").length).toBeGreaterThan(0);

    await drainLazyChunks();
  });

  it("cambiar de modo filtra el nav y redirige al home del modo nuevo", async () => {
    render(<App />);
    await act(async () => {
      authState.callback({ uid: "diego", email: "dcontro20@gmail.com" });
    });

    // Default: modo minorista, parado en Dashboard (pantalla exclusiva)
    expect(within(getNav()).queryByText("Kioscos")).toBeNull();

    // Cambiar a mayorista con el toggle del topbar
    await act(async () => {
      fireEvent.click(screen.getByTitle("Modo mayorista"));
    });

    // El nav ahora muestra las mayoristas y oculta las minoristas...
    const nav = getNav();
    expect(within(nav).getByText("Kioscos")).toBeTruthy();
    expect(within(nav).getByText("Panel mayorista")).toBeTruthy();
    expect(within(nav).queryByText("Ventas")).toBeNull();
    expect(within(nav).queryByText("Dashboard")).toBeNull();
    // ...las compartidas siguen
    expect(within(nav).getByText("Stock")).toBeTruthy();

    // Redirect: estaba en Dashboard (no existe en mayorista) → va al Panel
    // mayorista (aparece su h2 "📊 Panel mayorista", además del label del
    // nav — por eso regex y no string exacto).
    await waitFor(() => {
      expect(screen.getAllByText(/Panel mayorista/).length).toBeGreaterThan(1);
    });

    await drainLazyChunks();
  });

  it("topbar mobile (375px): ☰ y toggle visibles, sin logo-texto ni chips de usuario", async () => {
    const prevWidth = window.innerWidth;
    window.innerWidth = 375;
    window.dispatchEvent(new Event("resize"));
    try {
      render(<App />);
      await act(async () => {
        authState.callback({ uid: "diego", email: "dcontro20@gmail.com" });
      });

      // Siempre visibles en el topbar mobile: ☰ (44px, display flex) y toggle
      const burger = screen.getByLabelText("Abrir menú");
      expect(burger.style.display).toBe("flex");
      expect(screen.getByTitle("Modo mayorista")).toBeTruthy();
      expect(screen.getByTitle("Modo minorista")).toBeTruthy();

      // El logo-texto NO se renderiza en mobile (solo el isotipo LogoMark):
      // era lo que desbordaba y quedaba abajo del toggle (bug 2026-07-17).
      expect(screen.queryByText("IMPORTS")).toBeNull();
      expect(screen.queryByText("ZONA NORTE")).toBeNull();

      // ⚙️ y usuario se mudaron del topbar al menú ☰
      expect(screen.queryByLabelText("Configuración")).toBeNull();
      const nav = getNav();
      expect(within(nav).getByText("Ajustes")).toBeTruthy();
      expect(within(nav).getByText("Cerrar sesión")).toBeTruthy();
      expect(within(nav).getByText("Diego")).toBeTruthy();

      await drainLazyChunks();
    } finally {
      window.innerWidth = prevWidth;
      window.dispatchEvent(new Event("resize"));
    }
  });
});
