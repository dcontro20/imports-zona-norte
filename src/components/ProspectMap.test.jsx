// ProspectMap.test.jsx — Zonas. Hasta 2026-08-07 esta pantalla era un callejón
// sin salida: decía "Munro tiene 4 prospectos" y no había forma de llegar a
// ninguno. Ahora la zona se despliega y desde ahí se entra a la ficha completa
// —prospecto o kiosco, lo mismo— que es regla del módulo.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent } from "@testing-library/react";

vi.mock("../firebase.js", () => ({
  auth: {}, db: {}, firebaseApp: {}, APP_CHECK_SITE_KEY: "",
  onAuthChange: () => () => {}, getUserProfile: () => null,
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

import { ProspectMap } from "./ProspectMap.jsx";

afterEach(() => cleanup());

const prospects = [
  { id: "p-1", businessName: "Kiosco Munro Uno", zone: "Munro" },
  { id: "p-2", businessName: "Kiosco Munro Dos", zone: "Munro" },
  { id: "p-3", businessName: "Kiosco Tigre", zone: "Tigre" },
  { id: "p-borrado", businessName: "Kiosco Fantasma", zone: "Munro", isDeleted: true },
];
const clients = [{ id: "c-1", type: "mayorista", businessName: "Maxi Munro", zone: "Munro" }];

const montar = (props = {}) => {
  const onOpenFicha = vi.fn(), onOpenKiosco = vi.fn();
  render(<ProspectMap prospects={prospects} clients={clients} sales={[]} products={[]}
    onOpenFicha={onOpenFicha} onOpenKiosco={onOpenKiosco} {...props} />);
  return { onOpenFicha, onOpenKiosco };
};

const zona = (nombre) => screen.getByText(nombre, { selector: "span" }).closest("div").parentElement.parentElement;

describe("Zonas — de contador a puerta de entrada", () => {
  it("la zona arranca cerrada y se despliega al tocarla", () => {
    montar();
    expect(screen.queryByText("Kiosco Munro Uno")).toBeNull();
    fireEvent.click(screen.getByText("Munro", { selector: "span" }));
    expect(screen.getByText("Kiosco Munro Uno")).toBeTruthy();
    expect(screen.getByText("Kiosco Munro Dos")).toBeTruthy();
  });

  it("lista primero lo cerrado y después lo que falta trabajar", () => {
    montar();
    fireEvent.click(screen.getByText("Munro", { selector: "span" }));
    const nombres = within(zona("Munro")).getAllByText(/^(Maxi|Kiosco) /).map(n => n.textContent);
    expect(nombres[0]).toBe("Maxi Munro");
  });

  it("no mezcla zonas ni muestra borrados", () => {
    montar();
    fireEvent.click(screen.getByText("Munro", { selector: "span" }));
    expect(screen.queryByText("Kiosco Tigre")).toBeNull();
    expect(screen.queryByText("Kiosco Fantasma")).toBeNull();
  });

  it("desde la zona se abre la ficha: prospecto y kiosco van a su lugar", () => {
    const { onOpenFicha, onOpenKiosco } = montar();
    fireEvent.click(screen.getByText("Munro", { selector: "span" }));
    fireEvent.click(screen.getByText("Kiosco Munro Uno"));
    expect(onOpenFicha).toHaveBeenCalledWith("p-1");
    fireEvent.click(screen.getByText("Maxi Munro"));
    expect(onOpenKiosco).toHaveBeenCalledWith("c-1");
  });

  it("tocar de nuevo la cierra (una zona por vez, sin ruido)", () => {
    montar();
    const header = screen.getByText("Munro", { selector: "span" });
    fireEvent.click(header);
    expect(screen.getByText("Kiosco Munro Uno")).toBeTruthy();
    fireEvent.click(header);
    expect(screen.queryByText("Kiosco Munro Uno")).toBeNull();
  });
});
