import { useState, useMemo } from "react";
import { uid, formatDate } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Btn, StatCard, MiniBtn, Badge, downloadCSV } from "./UI.jsx";
import { T } from "../theme.js";
import {
  PROSPECT_STAGES_ORDER, CLIENT_STAGES_ORDER,
  funnelSummary, lastVisitFor,
} from "../prospecting.js";
import { prospectsToCSV } from "../lib/wholesaleExport.js";
import { buildProspectRanking } from "../lib/prospectRanking.js";
import { useAppContext } from "../AppContext.js";
import { PresentationMessageModal } from "./wholesale/PresentationMessageModal.jsx";
import { ProspectDiagnosisModal } from "./wholesale/ProspectDiagnosisModal.jsx";
import { ProspectFormModal } from "./wholesale/ProspectFormModal.jsx";
import { VisitModal } from "./wholesale/VisitModal.jsx";

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
// Exportado: la pestaña Hoy del módulo Prospectos usa la MISMA escala.
export const PRIORIDAD_COLOR = {
  muy_alta: T.green, alta: T.blue, media: T.amber, baja: T.textMuted, "": T.textFaint,
};

// Kanban PURO desde F1 del mini CRM (spec docs/PROSPECT_CRM_SPEC.md): el
// discovery que vivió acá se mudó al módulo Prospectos (pestaña Hoy), y en F2
// los modales de alta/edición y visita se extrajeron como compartidos
// (ProspectFormModal / VisitModal) para que Hoy los reuse sin duplicar lógica.
export function Pipeline({
  prospects = [], setProspects, clients = [], setClients, visits = [], setVisits,
  products = [], sales = [],
}) {
  const { isMobile } = useResponsive();
  const { logAudit, currentUser, exchangeRate } = useAppContext();

  const [pModal, setPModal] = useState(false);
  const [editing, setEditing] = useState(null);       // prospecto a editar (null = alta)
  const [visitFor, setVisitFor] = useState(null);     // { id, type, name } | null
  const [presTarget, setPresTarget] = useState(null); // Bloque 2: mensaje de presentación
  const [diagId, setDiagId] = useState(null);         // ficha de diagnóstico (Prospect Engine)

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

  // --- Prospecto: crear/editar (el form vive en ProspectFormModal) ---
  const openNew = () => { setEditing(null); setPModal(true); };
  const openEdit = (p) => { setEditing(p); setPModal(true); };
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

  // --- Visitas (el modal + calificación viven en VisitModal) ---
  const openVisit = (target, type) => {
    setVisitFor({ id: target.id, type, name: target.businessName || target.name });
  };

  const columns = [
    ...PROSPECT_STAGES_ORDER.map(s => ({ stage: s, isClient: false })),
    ...CLIENT_STAGES_ORDER.map(s => ({ stage: s, isClient: true })),
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: T.text, margin: 0, fontSize: 18 }}>Embudo de captación</h2>
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

      {/* Modales compartidos (F2 del CRM: también los usa la pestaña Hoy) */}
      <ProspectFormModal open={pModal} editing={editing} onClose={() => setPModal(false)} setProspects={setProspects} />
      <VisitModal target={visitFor} onClose={() => setVisitFor(null)}
        prospects={prospects} setProspects={setProspects} setClients={setClients} setVisits={setVisits} />

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

