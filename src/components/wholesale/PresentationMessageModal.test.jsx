// PresentationMessageModal.test.jsx — el contrato del flujo de contacto
// (handoff 2026-08-10, Cambio 3): **abrir WhatsApp NO registra contacto**.
// Solo la confirmación humana registra el hecho. Lo que se blinda acá:
//   · Mandar por WhatsApp abre el link correcto (549, wa.me/web) y NO llama
//     onEnviado — muestra la pregunta.
//   · 🟢 Sí → onEnviado + tieneWhatsApp true. 🔴 No → nada. 🚫 → solo
//     tieneWhatsApp false, sin contacto.
//   · Teléfono inválido o ausente ⇒ sin botón de WhatsApp.
//   · Copiar ≠ enviar: "Ya lo mandé" registra el hecho pero NO toca
//     tieneWhatsApp (pudo haberlo pegado en Instagram).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// El modal (y UI.jsx) importan useResponsive de App.jsx, que arrastra todo el
// árbol de la app. Se mockea el módulo entero: acá solo importa isMobile.
const pantalla = vi.hoisted(() => ({ isMobile: false }));
vi.mock("../../App.jsx", () => ({ useResponsive: () => ({ isMobile: pantalla.isMobile }) }));

import { PresentationMessageModal } from "./PresentationMessageModal.jsx";
import { AppContext } from "../../AppContext.js";

// Con globals:false vitest no auto-registra el cleanup de testing-library.
// restoreAllMocks: el spy de window.open es el MISMO entre tests (vi.spyOn
// sobre un método ya espiado devuelve el existente) — sin restore, calls[0]
// sería la llamada del test anterior.
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { pantalla.isMobile = false; });

const CTX = { currentUser: { name: "Gustavo" }, exchangeRate: 1000, logAudit: vi.fn(), logStock: vi.fn() };
const target = (over = {}) => ({
  id: "p-1", businessName: "Kiosco Golden", phone: "011 2363-1422", zone: "Palermo", ...over,
});

function montar(props = {}) {
  const onEnviado = vi.fn(), onMarcarWhatsApp = vi.fn(), onClose = vi.fn();
  const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  render(
    <AppContext.Provider value={CTX}>
      <PresentationMessageModal open target={target(props.target)} onClose={onClose}
        onEnviado={onEnviado} onMarcarWhatsApp={onMarcarWhatsApp} {...props.modal} />
    </AppContext.Provider>,
  );
  return { onEnviado, onMarcarWhatsApp, onClose, openSpy };
}

describe("abrir WhatsApp NO registra contacto", () => {
  it("desktop: abre web.whatsapp.com con el 549 y el texto, sin llamar onEnviado", () => {
    const { onEnviado, onMarcarWhatsApp, openSpy } = montar();
    fireEvent.click(screen.getByText("💬 Mandar por WhatsApp"));

    const url = openSpy.mock.calls[0][0];
    expect(url).toContain("https://web.whatsapp.com/send?phone=5491123631422");
    expect(url).toContain("&text=");
    expect(onEnviado).not.toHaveBeenCalled();
    expect(onMarcarWhatsApp).not.toHaveBeenCalled();
    // Al volver, la pregunta — no una suposición.
    expect(screen.getByText("¿Enviaste el mensaje?")).toBeTruthy();
  });

  it("mobile: mismo flujo pero con wa.me (deep-link a la app)", () => {
    pantalla.isMobile = true;
    const { onEnviado, openSpy } = montar();
    fireEvent.click(screen.getByText("💬 Mandar por WhatsApp"));
    expect(openSpy.mock.calls[0][0]).toContain("https://wa.me/5491123631422?text=");
    expect(onEnviado).not.toHaveBeenCalled();
  });
});

describe("la confirmación humana decide", () => {
  it("🟢 Sí, mensaje enviado → registra el hecho Y marca tieneWhatsApp true", () => {
    const { onEnviado, onMarcarWhatsApp, onClose } = montar();
    fireEvent.click(screen.getByText("💬 Mandar por WhatsApp"));
    fireEvent.click(screen.getByText("🟢 Sí, mensaje enviado"));

    expect(onEnviado).toHaveBeenCalledTimes(1);
    expect(onEnviado.mock.calls[0][0].id).toBe("p-1");
    expect(onMarcarWhatsApp).toHaveBeenCalledWith(expect.objectContaining({ id: "p-1" }), true);
    expect(onClose).toHaveBeenCalled();
  });

  it("🔴 No, no lo envié → NADA se registra y vuelve al mensaje", () => {
    const { onEnviado, onMarcarWhatsApp, onClose } = montar();
    fireEvent.click(screen.getByText("💬 Mandar por WhatsApp"));
    fireEvent.click(screen.getByText("🔴 No, no lo envié"));

    expect(onEnviado).not.toHaveBeenCalled();
    expect(onMarcarWhatsApp).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // De vuelta en el mensaje: puede reintentar o cerrar.
    expect(screen.getByText("💬 Mandar por WhatsApp")).toBeTruthy();
  });

  it("🚫 no está en WhatsApp → tieneWhatsApp false, SIN registrar contacto", () => {
    const { onEnviado, onMarcarWhatsApp, onClose } = montar();
    fireEvent.click(screen.getByText("💬 Mandar por WhatsApp"));
    fireEvent.click(screen.getByText("🚫 El número no está en WhatsApp"));

    expect(onMarcarWhatsApp).toHaveBeenCalledWith(expect.objectContaining({ id: "p-1" }), false);
    expect(onEnviado).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("sin número utilizable no hay botón de WhatsApp", () => {
  it("teléfono inválido: sin botón, con aviso de que no sirve para WhatsApp", () => {
    montar({ target: { phone: "4321-1000" } });
    expect(screen.queryByText("💬 Mandar por WhatsApp")).toBe(null);
    expect(screen.getByText(/no sirve para WhatsApp/)).toBeTruthy();
  });

  it("sin teléfono: sin botón, con el aviso de copiar", () => {
    montar({ target: { phone: "" } });
    expect(screen.queryByText("💬 Mandar por WhatsApp")).toBe(null);
    expect(screen.getByText(/Sin teléfono/)).toBeTruthy();
  });
});

describe("copiar ≠ enviar (y tampoco dice nada de WhatsApp)", () => {
  it("'Ya lo mandé' tras copiar registra el hecho pero NO marca tieneWhatsApp", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.resolve() }, configurable: true,
    });
    const { onEnviado, onMarcarWhatsApp } = montar();
    fireEvent.click(screen.getByText("📋 Copiar"));
    fireEvent.click(await screen.findByText("✅ Ya lo mandé"));

    expect(onEnviado).toHaveBeenCalledTimes(1);
    expect(onMarcarWhatsApp).not.toHaveBeenCalled(); // pudo mandarlo por IG
  });
});
