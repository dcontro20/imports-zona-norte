import { useState, useEffect } from "react";
import { useResponsive } from "../App.jsx";
import { useBodyScrollLock, Btn } from "./UI.jsx";

// Onboarding tour mínimo. Se muestra UNA SOLA VEZ por device
// (localStorage flag). Sirve para explicarle a Diego (o a un usuario nuevo
// si en el futuro hay multi-user) las features clave.

const STORAGE_KEY = "izn_onboardingCompleted_v1";

const STEPS = [
  {
    icon: "👋",
    title: "Bienvenido a IZN",
    body: "Tu sistema de gestión completo: ventas, compras, stock, mensajes, finanzas. Te muestro las features clave en 60 segundos.",
  },
  {
    icon: "📊",
    title: "Dashboard",
    body: "Lo primero que ves cada día. KPIs del período + acción del día sugerida + alertas accionables (urgente / esta semana / oportunidades) que podés colapsar.",
  },
  {
    icon: "📲",
    title: "Mensajes (ex Ofertas)",
    body: "Tu hub de WhatsApp. Mensaje rápido de stock, ideas inteligentes con tracking de conversión, calendario semanal con sugerencias. Cada audiencia tiene su tono.",
  },
  {
    icon: "🛒",
    title: "Venta rápida flotante",
    body: "La burbuja navy abajo a la derecha: tocala para venta rápida o anotar consumo en 2 toques. Disponible en cualquier pantalla.",
  },
  {
    icon: "📈",
    title: "Análisis",
    body: "Toda la salud financiera: Resumen, Proyecciones (cierre del mes, cash 30/60/90, rentabilidad por SKU, what-if), Contabilidad formal (P&L, Balance, conciliación bancaria).",
  },
  {
    icon: "⌘",
    title: "Atajo de productividad",
    body: "Apretá ⌘K (Mac) o Ctrl+K (PC/iPad con teclado) en cualquier momento para abrir el menú de comandos. Saltás a cualquier pantalla en segundos.",
  },
  {
    icon: "🎯",
    title: "Listo",
    body: "Configurá tu meta del mes en ⚙️ Ajustes para tener un norte. Si necesitás reabrir este tour, está en Ajustes.",
  },
];

function isCompleted() {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}

function markCompleted() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
}

export function shouldShowOnboarding() {
  return !isCompleted();
}

export function resetOnboarding() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function OnboardingTour({ open, onClose }) {
  const { isMobile } = useResponsive();
  const [step, setStep] = useState(0);
  useBodyScrollLock(open);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      markCompleted();
      onClose();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSkip = () => {
    markCompleted();
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,18,28,0.6)",
      zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: "#FFFFFF", borderRadius: 18,
        width: "100%", maxWidth: 480,
        padding: isMobile ? 24 : 32,
        boxShadow: "0 24px 48px rgba(15,15,15,0.18)",
      }}>
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 24 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 8, height: 8, borderRadius: 4,
              background: i === step ? "#1E2B4A" : i < step ? "#9AA2B3" : "#E5DAC2",
              transition: "all 0.2s",
            }} />
          ))}
        </div>

        {/* Icon + Title + Body */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{current.icon}</div>
          <h2 style={{
            margin: 0, fontSize: 22, color: "#1E2B4A", fontWeight: 800,
            marginBottom: 12,
          }}>{current.title}</h2>
          <p style={{
            margin: 0, fontSize: 14, color: "#6B7794", lineHeight: 1.6,
          }}>{current.body}</p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
          <button onClick={handleSkip} style={{
            background: "transparent", border: "none", color: "#9AA2B3",
            fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            padding: "10px 12px",
          }}>Saltar</button>
          <Btn onClick={handleNext}>
            {isLast ? "✓ Empezar a usar" : "Siguiente →"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
