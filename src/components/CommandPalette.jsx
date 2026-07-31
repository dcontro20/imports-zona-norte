import { useState, useEffect, useMemo, useRef } from "react";
import { useResponsive } from "../App.jsx";
import { useBodyScrollLock } from "./UI.jsx";

// Command palette estilo Linear / Notion. Se abre con Cmd+K (Mac) o Ctrl+K (PC).
// Lista TODAS las acciones del sistema con fuzzy match. Diego salta a
// cualquier lado o ejecuta acciones rápidas en 2 teclas.

const DEFAULT_COMMANDS = (ctx) => [
  // === Navegación ===
  { id: "go-dashboard", title: "Ir a Dashboard", icon: "📊", group: "Navegar", action: () => ctx.onNavigate("dashboard"), keywords: "home inicio" },
  { id: "go-sales", title: "Ir a Ventas", icon: "🛒", group: "Navegar", action: () => ctx.onNavigate("sales") },
  { id: "go-procurement", title: "Ir a Compras", icon: "🚚", group: "Navegar", action: () => ctx.onNavigate("procurement"), keywords: "pedidos proveedores" },
  { id: "go-products", title: "Ir a Stock / Productos", icon: "📦", group: "Navegar", action: () => ctx.onNavigate("products"), keywords: "inventario" },
  { id: "go-cash", title: "Ir a Caja", icon: "💰", group: "Navegar", action: () => ctx.onNavigate("cash"), keywords: "dinero saldo movimientos" },
  { id: "go-offers", title: "Ir a Mensajes", icon: "📲", group: "Navegar", action: () => ctx.onNavigate("offers"), keywords: "whatsapp ofertas promos" },
  { id: "go-clients", title: "Ir a Clientes", icon: "👥", group: "Navegar", action: () => ctx.onNavigate("clients") },
  { id: "go-expenses", title: "Ir a Gastos", icon: "💸", group: "Navegar", action: () => ctx.onNavigate("expenses") },
  { id: "go-withdrawals", title: "Ir a Mermas", icon: "📉", group: "Navegar", action: () => ctx.onNavigate("withdrawals"), keywords: "consumo garantia" },
  { id: "go-analisis", title: "Ir a Análisis", icon: "📈", group: "Navegar", action: () => ctx.onNavigate("analisis"), keywords: "finanzas reportes patrimonio contabilidad" },
  { id: "go-pricelog", title: "Ir a Precios", icon: "💲", group: "Navegar", action: () => ctx.onNavigate("pricelog") },
  { id: "go-stocklog", title: "Ir a Historial", icon: "📋", group: "Navegar", action: () => ctx.onNavigate("stocklog") },
  { id: "go-exchange", title: "Ir a Cotizaciones", icon: "💱", group: "Navegar", action: () => ctx.onNavigate("exchange"), keywords: "dolar blue" },
  { id: "go-export", title: "Ir a Exportar", icon: "📥", group: "Navegar", action: () => ctx.onNavigate("export"), keywords: "backup csv" },
  { id: "go-audit", title: "Ir a Auditoría", icon: "🔍", group: "Navegar", action: () => ctx.onNavigate("audit"), keywords: "log historial cambios" },

  // === Mayorista (pivote B2B) ===
  { id: "go-dashMayorista", title: "Ir a Panel mayorista", icon: "📊", group: "Mayorista", action: () => ctx.onNavigate("dashMayorista"), keywords: "b2b dashboard kioscos kpi pnl" },
  { id: "go-kioscos", title: "Ir a Kioscos", icon: "🏪", group: "Mayorista", action: () => ctx.onNavigate("kioscos"), keywords: "mayorista clientes b2b comercios" },
  { id: "go-wholesaleOrder", title: "Nuevo pedido mayorista", icon: "🧾", group: "Mayorista", action: () => ctx.onNavigate("wholesaleOrder"), keywords: "pedido b2b vender kiosco tier" },
  { id: "go-prospectos", title: "Ir a Prospectos (CRM)", icon: "🎯", group: "Mayorista", action: () => ctx.onNavigate("prospectos"), keywords: "prospectos captacion crm hoy descubrir" },
  { id: "go-pipeline", title: "Ir a Embudo (kanban)", icon: "📋", group: "Mayorista", action: () => ctx.onNavigate("pipeline"), keywords: "pipeline captacion embudo leads kanban" },
  { id: "go-prospectMap", title: "Ir a Zonas de prospección", icon: "🗺️", group: "Mayorista", action: () => ctx.onNavigate("prospectMap"), keywords: "zonas cobertura mapa prospeccion" },
  { id: "go-routes", title: "Ir a Rutas", icon: "🚚", group: "Mayorista", action: () => ctx.onNavigate("routes"), keywords: "reparto entrega paradas hoja" },
  { id: "go-cuentasCorrientes", title: "Ir a Cuentas corrientes", icon: "💳", group: "Mayorista", action: () => ctx.onNavigate("cuentasCorrientes"), keywords: "cobranza deuda fiado credito" },

  // === Acciones rápidas ===
  { id: "act-quick-sale", title: "Nueva venta rápida", icon: "⚡", group: "Acciones", action: () => ctx.onAction("quickSale"), keywords: "vender consumo" },
  { id: "act-quick-withdrawal", title: "Anotar consumo propio", icon: "📉", group: "Acciones", action: () => ctx.onAction("quickWithdrawal"), keywords: "merma fume" },
  { id: "act-settings", title: "Abrir Ajustes", icon: "⚙️", group: "Acciones", action: () => ctx.onAction("settings"), keywords: "configuracion" },
];

