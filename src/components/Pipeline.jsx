import { useState, useMemo } from "react";
import { uid, formatDate } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Card, Btn, Modal, Input, Select, StatCard, MiniBtn, Badge, downloadCSV } from "./UI.jsx";
import { T } from "../theme.js";
import { PROSPECT_SOURCES, VISIT_OUTCOMES } from "../constants.js";
import {
  PROSPECT_STAGES_ORDER, CLIENT_STAGES_ORDER,
  funnelSummary, lastVisitFor,
} from "../prospecting.js";
import { prospectsToCSV } from "../lib/wholesaleExport.js";
import {
  buildProspectRanking, CALIFICACION_CAMPOS, calificacionActual, aplicarCalificacion,
} from "../lib/prospectRanking.js";
import { useAppContext } from "../AppContext.js";
import { PresentationMessageModal } from "./wholesale/PresentationMessageModal.jsx";
import { ProspectDiagnosisModal } from "./wholesale/ProspectDiagnosisModal.jsx";

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

// Color del chip de prioridad (mapeo de DISPLAY; la etiqueta la da el dominio).
// Escala de calor para que el ojo encuentre primero lo que más conviene trabajar.
const PRIORIDAD_COLOR = {
  muy_alta: T.green, alta: T.blue, media: T.amber, baja: T.textMuted, "": T.textFaint,
};

const emptyProspect = { businessName: "", zone: "", address: "", phone: "", contactName: "", source: "manual", notes: "", lat: "", lng: "" };

