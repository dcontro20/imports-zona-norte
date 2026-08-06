// Prospectos.jsx — la estación de trabajo de ventas (ciclo v2, spec CONGELADO
// docs/PROSPECT_CRM_EJECUCION_SPEC.md). Una sola puerta para todo el ciclo:
// descubrir → analizar → ejecutar → seguir → convertir.
//
// F3 (esta fase) cambió la tesis de ☀️ Hoy: dejó de ser un tablero con varios
// bloques (Top 5 + funnel + zonas + últimas visitas, todos compitiendo) y pasó
// a ser COLAS DE ACCIÓN — una sola cola activa a la vez, con su acción
// primaria. La cola 🔍 es un deck de análisis (la única decisión comercial del
// flujo); las demás son listas de ejecución con la misma gramática.
// El funnel se mudó al Embudo (F4) y el histórico de visitas a la Actividad de
// la Ficha: acá solo va lo que pide acción HOY.
//
// Consumo del engine: SOLO la fachada (buildProspectRanking) — regla intacta.
// Los keys históricos "pipeline"/"prospectMap" entran por tabInicial (alias de
// deep-links/⌘K — sin lockout, como la regla de modos).
import { useMemo, useState } from "react";
import { uid, formatDate } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Btn, MiniBtn, Toast, useToast } from "./UI.jsx";
import { T } from "../theme.js";
import { useAppContext } from "../AppContext.js";
import { zonesWithoutCoverage } from "../prospecting.js";
import { buildProspectRanking } from "../lib/prospectRanking.js";
import { EmbudoOperativo } from "./wholesale/EmbudoOperativo.jsx";
import { ProspectMap } from "./ProspectMap.jsx";
import { PresentationMessageModal } from "./wholesale/PresentationMessageModal.jsx";
import { ProspectFormModal } from "./wholesale/ProspectFormModal.jsx";
import { VisitModal } from "./wholesale/VisitModal.jsx";
import { ProspectFicha } from "./wholesale/ProspectFicha.jsx";
import { makeProspectActions } from "./wholesale/prospectActions.js";
import {
  DiscoverySuppressedModal, DiscoverySearchModal, DiscoveryJobsStatus,
} from "./wholesale/DiscoveryReview.jsx";
import { ETAPAS_OPERATIVAS, etapaOperativa, conteoPorEtapa, subEstadoEspera, conEtapaLegacy } from "../lib/prospectEtapas.js";
import { clavesDeRegistro } from "../lib/discovery/discoveryImport.js";
import { BarraColas, DeckAnalisis, ColaLista, COLAS, PRIORIDAD_COLOR } from "./wholesale/ColasProspectos.jsx";

const TABS = [
  { key: "hoy", label: "☀️ Hoy" },
  { key: "embudo", label: "🎯 Embudo" },
  { key: "zonas", label: "🗺️ Zonas" },
];


