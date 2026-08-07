// EmbudoOperativo.jsx — la pestaña 🎯 Embudo del sistema de ejecución comercial
// (ciclo v2 F4, spec §6): tablero por las 7 etapas operativas. Reemplaza al
// kanban de captación, que ordenaba por las 3 etapas del engine + 3 columnas
// de clientes y ya no coincidía con lo que el sistema entiende por etapa.
//
// **Es una vista PANORÁMICA, no un segundo escritorio.** Hoy y Embudo son dos
// proyecciones de las MISMAS etapas (colas vs tablero); si el tablero también
// tuviera botones de acción, serían dos lugares para hacer el mismo trabajo —
// justo el ruido que el módulo evita. Por eso la card es compacta y tocarla
// abre la Ficha, que desde F4 trae la acción primaria de la etapa arriba.
//
// La columna 🏪 Cliente muestra los mayoristas: es el resultado del embudo. No
// se gestionan acá (viven en Kioscos) — cerrar la venta los saca del CRM.
import { useMemo } from "react";
import { useResponsive } from "../../App.jsx";
import { Btn, Badge, downloadCSV } from "../UI.jsx";
import { T } from "../../theme.js";
import { ETAPAS_OPERATIVAS, etapaOperativa } from "../../lib/prospectEtapas.js";
import { prospectsToCSV } from "../../lib/wholesaleExport.js";
import { ProspectMapsLine } from "./ProspectMapsLine.jsx";
import { PRIORIDAD_COLOR } from "./ColasProspectos.jsx";

export function EmbudoOperativo({
  prospects = [], clients = [], visits = [], ranking, onOpenFicha, onNuevo,
}) {
  const { isMobile } = useResponsive();

  const mayoristas = useMemo(
    () => clients.filter(c => c && !c.isDeleted && c.type === "mayorista"),
    [clients],
  );

  // Cada prospecto en UNA columna, ordenado por el ranking del engine (el
  // mismo orden que dentro de las colas: una sola idea de "qué conviene más").
  const porEtapa = useMemo(() => {
    const mapa = Object.fromEntries(ETAPAS_OPERATIVAS.map(e => [e.key, []]));
    for (const p of prospects) {
      if (!p || p.isDeleted || p.convertedClientId) continue;
      const etapa = etapaOperativa(p, { visits });
      if (mapa[etapa]) mapa[etapa].push(p);
    }
    for (const key of Object.keys(mapa)) {
      mapa[key].sort((a, b) =>
        (ranking?.porId[a.id]?.posicion ?? Infinity) - (ranking?.porId[b.id]?.posicion ?? Infinity));
    }
    mapa.cliente = mayoristas;
    return mapa;
  }, [prospects, visits, ranking, mayoristas]);

  const totalProspectos = ETAPAS_OPERATIVAS
    .filter(e => e.key !== "cliente")
    .reduce((n, e) => n + porEtapa[e.key].length, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: T.text, margin: 0, fontSize: 18 }}>Embudo de captación</h2>
          <div style={{ fontSize: 11, color: T.textFaint, marginTop: 2 }}>
            {totalProspectos} en juego · {mayoristas.length} cerrados
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {totalProspectos > 0 && (
            <Btn variant="secondary" onClick={() => downloadCSV(
              `prospectos_${new Date().toISOString().slice(0, 10)}.csv`, prospectsToCSV(prospects))}>
              📥 CSV
            </Btn>
          )}
          <Btn onClick={onNuevo}>+ Nuevo prospecto</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(7, minmax(0, 1fr))", gap: 10 }}>
        {ETAPAS_OPERATIVAS.map(etapa => {
          const items = porEtapa[etapa.key];
          const esCliente = etapa.key === "cliente";
          return (
            <div key={etapa.key} style={{ background: T.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 8, minHeight: isMobile ? 0 : 80 }}>
              <div style={{
                fontSize: 12, fontWeight: 800, color: esCliente ? T.green : T.textSub,
                marginBottom: isMobile && items.length === 0 ? 0 : 8, display: "flex",
                justifyContent: "space-between", alignItems: "center", gap: 4,
                minHeight: isMobile ? 28 : undefined,
              }}>
                <span style={{ minWidth: 0 }}>{etapa.icono} {etapa.etiqueta}</span>
                <span style={{ color: T.textFaint, flexShrink: 0 }}>{items.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map(x => {
                  const chip = esCliente ? null : ranking?.porId[x.id]?.chip;
                  return (
                    <div key={x.id}
                      onClick={esCliente ? undefined : () => onOpenFicha?.(x.id)}
                      title={esCliente ? "Se gestiona en Kioscos" : "Abrir ficha"}
                      style={{
                        background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
                        padding: 10, cursor: esCliente ? "default" : "pointer",
                      }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                        <div style={{ fontWeight: 700, color: T.text, fontSize: 13, flex: 1, minWidth: 0 }}>
                          {x.businessName || x.name}
                          {/* espacio duro: el chevron nunca se separa del nombre al envolver */}
                          {!esCliente && <span style={{ color: T.textFaint, fontWeight: 400 }}>{" ›"}</span>}
                        </div>
                        {chip && <span style={{ flexShrink: 0 }}><Badge color={PRIORIDAD_COLOR[chip.prioridad] ?? T.textFaint}>{chip.etiqueta}</Badge></span>}
                      </div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                        {x.zone || "sin zona"}{x.contactName ? ` · ${x.contactName}` : ""}
                      </div>
                      {!esCliente && <ProspectMapsLine prospect={x} style={{ marginTop: 2 }} />}
                    </div>
                  );
                })}
                {/* Mobile: etapa vacía = solo el header compacto (con 7 etapas
                    apiladas, los "—" alargaban el scroll al pedo). */}
                {items.length === 0 && !isMobile && (
                  <div style={{ fontSize: 11, color: T.textFaint, textAlign: "center", padding: 8 }}>—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