export function Pipeline({ prospects = [], setProspects, clients = [], setClients, visits = [], setVisits, products = [], sales = [] }) {
  const { isMobile } = useResponsive();
  const { logAudit, currentUser, exchangeRate } = useAppContext();

  const [pModal, setPModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyProspect);
  const [err, setErr] = useState("");
  const [visitFor, setVisitFor] = useState(null);
  const [presTarget, setPresTarget] = useState(null); // Bloque 2: mensaje de presentación
  const [diagId, setDiagId] = useState(null);         // ficha de diagnóstico (Prospect Engine)
  const [visit, setVisit] = useState({ outcome: "interesado", notes: "" });
  const [calif, setCalif] = useState({});             // calificación rápida (solo prospectos)

  const activeProspects = useMemo(() => prospects.filter(p => p && !p.isDeleted && !p.convertedClientId), [prospects]);
  const mayoristas = useMemo(() => clients.filter(c => c && !c.isDeleted && c.type === "mayorista"), [clients]);
  const summary = useMemo(() => funnelSummary({ prospects, clients }), [prospects, clients]);

  // Prospect Engine: ranking + chips + diagnóstico, todo ya digerido por la
  // fachada. La UI no conoce señales, scoring ni cómo se ordena.
  const ranking = useMemo(
    () => buildProspectRanking({ prospects, visits, clients, sales, products }),
    [prospects, visits, clients, sales, products],
  );

  const byStage = (stage, isClient) => {
    const items = (isClient ? mayoristas : activeProspects)
      .filter(x => (x.pipelineStage || (isClient ? "activo" : "prospecto")) === stage);
    if (isClient) return items;   // los mayoristas no entran al ranking de captación
    return [...items].sort((a, b) =>
      (ranking.porId[a.id]?.posicion ?? Infinity) - (ranking.porId[b.id]?.posicion ?? Infinity));
  };

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
  const openVisit = (target, type) => {
    setVisitFor({ id: target.id, type, name: target.businessName || target.name });
    setVisit({ outcome: "interesado", notes: "" });
    // La calificación arranca en el estado actual del prospecto (lo ya sabido
    // se conserva; lo que nunca se evaluó aparece como "Sin datos").
    setCalif(type === "prospect" ? calificacionActual(target) : {});
  };
  const saveVisit = () => {
    const v = { id: uid(), targetId: visitFor.id, targetType: visitFor.type, date: now(), outcome: visit.outcome, notes: visit.notes.trim(), byUser: currentUser?.name || "?" };
    setVisits(prev => [v, ...prev]);
    if (visitFor.type === "prospect") {
      // Solo se re-califica si algo cambió: sellar autor y fecha sin haber
      // evaluado nada diría "lo revisamos hoy" cuando no se revisó.
      const previa = calificacionActual(prospects.find(p => p.id === visitFor.id));
      const cambio = CALIFICACION_CAMPOS.some(c => calif[c.campo] !== previa[c.campo]);
      setProspects(prev => prev.map(p => {
        if (p.id !== visitFor.id) return p;
        const conRecencia = { ...p, lastContactAt: v.date };
        return cambio
          ? aplicarCalificacion(conRecencia, calif, { autor: currentUser?.name || "?", at: v.date })
          : conRecencia;
      }));
      if (cambio) logAudit?.("qualify", "prospect", visitFor.id, `Calificación actualizada: ${visitFor.name}`);
    } else {
      setClients(prev => prev.map(c => c.id === visitFor.id ? { ...c, lastVisitAt: v.date } : c));
    }
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {activeProspects.length > 0 && <Btn variant="secondary" onClick={() => downloadCSV(`prospectos_${new Date().toISOString().slice(0, 10)}.csv`, prospectsToCSV(prospects))}>📥 CSV</Btn>}
          <Btn onClick={openNew}>+ Nuevo prospecto</Btn>
        </div>
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
            <div key={stage} style={{ background: T.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 8, minHeight: isMobile ? 0 : 80 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: STAGE_COLOR[stage], marginBottom: isMobile && items.length === 0 ? 0 : 8, display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: isMobile ? 28 : undefined }}>
                <span>{STAGE_LABEL[stage]}</span><span style={{ color: T.textFaint }}>{items.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map(x => {
                  const lastV = lastVisitFor(visits, x.id);
                  const chip = isClient ? null : ranking.porId[x.id]?.chip;
                  return (
                    <div key={x.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
                      {/* Encabezado: en prospectos abre la ficha de diagnóstico
                          (el chip es el resumen; tocarlo lleva al detalle). */}
                      <div
                        onClick={chip ? () => setDiagId(x.id) : undefined}
                        title={chip ? "Ver diagnóstico" : undefined}
                        style={{
                          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                          gap: 6, cursor: chip ? "pointer" : "default", minHeight: chip ? 30 : undefined,
                        }}
                      >
                        <div style={{ fontWeight: 700, color: T.text, fontSize: 13, flex: 1, minWidth: 0 }}>
                          {x.businessName || x.name}
                          {/* espacio duro: el chevron nunca se separa del nombre al envolver */}
                          {chip && <span style={{ color: T.textFaint, fontWeight: 400 }}>{" ›"}</span>}
                        </div>
                        {chip && <span style={{ flexShrink: 0 }}><Badge color={PRIORIDAD_COLOR[chip.prioridad] ?? T.textFaint}>{chip.etiqueta}</Badge></span>}
                      </div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6, marginTop: 2 }}>{x.zone || "sin zona"}{x.contactName ? ` · ${x.contactName}` : ""}</div>
                      {chip?.aviso && <div style={{ fontSize: 10, color: T.textFaint, marginBottom: 6, display: "flex", gap: 4 }}><span style={{ flexShrink: 0 }}>◍</span><span>{chip.aviso}</span></div>}
                      {lastV && <div style={{ fontSize: 10, color: T.textFaint, marginBottom: 6 }}>Últ. visita: {formatDate(lastV.date)} ({lastV.outcome})</div>}
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {!isClient && stage !== "visitado" && (
                          <MiniBtn onClick={() => advanceProspect(x)} color={T.blue}>→ Avanzar</MiniBtn>
                        )}
                        {!isClient && stage === "visitado" && (
                          <MiniBtn onClick={() => convert(x)} color={T.green}>✓ Convertir</MiniBtn>
                        )}
                        <MiniBtn onClick={() => openVisit(x, isClient ? "client" : "prospect")} color={T.amber}>📋 Visita</MiniBtn>
                        {!isClient && <MiniBtn onClick={() => setPresTarget(x)} color={T.green}>💬 Presentar</MiniBtn>}
                        {!isClient && <MiniBtn onClick={() => openEdit(x)} color={T.textMuted}>✏️</MiniBtn>}
                        {isClient && stage !== "activo" && <MiniBtn onClick={() => setClientStage(x, "activo")} color={T.green}>Activar</MiniBtn>}
                        {isClient && stage !== "en_pausa" && <MiniBtn onClick={() => setClientStage(x, "en_pausa")} color={T.red}>Pausar</MiniBtn>}
                        {!isClient && <MiniBtn onClick={() => deleteProspect(x)} color={T.red}>🗑</MiniBtn>}
                      </div>
                    </div>
                  );
                })}
                {/* Mobile: etapa vacía = solo el header compacto (sin placeholder) —
                    con 6 etapas apiladas los "—" alargaban el scroll al pedo. */}
                {items.length === 0 && !isMobile && <div style={{ fontSize: 11, color: T.textFaint, textAlign: "center", padding: 8 }}>—</div>}
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

        {/* Calificación rápida (Prospect Engine): los controles, sus opciones y
            el merge los define el dominio. Acá solo se pintan y se eligen. */}
        {visitFor?.type === "prospect" && (
          <div style={{ marginBottom: 14, background: T.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.text }}>Calificación rápida</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8 }}>
              Opcional. Lo que no marques queda sin datos — nunca se completa solo.
            </div>
            {CALIFICACION_CAMPOS.map(c => (
              <div key={c.campo} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: T.textSub, marginBottom: 4 }}>{c.pregunta}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {c.opciones.map(o => {
                    const sel = calif[c.campo] === o.valor;
                    return (
                      <MiniBtn key={o.valor} color={sel ? T.blue : T.textFaint}
                        onClick={() => setCalif(s => ({ ...s, [c.campo]: o.valor }))}
                        style={sel ? { background: T.blueBg, borderColor: T.blueBorder } : undefined}>
                        {o.etiqueta}
                      </MiniBtn>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <Input label="Notas" value={visit.notes} onChange={e => setVisit(v => ({ ...v, notes: e.target.value }))} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={() => setVisitFor(null)}>Cancelar</Btn>
          <Btn onClick={saveVisit}>Registrar</Btn>
        </div>
      </Modal>

      {/* Ficha de diagnóstico del Prospect Engine (render puro de la fachada) */}
      <ProspectDiagnosisModal
        open={!!diagId} onClose={() => setDiagId(null)}
        item={diagId ? ranking.porId[diagId] : null}
        prioridadColor={PRIORIDAD_COLOR[ranking.porId[diagId]?.chip?.prioridad] ?? T.textFaint}
      />

      {/* Bloque 2 — mensaje de presentación B2B (primer contacto con el prospecto) */}
      <PresentationMessageModal open={!!presTarget} onClose={() => setPresTarget(null)}
        target={presTarget} defaultTier="C"
        products={products} exchangeRate={exchangeRate} />
    </div>
  );
}