export function Prospectos({
  prospects = [], setProspects, clients = [], setClients, visits = [], setVisits,
  products = [], sales = [], auditLog = [],
  discoverySuppressed = [], setDiscoverySuppressed,
  discoveryJobs = [], onCreateDiscoveryJob, onCancelDiscoveryJob,
  tabInicial = "hoy",
}) {
  const { isMobile } = useResponsive();
  const { logAudit, currentUser, exchangeRate } = useAppContext();
  const [tab, setTab] = useState(TABS.some(t => t.key === tabInicial) ? tabInicial : "hoy");
  const [suppModal, setSuppModal] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [busquedaInicial, setBusquedaInicial] = useState(null); // pre-carga de "buscar en esta zona"
  const [altaOpen, setAltaOpen] = useState(false);
  const [editando, setEditando] = useState(null);     // prospecto en edición (desde la Ficha)
  const [visitFor, setVisitFor] = useState(null);
  const [presTarget, setPresTarget] = useState(null);
  const [fichaId, setFichaId] = useState(null);       // la Ficha: el expediente permanente
  const [colaSel, setColaSel] = useState(null);       // cola elegida a mano (null = la que propone el sistema)
  const [toast, showToast] = useToast();

  const activeProspects = useMemo(() => prospects.filter(p => p && !p.isDeleted), [prospects]);
  const now = () => new Date().toISOString();

  // --- Las colas: el engine ordena DENTRO de cada una; la etapa decide en cuál ---
  // Adapter del §4 del spec: el engine (y el funnel, y las zonas) siguen
  // leyendo `pipelineStage`. Se lo entregamos DERIVADO de la etapa operativa,
  // así el motor y la pantalla nunca cuentan historias distintas. El engine no
  // se toca — sigue recibiendo las 3 etapas que conoce.
  const prospectsParaEngine = useMemo(
    () => conEtapaLegacy(prospects, { visits }), [prospects, visits],
  );
  const ranking = useMemo(
    () => buildProspectRanking({ prospects: prospectsParaEngine, visits, clients, sales, products }),
    [prospectsParaEngine, visits, clients, sales, products],
  );
  const { conteo, vencidos } = useMemo(
    () => conteoPorEtapa(prospects, { visits }), [prospects, visits],
  );
  // Un prospecto vive en UNA cola. El orden dentro de la cola es el del
  // ranking del engine (ya viene ordenado en ranking.items).
  const porCola = useMemo(() => {
    const mapa = Object.fromEntries(COLAS.map(c => [c.key, []]));
    for (const it of ranking.items) {
      const p = it.prospect;
      if (!p || p.isDeleted || p.convertedClientId) continue;
      const etapa = etapaOperativa(p, { visits });
      if (mapa[etapa]) mapa[etapa].push(it);
    }
    // Dentro de la espera, lo vencido primero: es lo único que pide acción.
    mapa.esperando_respuesta.sort((a, b) =>
      (subEstadoEspera(b.prospect) === "reintentar") - (subEstadoEspera(a.prospect) === "reintentar"));
    return mapa;
  }, [ranking, visits]);

  // La cola activa: la que el usuario eligió, o —si no eligió o la que eligió
  // se quedó sin trabajo— la primera con trabajo en el orden del flujo. Así la
  // pantalla siempre está mostrando la siguiente acción, sin pedir nada.
  const primeraConTrabajo = COLAS.find(c => (conteo[c.key] || 0) > 0)?.key || "por_analizar";
  const colaActiva = (colaSel && (conteo[colaSel] > 0 || colaSel === "por_analizar"))
    ? colaSel : primeraConTrabajo;
  const cola = COLAS.find(c => c.key === colaActiva) || COLAS[0];

  // Con la cola 🔍 vacía, el deck señala dónde quedó el trabajo en vez de
  // dejar al usuario mirando una pantalla vacía (y sin sacarlo de 🔍 a la
  // fuerza: ahí vive el descubrimiento).
  const siguienteConTrabajo = useMemo(() => {
    const c = COLAS.find(x => x.key !== "por_analizar" && (conteo[x.key] || 0) > 0);
    return c ? { ...c, cantidad: conteo[c.key], onIr: () => setColaSel(c.key) } : null;
  }, [conteo]);

  const zonasSinCerrar = useMemo(
    () => zonesWithoutCoverage({ clients, prospects: activeProspects }),
    [clients, activeProspects],
  );

  // --- Discovery (contrato §3/§7 + enmienda §4: auto-ingesta) ---
  // La ingesta del staging NO vive acá: corre a nivel app (App.jsx) para que
  // los descubiertos entren aunque Diego esté en otra pantalla.
  // Rehabilitar = deshacer el descarte ENTERO. Antes solo borraba el bloqueo de
  // supresión, porque el descarte ocurría ANTES de que el prospecto existiera
  // (modal de revisión). Desde la auto-ingesta el descarte también soft-borra
  // el prospecto ya creado: si no lo devolvemos, "rehabilitar" no devolvía
  // nada y el negocio solo volvía con una búsqueda nueva.
  const rehabilitar = (s) => {
    setDiscoverySuppressed?.(prev => prev.filter(e => e.id !== s.id));
    // El prospecto a devolver se busca ACÁ, no adentro del updater: el updater
    // corre después (y puede correr dos veces en StrictMode), así que no sirve
    // ni para decidir el mensaje ni para nada observable.
    const claves = clavesDeRegistro(s);
    const objetivo = prospects.find(p =>
      p?.isDeleted && p.descartadoAt && [...clavesDeRegistro(p)].some(k => claves.has(k)));
    if (objetivo) {
      setProspects(prev => prev.map(p => {
        if (p?.id !== objetivo.id) return p;
        const { isDeleted, deletedAt, deletedBy, descartadoAt, ...limpio } = p;
        return limpio;
      }));
    }
    logAudit?.("rehab", "prospect", s.id, `Rehabilitado del descarte: ${s.nombre || s.web}`);
    showToast(objetivo
      ? `${s.nombre || "El negocio"} volvió a 🔍 Por analizar`
      : `${s.nombre || "El negocio"} puede volver a aparecer en próximas búsquedas`);
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

  // Hechos / avanzar / convertir / descartar: la MISMA fuente que el kanban y
  // la Ficha. Si esto divergiera, dos pantallas contarían historias distintas.
  // Cada hecho reubica al prospecto en silencio (la etapa se deriva). El aviso
  // cierra el lazo: qué pasó y A DÓNDE fue. Transitorio — no compite con la cola.
  const avisarHecho = (p, hecho) => {
    const nombre = p?.businessName || "El prospecto";
    if (hecho === "convertido") return showToast(`🏪 ${nombre} ya es mayorista — seguí en Kioscos`);
    if (hecho === "descartado") return showToast(`✗ ${nombre} descartado — no vuelve a aparecer`);
    if (hecho === "descartado_sin_memoria") return showToast(`✗ ${nombre} descartado (sin datos para recordarlo)`);
    const destino = ETAPAS_OPERATIVAS.find(e => e.key === etapaOperativa(p, { visits }));
    if (destino) showToast(`${nombre} → ${destino.icono} ${destino.etiqueta}`);
  };
  const acciones = makeProspectActions({
    setProspects, setClients, setDiscoverySuppressed, logAudit, currentUser, onHecho: avisarHecho,
  });

  // Las herramientas de descubrimiento viven DENTRO de la cola 🔍 (spec §6):
  // conseguir negocios nuevos es parte de "analizar", no un bloque aparte que
  // compita con la cola activa.
  const herramientasDescubrimiento = (
    <div style={{ borderTop: `1px solid ${T.borderSoft}`, paddingTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: T.textSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        Conseguir más
      </div>
      <DiscoveryJobsStatus jobs={discoveryJobs} onCancel={cancelarBusqueda} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Btn onClick={abrirBusqueda}>🔎 Descubrir</Btn>
        {discoverySuppressed.length > 0 && (
          <Btn variant="secondary" onClick={() => setSuppModal(true)}>⛔ Descartados ({discoverySuppressed.length})</Btn>
        )}
      </div>
      {zonasSinCerrar.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 6 }}>Zonas sin mayorista — buscar ahí:</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {zonasSinCerrar.slice(0, 6).map(z => (
              <div key={z.zone} style={{ display: "flex", alignItems: "center", gap: 4, background: T.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 999, padding: "4px 6px 4px 12px" }}>
                <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{z.zone}</span>
                <span style={{ fontSize: 10, color: T.textFaint }}>({z.prospectos})</span>
                <MiniBtn onClick={() => buscarEnZona(z.zone)} color={T.blue}>🔎</MiniBtn>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* Header del módulo + pestañas */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ color: T.text, margin: 0, fontSize: 22 }}>🎯 Prospectos</h2>
        {tab === "hoy" && (
          <Btn variant="secondary" onClick={() => setAltaOpen(true)}>+ Nuevo prospecto</Btn>
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
      {/* key={tab} remonta el contenido al cambiar de pestaña: el fadeIn de
          180ms da el feedback de "cambió la vista" (D-A, criterio conservador) */}
      {/* ---- Hoy = colas de acción ---- */}
      {tab === "hoy" && (
        <div key="hoy" style={{ animation: "fadeIn 180ms ease-out" }}>
          <BarraColas conteo={conteo} vencidos={vencidos} activa={colaActiva} onSelect={setColaSel} />
          {/* key={colaActiva}: el fade avisa que cambió la cola (D-A) */}
          <div key={colaActiva} style={{ animation: "fadeIn 180ms ease-out" }}>
            {colaActiva === "por_analizar" ? (
              <DeckAnalisis
                items={porCola.por_analizar} acciones={acciones} onFicha={setFichaId}
                herramientas={herramientasDescubrimiento}
                siguiente={siguienteConTrabajo}
              />
            ) : (
              <ColaLista
                cola={cola} items={porCola[colaActiva]} visits={visits} acciones={acciones}
                onFicha={setFichaId}
                onVisita={(p) => setVisitFor({ id: p.id, type: "prospect", name: p.businessName })}
                onPresentar={(p) => setPresTarget(p)}
                prioridadColor={(it) => PRIORIDAD_COLOR[it.chip?.prioridad] ?? T.textFaint}
              />
            )}
          </div>
        </div>
      )}

      {/* ---- Embudo: el tablero por las 7 etapas operativas (F4) ---- */}
      {tab === "embudo" && (
        <div key="embudo" style={{ animation: "fadeIn 180ms ease-out" }}>
          <EmbudoOperativo
            prospects={prospects} clients={clients} visits={visits}
            ranking={ranking} onOpenFicha={setFichaId} onNuevo={() => setAltaOpen(true)}
          />
        </div>
      )}

      {/* ---- Zonas ---- */}
      {tab === "zonas" && (
        <div key="zonas" style={{ animation: "fadeIn 180ms ease-out" }}>
          <ProspectMap prospects={activeProspects} clients={clients} sales={sales} products={products} />
        </div>
      )}

      {/* Modales del módulo (los dispara Hoy; el Embudo tiene los suyos adentro) */}
      <DiscoverySuppressedModal
        open={suppModal} onClose={() => setSuppModal(false)}
        suprimidos={discoverySuppressed} onRehabilitar={rehabilitar}
      />
      <DiscoverySearchModal
        open={buscando} onClose={() => setBuscando(false)} onCreate={crearBusqueda}
        inicial={busquedaInicial}
      />
      <ProspectFormModal open={altaOpen || !!editando} editing={editando}
        onClose={() => { setAltaOpen(false); setEditando(null); }} setProspects={setProspects} />
      <VisitModal target={visitFor} onClose={() => setVisitFor(null)}
        prospects={prospects} setProspects={setProspects} setClients={setClients} setVisits={setVisits} />
      {/* La Ficha: el centro operativo del prospecto (F3) */}
      {fichaId && ranking.porId[fichaId] && (
        <ProspectFicha
          item={ranking.porId[fichaId]}
          prioridadColor={PRIORIDAD_COLOR[ranking.porId[fichaId]?.chip?.prioridad] ?? T.textFaint}
          visits={visits} auditLog={auditLog}
          onClose={() => setFichaId(null)}
          onVisita={(p) => setVisitFor({ id: p.id, type: "prospect", name: p.businessName })}
          onPresentar={(p) => setPresTarget(p)}
          onEditar={(p) => setEditando(p)}
          acciones={acciones}
        />
      )}
      {/* Presentar registra el hecho al mandar: de ahí sale la etapa ⏳ */}
      <PresentationMessageModal open={!!presTarget} onClose={() => setPresTarget(null)}
        target={presTarget} defaultTier="C"
        products={products} exchangeRate={exchangeRate}
        onEnviado={(p) => acciones.mensajeEnviado(p)} />
      <Toast message={toast} />
    </div>
  );
}
