// Prospectos.jsx — el mini CRM de Prospect Intelligence (spec CONGELADO:
// docs/PROSPECT_CRM_SPEC.md). Una sola puerta para todo el ciclo del
// prospecto: descubrir → revisar → priorizar → visitar → contactar →
// convertir → seguimiento.
//
// F1 (esta fase): shell del módulo con pestañas — Hoy hospeda el discovery
// (mudado desde Pipeline, que vuelve a ser kanban puro), Embudo = Pipeline,
// Zonas = ProspectMap. "Para hoy" Top 5 llega en F2; la Ficha en F3.
// Los keys históricos "pipeline"/"prospectMap" entran por tabInicial (alias
// de deep-links/⌘K — sin lockout, como la regla de modos).
import { useMemo, useState } from "react";
import { uid } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Btn } from "./UI.jsx";
import { T } from "../theme.js";
import { useAppContext } from "../AppContext.js";
import { Pipeline } from "./Pipeline.jsx";
import { ProspectMap } from "./ProspectMap.jsx";
import {
  DiscoveryReviewModal, DiscoverySuppressedModal, DiscoverySearchModal, DiscoveryJobsStatus,
} from "./wholesale/DiscoveryReview.jsx";
import { altaDesdeDescubierto, suprimirDescubierto } from "../lib/discovery/discoveryImport.js";

const TABS = [
  { key: "hoy", label: "☀️ Hoy" },
  { key: "embudo", label: "🎯 Embudo" },
  { key: "zonas", label: "🗺️ Zonas" },
];

export function Prospectos({
  prospects = [], setProspects, clients = [], setClients, visits = [], setVisits,
  products = [], sales = [],
  discoveryResults = [], onConsumeDiscoveryResult,
  discoverySuppressed = [], setDiscoverySuppressed,
  discoveryJobs = [], onCreateDiscoveryJob, onCancelDiscoveryJob,
  tabInicial = "hoy",
}) {
  const { isMobile } = useResponsive();
  const { logAudit, currentUser } = useAppContext();
  const [tab, setTab] = useState(TABS.some(t => t.key === tabInicial) ? tabInicial : "hoy");
  const [revisando, setRevisando] = useState(false);
  const [suppModal, setSuppModal] = useState(false);
  const [buscando, setBuscando] = useState(false);

  const activeProspects = useMemo(() => prospects.filter(p => p && !p.isDeleted), [prospects]);
  const now = () => new Date().toISOString();

  // --- Discovery (contrato §3/§4/§7) — mudado desde Pipeline en F1 ---
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
            <Btn onClick={() => setBuscando(true)}>🔎 Descubrir</Btn>
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
          {/* F2 trae acá: "Para hoy" (Top 5), funnel, zonas resumidas y últimas visitas. */}
          {!pendienteDiscovery && discoveryJobs.filter(j => j && j.status !== "listo").length === 0 && (
            <div style={{ fontSize: 12, color: T.textFaint, textAlign: "center", padding: isMobile ? "32px 16px" : 40 }}>
              Sin búsquedas activas. Lanzá una con 🔎 Descubrir — los resultados llegan acá para revisar.
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

      {/* Modales del discovery (viven en el módulo, no en una pestaña) */}
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
      />
    </div>
  );
}
