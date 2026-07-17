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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

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

    // El nav renderiza visibleNavItems (el useMemo del bug original):
    // los items mayoristas del pivote tienen que estar en el DOM.
    expect(screen.getAllByText("Kioscos").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Panel mayorista").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rutas").length).toBeGreaterThan(0);
  });

  it("monta directo a sesión iniciada (usuario ya logueado al abrir)", async () => {
    render(<App />);

    // Simula el caso real de Diego: sesión persistida, auth resuelve directo
    // con usuario. loading → app completa en un solo salto.
    await act(async () => {
      authState.callback({ uid: "diego", email: "dcontro20@gmail.com" });
    });

    expect(screen.getAllByText("Kioscos").length).toBeGreaterThan(0);
  });
});
