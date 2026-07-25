import { useMemo } from "react";
import { useResponsive } from "../App.jsx";
import { Card, StatCard } from "./UI.jsx";
import { T } from "../theme.js";
import { zonesCoverage, zonesWithoutCoverage } from "../prospecting.js";
import { productsByZone } from "../wholesaleIntelligence.js";

// Mapa de prospección — VISTA POR ZONA (cobertura). El mapa geográfico con pins
// llega junto con Google Places (2.5, diferido). Por ahora, para prospección
// manual, lo accionable es: dónde tenés mayoristas activos y dónde solo hay
// prospectos (zonas a cerrar) o nada (zonas a atacar). Alta de prospectos = Pipeline.

export function ProspectMap({ prospects = [], clients = [], sales = [], products = [] }) {
  const { isMobile } = useResponsive();

  const zones = useMemo(() => zonesCoverage({ clients, prospects }), [clients, prospects]);
  const sinCobertura = useMemo(() => zonesWithoutCoverage({ clients, prospects }), [clients, prospects]);
  // Tanda F: qué se vende en cada zona (top 3 por unidades). Vive acá y no en
  // el Panel porque ESTA es la pantalla zona-céntrica: al decidir qué zona
  // atacar, saber qué pega en las vecinas arma la oferta de entrada.
  const ventasPorZona = useMemo(() => productsByZone(clients, sales, products, 3), [clients, sales, products]);
  const totalActivos = zones.reduce((s, z) => s + z.activos, 0);
  const totalProspectos = zones.reduce((s, z) => s + z.prospectos, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: T.text, margin: 0, fontSize: 22 }}>🗺️ Prospección por zona</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="Zonas con actividad" value={zones.length} icon="🗺️" color={T.blue} />
        <StatCard label="Mayoristas activos" value={totalActivos} icon="🏪" color={T.green} />
        <StatCard label="Prospectos" value={totalProspectos} icon="🎯" color={T.amber} />
      </div>

      {/* Zonas a cerrar: hay prospectos pero ningún mayorista activo */}
      {sinCobertura.length > 0 && (
        <Card style={{ marginBottom: 16, background: T.amberBg, border: `1px solid ${T.amberBorder}` }}>
          <div style={{ fontWeight: 800, color: T.amber, marginBottom: 8 }}>
            ⚡ {sinCobertura.length} zona{sinCobertura.length > 1 ? "s" : ""} con prospectos pero SIN mayorista cerrado
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {sinCobertura.map(z => (
              <span key={z.zone} style={{ background: T.card, border: `1px solid ${T.amberBorder}`, borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600, color: T.text }}>
                {z.zone} · {z.prospectos} prospecto{z.prospectos > 1 ? "s" : ""}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Cobertura por zona */}
      {zones.length === 0 ? (
        <Card><div style={{ textAlign: "center", color: T.textMuted, padding: isMobile ? "32px 16px" : 48 }}>
          Todavía no hay clientes ni prospectos con zona cargada. Agregá prospectos desde <b>Pipeline</b>.
        </div></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {zones.map(z => {
            const cubierta = z.activos > 0;
            return (
              <Card key={z.zone} style={{ borderLeft: `4px solid ${cubierta ? T.green : T.amber}` }}>
                <div style={{ fontWeight: 800, color: T.text, fontSize: 15, marginBottom: 8 }}>{z.zone}</div>
                <div style={{ display: "flex", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: T.green }}>{z.activos}</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>mayoristas</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: T.amber }}>{z.prospectos}</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>prospectos</div>
                  </div>
                </div>
                {!cubierta && <div style={{ marginTop: 8, fontSize: 12, color: T.amber, fontWeight: 600 }}>⚡ Zona a cerrar</div>}
              </Card>
            );
          })}
        </div>
      )}

      {Object.keys(ventasPorZona).length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 800, color: T.text, marginBottom: 4 }}>🏆 Qué se vende por zona</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 12 }}>
            Top 3 por unidades (ventas mayoristas). Útil para armar la oferta al atacar una zona nueva: arrancá por lo que ya pega cerca.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {Object.entries(ventasPorZona).map(([zone, tops]) => (
              <div key={zone} style={{ border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: 12 }}>
                <div style={{ fontWeight: 700, color: T.text, fontSize: 13, marginBottom: 6 }}>📍 {zone}</div>
                {tops.map((t, i) => (
                  <div key={t.productId} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: T.textSub, padding: "3px 0" }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i + 1}. {t.name}</span>
                    <span style={{ flexShrink: 0, fontWeight: 700, color: T.text }}>{t.qty}u</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}

      <p style={{ fontSize: 12, color: T.textFaint, marginTop: 16 }}>
        El mapa geográfico con pins llega junto con la búsqueda automática (Google Places), diferida.
        Por ahora la prospección es manual desde <b>Pipeline</b>.
      </p>
    </div>
  );
}
