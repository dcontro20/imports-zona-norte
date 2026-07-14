import { useState, useMemo } from "react";
import { uid, formatDate, formatMoney } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Card, Btn, Modal, Input, StatCard } from "./UI.jsx";
import { T } from "../theme.js";
import { useAppContext } from "../AppContext.js";
import {
  pendingWholesaleOrders, groupOrdersByZone, buildRouteStops,
  resolveStop, routeTotals, moveStop,
} from "../routes.js";
import { generateRouteSheet } from "../lib/routeSheet.js";

// Rutas de reparto (nivel básico). Crear ruta para una fecha eligiendo pedidos
// mayoristas pendientes (agrupados por zona), ordenar paradas a mano, y marcar
// entregado/cobrado por parada. Hoja de ruta copiable. Sin GPS ni optimización.

const ROUTE_STATUS_FLOW = ["planificada", "en_curso", "cerrada"];
const STOP_STYLE = {
  pendiente: { label: "Pendiente", color: T.textMuted, bg: T.borderSoft },
  entregado: { label: "Entregado", color: T.green, bg: T.greenBg },
  no_estaba: { label: "No estaba", color: T.red, bg: T.redBg },
  reprogramar: { label: "Reprogramar", color: T.amber, bg: T.amberBg },
};

export function Routes({ routes = [], setRoutes, clients = [], sales = [], setSales }) {
  const { isMobile } = useResponsive();
  const { logAudit, currentUser } = useAppContext();

  const [openId, setOpenId] = useState(null);     // ruta abierta (detalle)
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", date: new Date().toISOString().slice(0, 10) });
  const [selected, setSelected] = useState({});   // { orderId: true }
  const [toast, setToast] = useState("");

  const activeRoutes = useMemo(() => routes.filter(r => r && !r.isDeleted), [routes]);
  const pending = useMemo(() => pendingWholesaleOrders(sales), [sales]);
  const pendingByZone = useMemo(() => groupOrdersByZone(pending, clients), [pending, clients]);
  const openRoute = activeRoutes.find(r => r.id === openId) || null;

  const now = () => new Date().toISOString();
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 3000); };
  const clientName = (id) => { const c = clients.find(x => x.id === id); return c?.businessName || c?.name || "Cliente"; };

  // --- Crear ruta ---
  const openCreate = () => { setForm({ name: "", date: new Date().toISOString().slice(0, 10) }); setSelected({}); setCreateOpen(true); };
  const createRoute = () => {
    const chosen = pending.filter(o => selected[o.id]);
    if (chosen.length === 0) { flash("Elegí al menos un pedido"); return; }
    const id = uid();
    const stops = buildRouteStops(chosen);
    const totals = routeTotals({ stops }, sales);
    const route = {
      id, name: form.name.trim() || `Ruta ${formatDate(form.date)}`, date: form.date,
      status: "planificada", stops,
      totalUnits: totals.totalUnits, totalARS: totals.totalARS, estimatedKm: null,
      byUser: currentUser?.name || "?", createdAt: now(),
    };
    setRoutes(prev => [route, ...prev]);
    // marcar los pedidos como asignados a la ruta (armado)
    setSales(prev => prev.map(s => selected[s.id] ? { ...s, routeId: id, fulfillmentStatus: "armado" } : s));
    logAudit?.("create", "route", id, `Ruta creada: ${route.name} · ${stops.length} paradas · ${formatMoney(route.totalARS)}`);
    setCreateOpen(false);
    setOpenId(id);
  };

  const updateRoute = (id, fn) => setRoutes(prev => prev.map(r => r.id === id ? fn(r) : r));

  // --- Estado de la ruta ---
  const advanceRouteStatus = (r) => {
    const i = ROUTE_STATUS_FLOW.indexOf(r.status || "planificada");
    const next = ROUTE_STATUS_FLOW[Math.min(i + 1, ROUTE_STATUS_FLOW.length - 1)];
    updateRoute(r.id, x => ({ ...x, status: next }));
    if (next === "en_curso") {
      // pedidos no entregados/cobrados pasan a en_ruta
      setSales(prev => prev.map(s => s.routeId === r.id && s.fulfillmentStatus !== "entregado" && s.fulfillmentStatus !== "cobrado" ? { ...s, fulfillmentStatus: "en_ruta" } : s));
    }
  };

  // --- Estado por parada ---
  const setStopStatus = (r, idx, status) => {
    updateRoute(r.id, x => ({ ...x, stops: x.stops.map((s, i) => i === idx ? { ...s, status, deliveredAt: status === "entregado" ? now() : s.deliveredAt } : s) }));
    const orderId = r.stops[idx].orderId;
    if (status === "entregado") {
      setSales(prev => prev.map(s => s.id === orderId ? { ...s, fulfillmentStatus: "entregado" } : s));
    }
  };
  const markCobrado = (r, idx) => {
    const orderId = r.stops[idx].orderId;
    setSales(prev => prev.map(s => s.id === orderId ? { ...s, fulfillmentStatus: "cobrado" } : s));
    updateRoute(r.id, x => ({ ...x, stops: x.stops.map((s, i) => i === idx ? { ...s, status: "entregado", deliveredAt: s.deliveredAt || now() } : s) }));
    flash("Marcado como cobrado");
  };
  const reorder = (r, idx, dir) => updateRoute(r.id, x => ({ ...x, stops: moveStop(x.stops, idx, dir) }));

  // --- Borrar ruta (libera los pedidos) ---
  const deleteRoute = (r) => {
    updateRoute(r.id, x => ({ ...x, isDeleted: true, deletedAt: now(), deletedBy: currentUser?.name || "?" }));
    setSales(prev => prev.map(s => s.routeId === r.id && s.fulfillmentStatus !== "entregado" && s.fulfillmentStatus !== "cobrado"
      ? { ...s, routeId: null, fulfillmentStatus: "pendiente" } : s));
    logAudit?.("delete", "route", r.id, `Ruta borrada: ${r.name}`);
    setOpenId(null);
    flash("Ruta borrada — pedidos liberados");
  };

  const copySheet = (r) => {
    const text = generateRouteSheet(r, { clients, sales });
    navigator.clipboard?.writeText(text).then(() => flash("Hoja de ruta copiada")).catch(() => flash("No se pudo copiar"));
  };

  // ============ DETALLE DE RUTA ============
  if (openRoute) {
    const totals = routeTotals(openRoute, sales);
    const stops = [...(openRoute.stops || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <button onClick={() => setOpenId(null)} style={{ border: "none", background: "transparent", color: T.blue, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 4 }}>← Volver a rutas</button>
            <h2 style={{ color: T.text, margin: 0, fontSize: 22 }}>🚚 {openRoute.name}</h2>
            <div style={{ fontSize: 13, color: T.textMuted }}>{formatDate(openRoute.date)} · {openRoute.status}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn variant="secondary" onClick={() => copySheet(openRoute)}>📋 Copiar hoja</Btn>
            {openRoute.status !== "cerrada" && <Btn onClick={() => advanceRouteStatus(openRoute)}>{openRoute.status === "planificada" ? "▶ Iniciar" : "✓ Cerrar"}</Btn>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
          <StatCard label="Paradas" value={totals.stops} icon="📍" color={T.blue} />
          <StatCard label="Unidades" value={totals.totalUnits} icon="📦" color={T.amber} />
          <StatCard label="A cobrar" value={formatMoney(totals.totalARS)} icon="💵" color={T.green} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stops.map((st, i) => {
            const r = resolveStop(st, { clients, sales });
            const ss = STOP_STYLE[st.status] || STOP_STYLE.pendiente;
            const cobrado = r.sale?.fulfillmentStatus === "cobrado";
            return (
              <Card key={st.orderId}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: "1 1 200px" }}>
                    <div style={{ fontWeight: 800, color: T.text }}>{i + 1}. {r.name}</div>
                    {r.address && <div style={{ fontSize: 12, color: T.textMuted }}>📍 {r.address}{r.zone ? ` (${r.zone})` : ""}</div>}
                    <div style={{ fontSize: 12, color: T.textSub, marginTop: 4 }}>{r.units}u · {formatMoney(r.totalARS)}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <span style={{ background: cobrado ? T.greenBg : ss.bg, color: cobrado ? T.green : ss.color, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>
                      {cobrado ? "💵 Cobrado" : ss.label}
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => reorder(openRoute, i, -1)} disabled={i === 0} style={arrowStyle(i === 0)}>↑</button>
                      <button onClick={() => reorder(openRoute, i, 1)} disabled={i === stops.length - 1} style={arrowStyle(i === stops.length - 1)}>↓</button>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  <MiniBtn onClick={() => setStopStatus(openRoute, i, "entregado")} color={T.green}>✓ Entregado</MiniBtn>
                  <MiniBtn onClick={() => markCobrado(openRoute, i)} color={T.green}>💵 Cobrado</MiniBtn>
                  <MiniBtn onClick={() => setStopStatus(openRoute, i, "no_estaba")} color={T.red}>🚫 No estaba</MiniBtn>
                  <MiniBtn onClick={() => setStopStatus(openRoute, i, "reprogramar")} color={T.amber}>↻ Reprogramar</MiniBtn>
                </div>
              </Card>
            );
          })}
        </div>

        <div style={{ marginTop: 20 }}>
          <Btn variant="danger" onClick={() => deleteRoute(openRoute)}>Borrar ruta</Btn>
        </div>
        {toast && <Toast msg={toast} />}
      </div>
    );
  }

  // ============ LISTA DE RUTAS ============
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: T.text, margin: 0, fontSize: 22 }}>🚚 Rutas de reparto</h2>
        <Btn onClick={openCreate}>+ Nueva ruta</Btn>
      </div>

      {pending.length > 0 && (
        <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 12 }}>
          📦 {pending.length} pedido{pending.length > 1 ? "s" : ""} mayorista pendiente{pending.length > 1 ? "s" : ""} de repartir.
        </div>
      )}

      {activeRoutes.length === 0 ? (
        <Card><div style={{ textAlign: "center", color: T.textMuted, padding: isMobile ? "32px 16px" : 48 }}>
          Aún no hay rutas. Creá la primera con "+ Nueva ruta" (necesitás pedidos mayoristas pendientes).
        </div></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {activeRoutes.sort((a, b) => new Date(b.date) - new Date(a.date)).map(r => {
            const t = routeTotals(r, sales);
            const done = (r.stops || []).filter(s => s.status === "entregado").length;
            return (
              <Card key={r.id} style={{ cursor: "pointer" }}>
                <div onClick={() => setOpenId(r.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800, color: T.text }}>{r.name}</div>
                    <span style={{ background: T.primarySoft, color: T.primary, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{r.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>{formatDate(r.date)}</div>
                  <div style={{ fontSize: 13, color: T.textSub, marginTop: 8 }}>
                    {done}/{t.stops} entregadas · {t.totalUnits}u · {formatMoney(t.totalARS)}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal crear ruta */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nueva ruta de reparto">
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}><Input label="Nombre" placeholder="Ej: Martes zona norte" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div style={{ flex: 1 }}><Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.textSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Pedidos pendientes (por zona)</div>
        {pendingByZone.length === 0 ? (
          <div style={{ color: T.textMuted, fontSize: 13, padding: "12px 0" }}>No hay pedidos mayoristas pendientes de repartir. Cargá un pedido en "Pedido mayorista".</div>
        ) : (
          <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
            {pendingByZone.map(z => (
              <div key={z.zone} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: T.blue, marginBottom: 6 }}>{z.zone} · {z.units}u · {formatMoney(z.totalARS)}</div>
                {z.orders.map(o => (
                  <label key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", cursor: "pointer", fontSize: 13, color: T.text }}>
                    <input type="checkbox" checked={!!selected[o.id]} onChange={e => setSelected(s => ({ ...s, [o.id]: e.target.checked }))} />
                    <span style={{ flex: 1 }}>{clientName(o.clientId)} — {formatMoney(o.total)}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
          <Btn variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Btn>
          <Btn onClick={createRoute}>Crear ruta</Btn>
        </div>
      </Modal>

      {toast && <Toast msg={toast} />}
    </div>
  );
}

function MiniBtn({ children, onClick, color }) {
  return <button onClick={onClick} style={{ border: `1px solid ${color}`, background: "transparent", color, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700, minHeight: 30 }}>{children}</button>;
}
function arrowStyle(disabled) {
  return { border: `1px solid ${T.border}`, background: T.card, color: disabled ? T.textFaint : T.textSub, borderRadius: 6, width: 30, height: 30, cursor: disabled ? "default" : "pointer", fontSize: 14 };
}
function Toast({ msg }) {
  return <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: T.primary, color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 300, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>{msg}</div>;
}
