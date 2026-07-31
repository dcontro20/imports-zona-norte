// Prospectos.jsx — el mini CRM de Prospect Intelligence (spec CONGELADO:
// docs/PROSPECT_CRM_SPEC.md). Una sola puerta para todo el ciclo del
// prospecto: descubrir → revisar → priorizar → visitar → contactar →
// convertir → seguimiento.
//
// F1: shell con pestañas (Hoy hospeda el discovery; Embudo = kanban puro;
// Zonas = ProspectMap). F2 (esta fase): Hoy COMPLETO — "Para hoy" Top 5 como
// protagonista (D-3), funnel, zonas sin cerrar con "buscar en esta zona",
// últimas visitas con autoría y alta manual. La Ficha llega en F3 (por ahora
// tocar un prospecto abre el diagnóstico del engine, como en el kanban).
// Consumo del engine: SOLO la fachada (buildProspectRanking) — regla intacta.
// Los keys históricos "pipeline"/"prospectMap" entran por tabInicial (alias
// de deep-links/⌘K — sin lockout, como la regla de modos).
import { useMemo, useState } from "react";
import { uid, formatDate } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Btn, MiniBtn, Badge, StatCard } from "./UI.jsx";
import { T } from "../theme.js";
import { useAppContext } from "../AppContext.js";
import { funnelSummary, zonesWithoutCoverage, lastVisitFor } from "../prospecting.js";
import { buildProspectRanking } from "../lib/prospectRanking.js";
import { Pipeline, PRIORIDAD_COLOR } from "./Pipeline.jsx";
import { ProspectMap } from "./ProspectMap.jsx";
import { ProspectDiagnosisModal } from "./wholesale/ProspectDiagnosisModal.jsx";
import { PresentationMessageModal } from "./wholesale/PresentationMessageModal.jsx";
import { ProspectFormModal } from "./wholesale/ProspectFormModal.jsx";
import { VisitModal } from "./wholesale/VisitModal.jsx";
import {
  DiscoveryReviewModal, DiscoverySuppressedModal, DiscoverySearchModal, DiscoveryJobsStatus,
} from "./wholesale/DiscoveryReview.jsx";
import { altaDesdeDescubierto, suprimirDescubierto } from "../lib/discovery/discoveryImport.js";

const TABS = [
  { key: "hoy", label: "☀️ Hoy" },
  { key: "embudo", label: "🎯 Embudo" },
  { key: "zonas", label: "🗺️ Zonas" },
];

const TOP_HOY = 5;                                // D-3 del spec: Para hoy = Top 5
const ETAPAS_HOY = ["prospecto", "contactado"];   // lo trabajable (visitado ya está para cerrar)

