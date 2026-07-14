import { useState, useMemo } from "react";
import { uid, formatDate } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Card, Btn, Modal, Input, Select, StatCard } from "./UI.jsx";
import { T } from "../theme.js";
import { PROSPECT_SOURCES, VISIT_OUTCOMES } from "../constants.js";
import {
  PROSPECT_STAGES_ORDER, CLIENT_STAGES_ORDER,
  funnelSummary, lastVisitFor,
} from "../prospecting.js";
import { useAppContext } from "../AppContext.js";

// Pipeline de captación mayorista (kanban sin drag — botones de avance, anda en
// mobile). Prospectos en las 3 primeras columnas; clientes mayoristas en las 3
// últimas. Al llegar a "visitado" se convierte el prospecto en cliente mayorista.
// Incluye registro de visitas (colección `visits`) con outcome + notas.

const STAGE_LABEL = {
  prospecto: "Prospecto", contactado: "Contactado", visitado: "Visitado",
  primera_compra: "1ra compra", activo: "Activo", en_pausa: "En pausa",
};
const STAGE_COLOR = {
  prospecto: T.textMuted, contactado: T.blue, visitado: T.amber,
  primera_compra: T.green, activo: T.green, en_pausa: T.red,
};

const emptyProspect = { businessName: "", zone: "", address: "", phone: "", contactName: "", source: "manual", notes: "", lat: "", lng: "" };

