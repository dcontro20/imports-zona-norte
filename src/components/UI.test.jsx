// Smoke tests de componentes críticos. NO testean lógica de negocio (eso
// está cubierto por las libs puras), solo verifican que renderizan sin
// crashear y que props clave funcionan.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, Btn, Badge, useBodyScrollLock } from "./UI.jsx";

// Mock del useResponsive — necesario porque UI.jsx lo importa de App.jsx
// y App.jsx tira mucha lógica al cargarlo. Lo mockeamos directo.
import { vi } from "vitest";
vi.mock("../App.jsx", () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}));

describe("Card", () => {
  it("renderiza children", () => {
    render(<Card>Contenido test</Card>);
    expect(screen.getByText("Contenido test")).toBeTruthy();
  });

  it("acepta style override", () => {
    const { container } = render(<Card style={{ background: "red" }}>x</Card>);
    expect(container.firstChild.style.background).toBe("red");
  });
});

describe("Btn", () => {
  it("renderiza label", () => {
    render(<Btn>Click me</Btn>);
    expect(screen.getByText("Click me")).toBeTruthy();
  });

  it("dispara onClick", async () => {
    let clicked = false;
    const { getByText } = render(<Btn onClick={() => { clicked = true; }}>Tap</Btn>);
    getByText("Tap").click();
    expect(clicked).toBe(true);
  });

  it("respeta prop disabled", () => {
    const { getByText } = render(<Btn disabled>Off</Btn>);
    expect(getByText("Off").disabled).toBe(true);
  });
});

describe("Badge", () => {
  it("renderiza con color custom", () => {
    render(<Badge color="#FF0000">Importante</Badge>);
    expect(screen.getByText("Importante")).toBeTruthy();
  });
});