export function Prospectos({
  prospects = [], setProspects, clients = [], setClients, visits = [], setVisits,
  products = [], sales = [],
  discoveryResults = [], onConsumeDiscoveryResult,
  discoverySuppressed = [], setDiscoverySuppressed,
  discoveryJobs = [], onCreateDiscoveryJob, onCancelDiscoveryJob,
  tabInicial = "hoy",
}) {
  const { isMobile } = useResponsive();
  const { logAudit, currentUser, exchangeRate } = useAppContext();
  const [tab, setTab] = useState(TABS.some(t => t.key === tabInicial) ? tabInicial : "hoy");
  const [revisando, setRevisando] = useState(false);
  const [suppModal, setSuppModal] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [busquedaInicial, setBusquedaInicial] = useState(null); // pre-carga de "buscar en esta zona"
  const [altaOpen, setAltaOpen] = useState(false);
  const [visitFor, setVisitFor] = useState(null);
  const [presTarget, setPresTarget] = useState(null);
  const [diagId, setDiagId] = useState(null);

  const activeProspects = useMemo(() => prospects.filter(p => p && !p.isDeleted), [prospects]);
  const now = () => new Date().toISOString();

  // --- Para hoy (D-3): el engine propone, el operador decide ---
  const ranking = useMemo(
    () => buildProspectRanking({ prospects, visits, clients, sales, products }),
    [prospects, visits, clients, sales, products],
  );
  const trabajables = useMemo(() => ranking.items.filter(it => {
    const p = it.prospect;
    return p && !p.isDeleted && !p.convertedClientId
      && ETAPAS_HOY.includes(p.pipelineStage || "prospecto");
  }), [ranking]);
  const paraHoy = trabajables.slice(0, TOP_HOY);
  const sinCalificar = trabajables.filter(it => it.chip?.aviso).length;

  const funnel = useMemo(() => funnelSummary({ prospects, clients }), [prospects, clients]);
  const zonasSinCerrar = useMemo(
    () => zonesWithoutCoverage({ clients, prospects: activeProspects }),
    [clients, activeProspects],
  );
  const ultimasVisitas = useMemo(() => {
    const nombreDe = (v) => {
      const p = prospects.find(x => x?.id === v.targetId);
      if (p) return p.businessName;
      const c = clients.find(x => x?.id === v.targetId);
      return c?.businessName || c?.name || "—";
    };
    return visits
      .filter(v => v && !v.isDeleted)
      .slice()
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .slice(0, 5)
      .map(v => ({ ...v, nombre: nombreDe(v) }));
  }, [visits, prospects, clients]);

  // --- Discovery (contrato §3/§4/§7) ---
  const pendienteDiscovery = discoveryResults[0] || null;
  const confirmarRevision = ({ altas, supresiones, sinMemoria }) => {
    const at = now();
    if (altas.length) {
      const nuevos = altas.map(p => altaDesdeDescubierto(p, { id: uid(), at }));
      setProspects(prev => [...nuevos, ...prev]);
    }
    if (supresiones.length) {
      const entradas = supresiones.map(p =>
        suprimirDescubierto(p, { id: uid(), at, por: currentUser?.name || "?" }));
      setDiscoverySuppressed?.(prev => [...entradas, ...prev]);
    }
    logAudit?.("import", "prospect", pendienteDiscovery.id,
      `Descubrimiento "${pendienteDiscovery.termino}" (${pendienteDiscovery.zona}): ` +
      `${altas.length} altas · ${supresiones.length} descartes` +
      (sinMemoria.length ? ` · ${sinMemoria.length} sin memoria` : ""));
    onConsumeDiscoveryResult?.(pendienteDiscovery.id);
    setRevisando(false);
  };
  const rehabilitar = (s) => {
    setDiscoverySuppressed?.(prev => prev.filter(e => e.id !== s.id));
    logAudit?.("rehab", "prospect", s.id, `Rehabilitado del descarte: ${s.nombre || s.web}`);
  };
  const crearBusqueda = (busqueda) => {
    const job = {
      id: uid(), ...busqueda, status: "pendiente", counts: null, error: "",
      createdBy: currentUser?.name || "?", createdAt: now(), startedAt: "", finishedAt: "",
    };
    onCreateDiscoveryJob?.(job);
    logAudit?.("create", "discoveryJob", job.id, `Búsqueda: "${job.termino}" en ${job.zona} (tope ${job.tope})`);
    setBuscando(false);
  };
  const cancelarBusqueda = (j) => {
    onCancelDiscoveryJob?.(j.id);
    logAudit?.("delete", "discoveryJob", j.id, `Búsqueda ${j.status === "error" ? "descartada" : "cancelada"}: "${j.termino}" en ${j.zona}`);
  };
  const buscarEnZona = (zona) => { setBusquedaInicial({ zona }); setBuscando(true); };
  const abrirBusqueda = () => { setBusquedaInicial(null); setBuscando(true); };

  const seccionTitulo = (texto, extra = null) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: T.textSub, textTransform: "uppercase", letterSpacing: 0.5 }}>{texto}</div>
      {extra}
    </div>
  );

  return (
    <div>
      {/* Header del módulo + pestañas */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ color: T.text, margin: 0, fontSize: 22 }}>🎯 Prospectos</h2>
        {tab === "hoy" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {discoverySuppressed.length > 0 && (
              <Btn variant="secondary" onClick={() => setSuppModal(true)}>⛔ Descartados ({discoverySuppressed.length})</Btn>
            )}
            <Btn variant="secondary" onClick={() => setAltaOpen(true)}>+ Nuevo prospecto</Btn>
            <Btn onClick={abrirBusqueda}>🔎 Descubrir</Btn>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map(t => {
          const sel = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: isMobile ? "10px 14px" : "8px 14px", minHeight: 40,
              borderRadius: 999, fontSize: 13, fontWeight: sel ? 800 : 600,
              cursor: "pointer", fontFamily: "inherit",
              background: sel ? T.primarySoft : T.card,
              color: sel ? T.primary : T.textMuted,
              border: `1px solid ${sel ? T.primary : T.border}`,
            }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ---- Hoy ---- */}
      {tab === "hoy" && (
        <div>
          {/* Discovery primero cuando pide acción (jobs activos / revisión) */}
          <DiscoveryJobsStatus jobs={discoveryJobs} onCancel={cancelarBusqueda} />
          {pendienteDiscovery && (
            <div style={{
              background: T.blueBg, border: `1px solid ${T.blueBorder}`, borderRadius: 12,
              padding: 12, marginBottom: 16, display: "flex", alignItems: "center",
              justifyContent: "space-between", gap: 10, flexWrap: "wrap",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: T.text }}>
                  🔎 {pendienteDiscovery.prospectos?.length || 0} descubiertos de "{pendienteDiscovery.termino}" — {pendienteDiscovery.zona}
                </div>
                <div style={{ fontSize: 11, color: T.textMuted }}>
                  Esperan tu revisión: nada entra al embudo sin confirmar.
                  {discoveryResults.length > 1 ? ` (+${discoveryResults.length - 1} búsquedas más en cola)` : ""}
                </div>
              </div>
              <span style={{ flexShrink: 0 }}><Btn onClick={() => setRevisando(true)}>Revisar</Btn></span>
            </div>
          )}

          {/* ---- Para hoy (Top 5) — el protagonista (D-3) ---- */}
          <div style={{ marginBottom: 20 }}>
            {seccionTitulo("☀️ Para hoy",
              sinCalificar > 0 ? <div style={{ fontSize: 11, color: T.textFaint }}>◍ {sinCalificar} sin calificar</div> : null)}
            {paraHoy.length === 0 ? (
              <div style={{ fontSize: 12, color: T.textFaint, background: T.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: isMobile ? "24px 16px" : 28, textAlign: "center" }}>
                Sin prospectos para trabajar. Descubrí negocios con 🔎 o cargá uno a mano.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {paraHoy.map(it => {
                  const p = it.prospect;
                  const lastV = lastVisitFor(visits, p.id);
                  return (
                    <div key={p.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12 }}>
                      <div
                        onClick={() => setDiagId(p.id)} title="Ver diagnóstico"
                        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, cursor: "pointer" }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>
                            {p.businessName}<span style={{ color: T.textFaint, fontWeight: 400 }}>{" ›"}</span>
                          </div>
                          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                            {p.zone || "sin zona"}
                            {lastV ? ` · últ. visita ${formatDate(lastV.date)}` : " · nunca visitado"}
                          </div>
                        </div>
                        <span style={{ flexShrink: 0 }}>
                          <Badge color={PRIORIDAD_COLOR[it.chip?.prioridad] ?? T.textFaint}>{it.chip?.etiqueta}</Badge>
                        </span>
                      </div>
                      {/* El próximo paso del diagnóstico: el engine propone (ícono y
                          texto vienen del dominio), el operador ejecuta */}
                      <div style={{ fontSize: 12, color: T.textSub, margin: "8px 0", display: "flex", gap: 6 }}>
                        <span style={{ flexShrink: 0 }}>{it.proximoPaso?.icono || "👉"}</span>
                        <span>{it.proximoPaso?.texto}</span>
                      </div>
                      {it.chip?.aviso && (
                        <div style={{ fontSize: 10, color: T.textFaint, marginBottom: 8, display: "flex", gap: 4 }}>
                          <span style={{ flexShrink: 0 }}>◍</span><span>{it.chip.aviso}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <MiniBtn onClick={() => setVisitFor({ id: p.id, type: "prospect", name: p.businessName })} color={T.amber}>📋 Visita</MiniBtn>
                        <MiniBtn onClick={() => setPresTarget(p)} color={T.green}>💬 Presentar</MiniBtn>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ---- Funnel ---- */}
          <div style={{ marginBottom: 20 }}>
            {seccionTitulo("Embudo")}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
              <StatCard label="Prospectos" value={funnel.counts.prospecto} icon="🎯" color={T.textMuted} />
              <StatCard label="Contactados" value={funnel.counts.contactado} icon="📞" color={T.blue} />
              <StatCard label="Visitados" value={funnel.counts.visitado} icon="✅" color={T.amber} />
              <StatCard label="Mayoristas" value={funnel.mayoristas} icon="🏪" color={T.green} />
            </div>
          </div>

          {/* ---- Zonas sin cerrar ---- */}
          {zonasSinCerrar.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              {seccionTitulo("Zonas sin mayorista")}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {zonasSinCerrar.slice(0, 6).map(z => (
                  <div key={z.zone} style={{ display: "flex", alignItems: "center", gap: 4, background: T.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 999, padding: "4px 6px 4px 12px" }}>
                    <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{z.zone}</span>
                    <span style={{ fontSize: 10, color: T.textFaint }}>({z.prospectos})</span>
                    <MiniBtn onClick={() => buscarEnZona(z.zone)} color={T.blue}>🔎</MiniBtn>
                  </div>
                ))}
                <MiniBtn onClick={() => setTab("zonas")} color={T.textMuted}>Ver todas →</MiniBtn>
              </div>
            </div>
          )}

          {/* ---- Últimas visitas (autoría visible — data compartida) ---- */}
          {ultimasVisitas.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {seccionTitulo("Últimas visitas")}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {ultimasVisitas.map(v => (
                  <div key={v.id} style={{ background: T.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: "8px 12px", display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.text, flex: 1, minWidth: 0 }}>{v.nombre}</span>
                    <span style={{ fontSize: 11, color: T.textMuted, flexShrink: 0 }}>{v.outcome}</span>
                    <span style={{ fontSize: 10, color: T.textFaint, flexShrink: 0 }}>{formatDate(v.date)} · {v.byUser}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Embudo (kanban puro) ---- */}
      {tab === "embudo" && (
        <Pipeline
          prospects={prospects} setProspects={setProspects}
          clients={clients} setClients={setClients}
          visits={visits} setVisits={setVisits}
          products={products} sales={sales}
        />
      )}

      {/* ---- Zonas ---- */}
      {tab === "zonas" && (
        <ProspectMap prospects={activeProspects} clients={clients} sales={sales} products={products} />
      )}

      {/* Modales del módulo (los dispara Hoy; el Embudo tiene los suyos adentro) */}
      <DiscoveryReviewModal
        open={revisando} onClose={() => setRevisando(false)}
        resultado={pendienteDiscovery}
        prospects={prospects} clients={clients} suprimidos={discoverySuppressed}
        onConfirm={confirmarRevision}
      />
      <DiscoverySuppressedModal
        open={suppModal} onClose={() => setSuppModal(false)}
        suprimidos={discoverySuppressed} onRehabilitar={rehabilitar}
      />
      <DiscoverySearchModal
        open={buscando} onClose={() => setBuscando(false)} onCreate={crearBusqueda}
        inicial={busquedaInicial}
      />
      <ProspectFormModal open={altaOpen} editing={null} onClose={() => setAltaOpen(false)} setProspects={setProspects} />
      <VisitModal target={visitFor} onClose={() => setVisitFor(null)}
        prospects={prospects} setProspects={setProspects} setClients={setClients} setVisits={setVisits} />
      <ProspectDiagnosisModal
        open={!!diagId} onClose={() => setDiagId(null)}
        item={diagId ? ranking.porId[diagId] : null}
        prioridadColor={PRIORIDAD_COLOR[ranking.porId[diagId]?.chip?.prioridad] ?? T.textFaint}
      />
      <PresentationMessageModal open={!!presTarget} onClose={() => setPresTarget(null)}
        target={presTarget} defaultTier="C"
        products={products} exchangeRate={exchangeRate} />
    </div>
  );
}