export function Pipeline({ prospects = [], setProspects, clients = [], setClients, visits = [], setVisits }) {
  const { isMobile } = useResponsive();
  const { logAudit, currentUser } = useAppContext();

  const [pModal, setPModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyProspect);
  const [err, setErr] = useState("");
  const [visitFor, setVisitFor] = useState(null); // { id, type:"prospect"|"client", name }
  const [visit, setVisit] = useState({ outcome: "interesado", notes: "" });

  const activeProspects = useMemo(() => prospects.filter(p => p && !p.isDeleted && !p.convertedClientId), [prospects]);
  const mayoristas = useMemo(() => clients.filter(c => c && !c.isDeleted && c.type === "mayorista"), [clients]);
  const summary = useMemo(() => funnelSummary({ prospects, clients }), [prospects, clients]);

  const byStage = (stage, isClient) => (isClient ? mayoristas : activeProspects).filter(x => (x.pipelineStage || (isClient ? "activo" : "prospecto")) === stage);

  const now = () => new Date().toISOString();

  // --- Prospecto: crear/editar ---
  const openNew = () => { setForm(emptyProspect); setEditingId(null); setErr(""); setPModal(true); };
  const openEdit = (p) => { setForm({ ...emptyProspect, ...p, lat: p.lat ?? "", lng: p.lng ?? "" }); setEditingId(p.id); setErr(""); setPModal(true); };
  const saveProspect = () => {
    if (!form.businessName.trim()) { setErr("El nombre del comercio es obligatorio"); return; }
    const base = {
      businessName: form.businessName.trim(), zone: form.zone.trim(), address: form.address.trim(),
      phone: form.phone.trim(), contactName: form.contactName.trim(),
      source: form.source || "manual", notes: form.notes.trim(),
      lat: form.lat === "" ? null : Number(form.lat), lng: form.lng === "" ? null : Number(form.lng),
    };
    if (editingId) {
      setProspects(prev => prev.map(p => p.id === editingId ? { ...p, ...base } : p));
      logAudit?.("update", "prospect", editingId, `Prospecto editado: ${base.businessName}`);
    } else {
      const id = uid();
      setProspects(prev => [{ id, pipelineStage: "prospecto", foundAt: now(), lastContactAt: now(), ...base }, ...prev]);
      logAudit?.("create", "prospect", id, `Prospecto nuevo: ${base.businessName}`);
    }
    setPModal(false);
  };
  const deleteProspect = (p) => {
    setProspects(prev => prev.map(x => x.id === p.id ? { ...x, isDeleted: true, deletedAt: now(), deletedBy: currentUser?.name || "?" } : x));
    logAudit?.("delete", "prospect", p.id, `Prospecto borrado: ${p.businessName}`);
  };

  // --- Avanzar etapa ---
  const advanceProspect = (p) => {
    const i = PROSPECT_STAGES_ORDER.indexOf(p.pipelineStage || "prospecto");
    const next = PROSPECT_STAGES_ORDER[Math.min(i + 1, PROSPECT_STAGES_ORDER.length - 1)];
    setProspects(prev => prev.map(x => x.id === p.id ? { ...x, pipelineStage: next, lastContactAt: now() } : x));
  };
  const setClientStage = (c, stage) => {
    setClients(prev => prev.map(x => x.id === c.id ? { ...x, pipelineStage: stage } : x));
  };

  // --- Convertir prospecto → cliente mayorista ---
  const convert = (p) => {
    const id = uid();
    const newClient = {
      id, type: "mayorista",
      name: p.contactName || p.businessName || "Mayorista",
      businessName: p.businessName || "", businessType: null, wholesaleTier: null,
      zone: p.zone || "", address: p.address || "", phone: p.phone || "", contactName: p.contactName || "",
      source: p.source || "manual", pipelineStage: "primera_compra",
      tier: "regular", balance: 0, notes: p.notes || "",
      createdAt: now(), createdBy: currentUser?.name || "Sistema",
    };
    setClients(prev => [newClient, ...prev]);
    setProspects(prev => prev.map(x => x.id === p.id ? { ...x, convertedClientId: id, isDeleted: true, deletedAt: now(), deletedBy: currentUser?.name || "?" } : x));
    logAudit?.("convert", "prospect", p.id, `Prospecto → mayorista: ${newClient.businessName || newClient.name}`);
  };

  // --- Visitas ---
  const openVisit = (id, type, name) => { setVisitFor({ id, type, name }); setVisit({ outcome: "interesado", notes: "" }); };
  const saveVisit = () => {
    const v = { id: uid(), targetId: visitFor.id, targetType: visitFor.type, date: now(), outcome: visit.outcome, notes: visit.notes.trim(), byUser: currentUser?.name || "?" };
    setVisits(prev => [v, ...prev]);
    // actualizar recencia en el target
    if (visitFor.type === "prospect") setProspects(prev => prev.map(p => p.id === visitFor.id ? { ...p, lastContactAt: v.date } : p));
    else setClients(prev => prev.map(c => c.id === visitFor.id ? { ...c, lastVisitAt: v.date } : c));
    logAudit?.("visit", visitFor.type, visitFor.id, `Visita a ${visitFor.name}: ${visit.outcome}`);
    setVisitFor(null);
  };

  const columns = [
    ...PROSPECT_STAGES_ORDER.map(s => ({ stage: s, isClient: false })),
    ...CLIENT_STAGES_ORDER.map(s => ({ stage: s, isClient: true })),
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: T.text, margin: 0, fontSize: 22 }}>🎯 Pipeline de captación</h2>
        <Btn onClick={openNew}>+ Nuevo prospecto</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="Prospectos activos" value={summary.prospectosActivos} icon="🎯" color={T.blue} />
        <StatCard label="Listos para cerrar" value={summary.listosParaCerrar} icon="✅" color={T.amber} />
        <StatCard label="Mayoristas" value={summary.mayoristas} icon="🏪" color={T.green} />
      </div>

      {/* Kanban (columnas apiladas en mobile) */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(6, minmax(0, 1fr))", gap: 10 }}>
        {columns.map(({ stage, isClient }) => {
          const items = byStage(stage, isClient);
          return (
            <div key={stage} style={{ background: T.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 8, minHeight: 80 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: STAGE_COLOR[stage], marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                <span>{STAGE_LABEL[stage]}</span><span style={{ color: T.textFaint }}>{items.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map(x => {
                  const lastV = lastVisitFor(visits, x.id);
                  return (
                    <div key={x.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
                      <div style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>{x.businessName || x.name}</div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>{x.zone || "sin zona"}{x.contactName ? ` · ${x.contactName}` : ""}</div>
                      {lastV && <div style={{ fontSize: 10, color: T.textFaint, marginBottom: 6 }}>Últ. visita: {formatDate(lastV.date)} ({lastV.outcome})</div>}
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {!isClient && stage !== "visitado" && (
                          <MiniBtn onClick={() => advanceProspect(x)} color={T.blue}>→ Avanzar</MiniBtn>
                        )}
                        {!isClient && stage === "visitado" && (
                          <MiniBtn onClick={() => convert(x)} color={T.green}>✓ Convertir</MiniBtn>
                        )}
                        <MiniBtn onClick={() => openVisit(x.id, isClient ? "client" : "prospect", x.businessName || x.name)} color={T.amber}>📋 Visita</MiniBtn>
                        {!isClient && <MiniBtn onClick={() => openEdit(x)} color={T.textMuted}>✏️</MiniBtn>}
                        {isClient && stage !== "activo" && <MiniBtn onClick={() => setClientStage(x, "activo")} color={T.green}>Activar</MiniBtn>}
                        {isClient && stage !== "en_pausa" && <MiniBtn onClick={() => setClientStage(x, "en_pausa")} color={T.red}>Pausar</MiniBtn>}
                        {!isClient && <MiniBtn onClick={() => deleteProspect(x)} color={T.red}>🗑</MiniBtn>}
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && <div style={{ fontSize: 11, color: T.textFaint, textAlign: "center", padding: 8 }}>—</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal nuevo/editar prospecto */}
      <Modal open={pModal} onClose={() => setPModal(false)} title={editingId ? "Editar prospecto" : "Nuevo prospecto"}>
        <Input label="Nombre del comercio *" value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} />
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}><Input label="Zona / barrio" value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))} /></div>
          <div style={{ flex: 1 }}><Select label="Origen" options={PROSPECT_SOURCES} value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} /></div>
        </div>
        <Input label="Dirección" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}><Input label="Teléfono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div style={{ flex: 1 }}><Input label="Contacto / encargado" value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}><Input label="Lat (opcional)" value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} /></div>
          <div style={{ flex: 1 }}><Input label="Lng (opcional)" value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} /></div>
        </div>
        <Input label="Notas" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={() => setPModal(false)}>Cancelar</Btn>
          <Btn onClick={saveProspect}>{editingId ? "Guardar" : "Crear"}</Btn>
        </div>
      </Modal>

      {/* Modal registrar visita */}
      <Modal open={!!visitFor} onClose={() => setVisitFor(null)} title={`Visita — ${visitFor?.name || ""}`}>
        <Select label="Resultado" options={VISIT_OUTCOMES} value={visit.outcome} onChange={e => setVisit(v => ({ ...v, outcome: e.target.value }))} />
        <Input label="Notas" value={visit.notes} onChange={e => setVisit(v => ({ ...v, notes: e.target.value }))} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={() => setVisitFor(null)}>Cancelar</Btn>
          <Btn onClick={saveVisit}>Registrar</Btn>
        </div>
      </Modal>
    </div>
  );
}

function MiniBtn({ children, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      border: `1px solid ${color}`, background: "transparent", color,
      borderRadius: 6, padding: "3px 7px", cursor: "pointer", fontSize: 11, fontWeight: 700, minHeight: 28,
    }}>{children}</button>
  );
}
