import { useState, useMemo } from "react";
import { uid, formatDate, formatMoney } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Card, Btn, Modal, Input, Select, StatCard, MiniBtn, downloadCSV } from "./UI.jsx";
import { T } from "../theme.js";
import { PAYMENT_METHODS, MP_ACCOUNTS } from "../constants.js";
import { useAppContext } from "../AppContext.js";
import {
  pendingWholesaleOrders, groupOrdersByZone, buildRouteStops,
  resolveStop, routeTotals, moveStop, routeTotalsByExpectedMethod,
} from "../routes.js";
import { saleOutstanding } from "../lib/creditAccount.js";
import { generateRouteSheet } from "../lib/routeSheet.js";
import { routeToCSV } from "../lib/wholesaleExport.js";

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
  const [editOpen, setEditOpen] = useState(false); // editar nombre/fecha de la ruta abierta
  const [form, setForm] = useState({ name: "", date: new Date().toISOString().slice(0, 10) });
  const [selected, setSelected] = useState({});   // { orderId: true }
  const [toast, setToast] = useState("");
  const [cobro, setCobro] = useState(null);        // { routeId, idx, orderId, name, outstanding }
  const [payForm, setPayForm] = useState({ method: "Mercado Pago", mpAccount: "MP Diego", amount: "" });

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

  // Editar ruta (nombre/fecha) — misma paridad editar/borrar que el resto.
  const openEditRoute = (r) => { setForm({ name: r.name || "", date: r.date || new Date().toISOString().slice(0, 10) }); setEditOpen(true); };
  const saveRouteEdit = () => {
    if (!openRoute) return;
    updateRoute(openRoute.id, x => ({ ...x, name: form.name.trim() || x.name, date: form.date }));
    setEditOpen(false);
    flash("Ruta actualizada");
  };

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
    updateRoute(r.id, x => ({ ...x, stops: (x.stops || []).map((s, i) => i === idx ? { ...s, status, deliveredAt: status === "entregado" ? now() : s.deliveredAt } : s) }));
    const orderId = r.stops?.[idx]?.orderId;
    if (!orderId) return;
    if (status === "entregado") {
      setSales(prev => prev.map(s => s.id === orderId ? { ...s, fulfillmentStatus: "entregado" } : s));
    }
  };
  // Abre el modal de cobranza (puente con la caja): elegís método → se registra
  // un payment real en el sale → la caja acredita la cuenta sola.
  const openCobro = (r, idx) => {
    const orderId = r.stops[idx].orderId;
    const sale = sales.find(s => s.id === orderId);
    const outstanding = saleOutstanding(sale);
    if (outstanding <= 0) { flash("Este pedido ya está cobrado"); return; }
    const r2 = resolveStop(r.stops[idx], { clients, sales });
    setPayForm({ method: "Mercado Pago", mpAccount: "MP Diego", amount: String(outstanding) });
    setCobro({ routeId: r.id, idx, orderId, name: r2.name, outstanding });
  };
  const confirmCobro = () => {
    const amount = Math.round(Number(payForm.amount) || 0);
    if (amount <= 0) { flash("Ingresá el monto cobrado"); return; }
    const payment = { method: payForm.method, ...(payForm.method === "Mercado Pago" ? { mpAccount: payForm.mpAccount } : {}), amount, date: now() };
    // Registrar el pago en el sale → alimenta el ledger de caja (payMethodToAccountId).
    setSales(prev => prev.map(s => s.id === cobro.orderId
      ? { ...s, payments: [...(s.payments || []), payment], fulfillmentStatus: saleOutstanding(s) - amount <= 0 ? "cobrado" : "entregado" }
      : s));
    // La parada queda entregada.
    updateRoute(cobro.routeId, x => ({ ...x, stops: (x.stops || []).map((s, i) => i === cobro.idx ? { ...s, status: "entregado", deliveredAt: s.deliveredAt || now() } : s) }));
    logAudit?.("cobro", "sale", cobro.orderId, `Cobro mayorista ${cobro.name}: ${formatMoney(amount)} (${payForm.method})`);
    setCobro(null);
    flash(`💵 Cobrado ${formatMoney(amount)} → ${payForm.method}`);
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
    const cobroEsperado = routeTotalsByExpectedMethod(openRoute, sales, saleOutstanding);
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <button onClick={() => setOpenId(null)} style={{ border: "none", background: "transparent", color: T.blue, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 4 }}>← Volver a rutas</button>
            <h2 style={{ color: T.text, margin: 0, fontSize: isMobile ? 18 : 22, overflowWrap: "anywhere" }}>🚚 {openRoute.name}</h2>
            <div style={{ fontSize: 13, color: T.textMuted }}>{formatDate(openRoute.date)} · {openRoute.status}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn variant="secondary" onClick={() => openEditRoute(openRoute)}>✏️ Editar</Btn>
            <Btn variant="secondary" onClick={() => copySheet(openRoute)}>📋 Copiar hoja</Btn>
            <Btn variant="secondary" onClick={() => downloadCSV(`ruta_${(openRoute.name || "reparto").replace(/\s+/g, "_")}.csv`, routeToCSV(openRoute, { clients, sales }))}>📥 CSV</Btn>
            {openRoute.status !== "cerrada" && <Btn onClick={() => advanceRouteStatus(openRoute)}>{openRoute.status === "planificada" ? "▶ Iniciar" : "✓ Cerrar"}</Btn>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
          <StatCard label="Paradas" value={totals.stops} icon="📍" color={T.blue} />
          <StatCard label="Unidades" value={totals.totalUnits} icon="📦" color={T.amber} />
          <StatCard label="A cobrar" value={formatMoney(totals.totalARS)} icon="💵" color={T.green} />
        </div>

        {/* Tanda F: cuánto se espera cobrar por método (según cómo pagó cada
            kiosco históricamente). Para saber cuánto efectivo vas a traer. */}
        {cobroEsperado.length > 0 && (
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 800, color: T.text, marginBottom: 8, fontSize: 14 }}>💰 Cobro esperado por método</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {cobroEsperado.map(m => (
                <div key={m.method} style={{ border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: "8px 12px", fontSize: 13 }}>
                  <span style={{ color: T.textMuted }}>{m.method === "Sin historial" ? "❔ Sin historial" : m.method}: </span>
                  <b style={{ color: T.text }}>{formatMoney(m.totalARS)}</b>
                  <span style={{ color: T.textFaint, fontSize: 11 }}> · {m.stops} parada{m.stops > 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

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
                    {r.sale?.orderNote && <div style={{ fontSize: 12, color: T.amber, marginTop: 4, fontWeight: 600 }}>📝 {r.sale.orderNote}</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    <span style={{ background: cobrado ? T.greenBg : ss.bg, color: cobrado ? T.green : ss.color, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>
                      {cobrado ? "💵 Cobrado" : ss.label}
                    </span>
                    <div style={{ display: "flex", gap: isMobile ? 10 : 4 }}>
                      <button onClick={() => reorder(openRoute, i, -1)} disabled={i === 0} style={arrowStyle(i === 0, isMobile)}>↑</button>
                      <button onClick={() => reorder(openRoute, i, 1)} disabled={i === stops.length - 1} style={arrowStyle(i === stops.length - 1, isMobile)}>↓</button>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  <MiniBtn onClick={() => setStopStatus(openRoute, i, "entregado")} color={T.green}>✓ Entregado</MiniBtn>
                  <MiniBtn onClick={() => openCobro(openRoute, i)} color={T.green}>💵 Cobrar</MiniBtn>
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

        {/* Modal de cobranza — puente con la caja */}
        <Modal open={!!cobro} onClose={() => setCobro(null)} title={`Cobrar — ${cobro?.name || ""}`}>
          <div style={{ fontSize: 13, color: T.textSub, marginBottom: 12 }}>Pendiente: <b>{formatMoney(cobro?.outstanding || 0)}</b></div>
          <Select label="Método / cuenta" options={PAYMENT_METHODS} value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))} />
          {payForm.method === "Mercado Pago" && (
            <Select label="Cuenta MP" options={MP_ACCOUNTS} value={payForm.mpAccount} onChange={e => setPayForm(f => ({ ...f, mpAccount: e.target.value }))} />
          )}
          <Input label="Monto cobrado (ARS)" type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>Se registra en la cuenta de caja elegida (movimiento real).</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setCobro(null)}>Cancelar</Btn>
            <Btn onClick={confirmCobro}>Registrar cobro</Btn>
          </div>
        </Modal>

        <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar ruta">
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
          <div style={{ flex: 1 }}><Input label="Nombre" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div style={{ flex: 1 }}><Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={() => setEditOpen(false)}>Cancelar</Btn>
          <Btn onClick={saveRouteEdit}>Guardar</Btn>
        </div>
      </Modal>

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

// 44px en mobile: 30×30 con gap 4 era el peor tap target de la app —
// reordenando paradas se tocaba la flecha equivocada seguido.
function arrowStyle(disabled, isMobile) {
  const side = isMobile ? 44 : 30;
  return { border: `1px solid ${T.border}`, background: T.card, color: disabled ? T.textFaint : T.textSub, borderRadius: 6, width: side, height: side, cursor: disabled ? "default" : "pointer", fontSize: isMobile ? 17 : 14 };
}
function Toast({ msg }) {
  return <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: T.primary, color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 300, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", textAlign: "center" }}>{msg}</div>;
}
