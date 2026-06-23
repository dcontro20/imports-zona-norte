import { useState, useMemo } from "react";
import { Card, Btn, StatCard } from "./UI.jsx";
import { useAppContext } from "../AppContext.js";
import {
  generateFullMessage,
  generateShortMessage,
  quickMessageStats,
} from "../lib/whatsappMessage.js";

// POC de migración props-drilling → AppContext.
// exchangeRate ahora se consume via useAppContext() en lugar de recibirse como prop.
// App.jsx mantiene el prop por compat pero se puede ignorar acá.
export const WhatsAppMessage = ({ products }) => {
  const { exchangeRate } = useAppContext();
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState("full"); // "full" | "short" | "custom"
  const [customTemplates, setCustomTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem("vapestock_waTemplates") || "[]"); } catch { return []; }
  });
  const [activeTemplateId, setActiveTemplateId] = useState(null);

  const fullMessage = useMemo(() => generateFullMessage(products, exchangeRate), [products, exchangeRate]);
  const shortMessage = useMemo(() => generateShortMessage(products, exchangeRate), [products, exchangeRate]);
  const stats = useMemo(() => quickMessageStats(products), [products]);

  // Persiste templates custom en localStorage
  const persistTemplates = (next) => {
    setCustomTemplates(next);
    try { localStorage.setItem("vapestock_waTemplates", JSON.stringify(next)); } catch {}
  };
  const saveCurrentAsTemplate = () => {
    const name = prompt("Nombre del template (ej: 'Promo viernes'):");
    if (!name || !name.trim()) return;
    const baseMessage = mode === "short" ? shortMessage : fullMessage;
    const next = [...customTemplates, { id: Date.now().toString(36), name: name.trim(), body: baseMessage }];
    persistTemplates(next);
    setActiveTemplateId(next[next.length - 1].id);
    setMode("custom");
  };
  const deleteTemplate = (id) => {
    if (!confirm("¿Eliminar este template?")) return;
    persistTemplates(customTemplates.filter(t => t.id !== id));
    if (activeTemplateId === id) {
      setActiveTemplateId(null);
      setMode("full");
    }
  };
  const updateActiveTemplate = (newBody) => {
    if (!activeTemplateId) return;
    persistTemplates(customTemplates.map(t => t.id === activeTemplateId ? { ...t, body: newBody } : t));
  };
  const activeTemplate = customTemplates.find(t => t.id === activeTemplateId);
  const message = mode === "full" ? fullMessage
    : mode === "short" ? shortMessage
    : (activeTemplate?.body || fullMessage);

  const inStockCount = stats.inStockCount;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = message;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#1E2B4A", margin: 0, fontSize: 22 }}>📲 Mensaje WhatsApp</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4, background: "#E5DAC2", borderRadius: 8, padding: 3 }}>
            <button onClick={() => setMode("full")} style={{
              padding: "10px 14px", minHeight: 40, border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: mode === "full" ? "#FFFFFF" : "transparent", color: mode === "full" ? "#25d366" : "#6B7794",
              boxShadow: mode === "full" ? "0 1px 3px rgba(0,0,0,0.08)" : "none"
            }}>Completo</button>
            <button onClick={() => setMode("short")} style={{
              padding: "10px 14px", minHeight: 40, border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: mode === "short" ? "#FFFFFF" : "transparent", color: mode === "short" ? "#e1306c" : "#6B7794",
              boxShadow: mode === "short" ? "0 1px 3px rgba(0,0,0,0.08)" : "none"
            }}>Stories</button>
          </div>
          <button onClick={saveCurrentAsTemplate} style={{
            padding: "5px 10px", borderRadius: 6, border: "1px solid #1E2B4A",
            background: "#1E2B4A15", color: "#1E2B4A", fontSize: 11, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }} title="Guardar mensaje actual como template reutilizable">★ Guardar template</button>
          <Btn onClick={copyToClipboard} style={{ background: copied ? "linear-gradient(135deg, #00b894, #00cec9)" : "linear-gradient(135deg, #25d366, #128c7e)" }}>
            {copied ? "✅ Copiado!" : "📋 Copiar"}
          </Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="En el mensaje" value={stats.inStockCount} icon="✅" color="#00b894" />
        <StatCard label="Modelos activos" value={stats.activeModels} icon="📦" color="#1E2B4A" />
        <StatCard label="Unidades disponibles" value={stats.totalUnits} icon="🔥" color="#fdcb6e" />
      </div>

      <Card style={{ marginBottom: 14, background: "#F8F2E7", border: "1px solid #25d36644" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>💡</span>
          <span style={{ color: "#25d366", fontSize: 13, fontWeight: 600 }}>
            Solo aparecen los productos con stock disponible. Cuando se agota un sabor, desaparece automáticamente. Si se agota un modelo entero, se oculta la sección completa.
          </span>
        </div>
      </Card>

      {customTemplates.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <h4 style={{ margin: "0 0 10px", fontSize: 12, color: "#1E2B4A", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
            ⭐ Templates guardados
          </h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {customTemplates.map(t => {
              const isActive = mode === "custom" && activeTemplateId === t.id;
              return (
                <span key={t.id} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "5px 8px 5px 10px", borderRadius: 999,
                  background: isActive ? "#EAECF9" : "#F8F2E7",
                  border: `1px solid ${isActive ? "#1E2B4A" : "#E5DAC2"}`,
                }}>
                  <button onClick={() => { setActiveTemplateId(t.id); setMode("custom"); }} style={{
                    background: "transparent", border: "none", color: isActive ? "#1E2B4A" : "#1E2B4A",
                    cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0, fontFamily: "inherit",
                  }}>{t.name}</button>
                  <button onClick={() => deleteTemplate(t.id)} style={{
                    background: "transparent", border: "none", color: "#6B7794",
                    cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1,
                  }} aria-label="Eliminar template">×</button>
                </span>
              );
            })}
          </div>
          {mode === "custom" && activeTemplate && (
            <textarea
              value={activeTemplate.body}
              onChange={e => updateActiveTemplate(e.target.value)}
              rows={8}
              style={{
                width: "100%", marginTop: 10, padding: 10, borderRadius: 6,
                border: "1px solid #E5DAC2", fontSize: 16, fontFamily: "monospace",
                background: "#FFF", color: "#1E2B4A", resize: "vertical", outline: "none",
                boxSizing: "border-box",
              }}
            />
          )}
        </Card>
      )}
      <Card>
        <div style={{
          whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 13, color: "#3A4868",
          lineHeight: 1.7, maxHeight: 600, overflowY: "auto", padding: 8
        }}>
          {message.split("\n").map((line, i) => {
            const isBold = line.includes("*") && line.split("*").length >= 3;
            const isHeader = line.startsWith("🔥") || line.startsWith("*IG") || line.startsWith("📲") || line.startsWith("---");

            if (isBold) {
              const parts = line.split("*");
              return (
                <div key={i} style={{ color: isHeader ? "#1E2B4A" : "#1E2B4A" }}>
                  {parts.map((part, j) => j % 2 === 1
                    ? <strong key={j}>{part}</strong>
                    : <span key={j}>{part}</span>
                  )}
                </div>
              );
            }

            return <div key={i}>{line}</div>;
          })}
        </div>
      </Card>
    </div>
  );
};