// Fuzzy match simple: cada char del query debe aparecer en orden en el title+keywords
function fuzzyMatch(query, text) {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return true;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function CommandPalette({ open, onClose, onNavigate, onAction }) {
  const { isMobile } = useResponsive();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);
  useBodyScrollLock(open);

  const commands = useMemo(
    () => DEFAULT_COMMANDS({ onNavigate, onAction }),
    [onNavigate, onAction]
  );

  const filtered = useMemo(() => {
    if (!query) return commands;
    return commands.filter(c => fuzzyMatch(query, `${c.title} ${c.keywords || ""}`));
  }, [query, commands]);

  // Auto-focus al input al abrir + reset
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset selected index si filtered cambia
  useEffect(() => { setSelectedIdx(0); }, [query]);

  // Handlers de teclado
  const handleKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(i => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(i => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[selectedIdx];
      if (cmd) {
        cmd.action();
        onClose();
      }
    }
  };

  if (!open) return null;

  // Agrupar por group
  const grouped = {};
  filtered.forEach(c => {
    const g = c.group || "Otros";
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(c);
  });

  let globalIdx = 0;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,18,28,0.5)",
      zIndex: 2000, display: "flex", alignItems: isMobile ? "flex-end" : "flex-start",
      justifyContent: "center", paddingTop: isMobile ? 0 : "10vh",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#FFFFFF",
        width: "100%", maxWidth: 600,
        borderRadius: isMobile ? "16px 16px 0 0" : 16,
        overflow: "hidden", boxShadow: "0 24px 48px rgba(15,15,15,0.18)",
        maxHeight: isMobile ? "80dvh" : "70vh", display: "flex", flexDirection: "column",
      }}>
        {/* Input */}
        <div style={{ padding: 12, borderBottom: "1px solid #E5DAC2" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar acción o pantalla…"
            style={{
              width: "100%", padding: "12px 14px", background: "#F8F2E7",
              border: "1px solid #E5DAC2", borderRadius: 10, fontSize: 16,
              outline: "none", boxSizing: "border-box", color: "#1E2B4A",
            }}
          />
        </div>

        {/* Resultados */}
        <div style={{ overflowY: "auto", flex: 1, padding: 8 }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "#9AA2B3", fontSize: 13 }}>
              Sin resultados
            </div>
          )}
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} style={{ marginBottom: 8 }}>
              <div style={{
                fontSize: 10, fontWeight: 800, color: "#9AA2B3",
                textTransform: "uppercase", letterSpacing: 0.5, padding: "6px 12px",
              }}>{group}</div>
              {items.map(cmd => {
                const isSelected = globalIdx === selectedIdx;
                const myIdx = globalIdx++;
                return (
                  <button
                    key={cmd.id}
                    onClick={() => { cmd.action(); onClose(); }}
                    onMouseEnter={() => setSelectedIdx(myIdx)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      width: "100%", padding: "10px 12px", minHeight: 44,
                      background: isSelected ? "#F8F2E7" : "transparent",
                      border: "none", borderRadius: 8, cursor: "pointer",
                      fontFamily: "inherit", textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{cmd.icon}</span>
                    <span style={{ flex: 1, fontSize: 14, color: "#1E2B4A", fontWeight: isSelected ? 700 : 500 }}>
                      {cmd.title}
                    </span>
                    {isSelected && (
                      <span style={{ fontSize: 10, color: "#9AA2B3" }}>↵</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer con hints */}
        <div style={{
          padding: "8px 14px", borderTop: "1px solid #E5DAC2",
          fontSize: 11, color: "#9AA2B3", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
        }}>
          <span>↑↓ navegar · ↵ abrir · Esc cerrar</span>
          <span>⌘K para abrir desde cualquier pantalla</span>
        </div>
      </div>
    </div>
  );
}
