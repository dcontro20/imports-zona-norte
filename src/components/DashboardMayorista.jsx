import { useMemo, useState } from "react";
import { formatMoney } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Card, StatCard } from "./UI.jsx";
import { T } from "../theme.js";
import {
  wholesaleKpis, plByChannel, clientsAtRisk, rankByProfitability, committedUnits,
} from "../wholesaleIntelligence.js";
import { zonesWithoutCoverage, prioritizeProspects } from "../prospecting.js";

// Dashboard del modo mayorista: KPIs B2B, P&L mayorista vs minorista, alertas
// accionables (kioscos en riesgo, zonas sin cerrar, prospectos estancados) y
// ranking de kioscos por rentabilidad. Todo derivado de la inteligencia pura.

export function DashboardMayorista({ clients = [], sales = [], products = [], prospects = [] }) {
  const { isMobile } = useResponsive();
  const [period, setPeriod] = useState(30);

  const kpis = useMemo(() => wholesaleKpis(clients, sales, prospects, { periodDays: period }), [clients, sales, prospects, period]);
  const pl = useMemo(() => plByChannel(sales, { products, periodDays: period }), [sales, products, period]);
  const atRisk = useMemo(() => clientsAtRisk(clients, sales), [clients, sales]);
  const ranking = useMemo(() => rankByProfitability(clients, sales, { products, sinceDays: 90 }).slice(0, 5), [clients, sales, products]);
  const sinCobertura = useMemo(() => zonesWithoutCoverage({ clients, prospects }), [clients, prospects]);
  const estancados = useMemo(() => prioritizeProspects(prospects).filter(p => (p.daysSinceContact || 0) >= 14), [prospects]);
  const committed = useMemo(() => committedUnits(sales), [sales]);

  const totalFact = kpis.facturacionMayorista + kpis.facturacionMinorista;
  const pctMayorista = totalFact > 0 ? Math.round((kpis.facturacionMayorista / totalFact) * 100) : 0;

  const alerts = [];
  atRisk.slice(0, 5).forEach(r => alerts.push({ color: T.red, icon: "⏰", msg: `${r.client.businessName || r.client.name} no recompra hace ${r.overdueDays}d (suele cada ${r.avgDaysBetween}d)` }));
  sinCobertura.slice(0, 4).forEach(z => alerts.push({ color: T.amber, icon: "⚡", msg: `${z.zone}: ${z.prospectos} prospecto(s) sin cerrar` }));
  estancados.slice(0, 4).forEach(p => alerts.push({ color: T.blue, icon: "🎯", msg: `${p.prospect.businessName} estancado en pipeline (${p.daysSinceContact}d sin contacto)` }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: T.text, margin: 0, fontSize: 22 }}>📊 Panel mayorista</h2>
        <div style={{ display: "flex", background: T.borderSoft, borderRadius: 8, padding: 2 }}>
          {[30, 90].map(d => (
            <button key={d} onClick={() => setPeriod(d)} style={{
              border: "none", cursor: "pointer", borderRadius: 6, padding: isMobile ? "10px 16px" : "5px 12px", fontSize: isMobile ? 13 : 12, fontWeight: 700,
              minHeight: isMobile ? 44 : undefined, fontFamily: "inherit",
              background: period === d ? T.card : "transparent", color: period === d ? T.text : T.textMuted,
              boxShadow: period === d ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
            }}>{d}d</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="Mayoristas activos" value={kpis.activos} icon="🏪" color={T.green} />
        <StatCard label="En pipeline" value={kpis.enPipeline} icon="🎯" color={T.blue} />
        <StatCard label={`Compraron (${period}d)`} value={kpis.recompraMes} icon="🔁" color={T.amber} />
        <StatCard label="Ticket B2B" value={formatMoney(kpis.ticketB2B)} icon="🧾" color={T.purple} />
      </div>

      {/* Facturación mayorista vs minorista */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, color: T.text, marginBottom: 10 }}>Facturación por canal ({period}d)</div>
        <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
          <div style={{ width: `${pctMayorista}%`, background: T.green, minWidth: pctMayorista > 0 ? 2 : 0 }} title="Mayorista" />
          <div style={{ width: `${100 - pctMayorista}%`, background: T.blue, minWidth: pctMayorista < 100 ? 2 : 0 }} title="Minorista" />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: T.green, fontWeight: 700 }}>🏪 Mayorista: {formatMoney(kpis.facturacionMayorista)} ({pctMayorista}%)</span>
          <span style={{ color: T.blue, fontWeight: 700 }}>🛒 Minorista: {formatMoney(kpis.facturacionMinorista)}</span>
        </div>
      </Card>

      {/* P&L mayorista vs minorista */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, color: T.text, marginBottom: 10 }}>P&L por canal ({period}d)</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          {[["Mayorista", pl.mayorista, T.green], ["Minorista", pl.minorista, T.blue]].map(([label, d, color]) => (
            <div key={label} style={{ border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 700, color, marginBottom: 6 }}>{label} · {d.orders} pedidos</div>
              <Row k="Facturación" v={formatMoney(d.revenueARS)} />
              <Row k="Costo (COGS)" v={formatMoney(d.cogsARS)} />
              <Row k="Ganancia" v={formatMoney(d.marginARS)} bold color={d.marginARS >= 0 ? T.green : T.red} />
              <Row k="Margen" v={`${d.marginPct}%`} color={d.marginPct >= 30 ? T.green : d.marginPct >= 20 ? T.amber : T.red} />
            </div>
          ))}
        </div>
        {committed > 0 && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 10 }}>📦 {committed} unidades comprometidas (pedidos no entregados — stock ya reservado al cargar el pedido).</div>}
      </Card>

      {/* Alertas */}
      {alerts.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 800, color: T.text, marginBottom: 10 }}>🔔 Alertas</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: T.textSub, borderLeft: `3px solid ${a.color}`, paddingLeft: 10 }}>
                <span>{a.icon}</span><span>{a.msg}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Ranking por rentabilidad */}
      <Card>
        <div style={{ fontWeight: 800, color: T.text, marginBottom: 10 }}>🏆 Top kioscos por ganancia (90d)</div>
        {ranking.length === 0 ? (
          <div style={{ color: T.textMuted, fontSize: 13 }}>Todavía no hay pedidos mayoristas en el período.</div>
        ) : ranking.map((r, i) => (
          <div key={r.client.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < ranking.length - 1 ? `1px solid ${T.borderSoft}` : "none" }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 700, color: T.text }}>{i + 1}. {r.client.businessName || r.client.name}</span>
              <span style={{ fontSize: 12, color: T.textMuted }}> · {r.orders} pedidos · margen {r.marginPct}%</span>
            </div>
            <span style={{ fontWeight: 800, color: r.marginARS >= 0 ? T.green : T.red }}>{formatMoney(r.marginARS)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Row({ k, v, bold, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "2px 0" }}>
      <span style={{ color: T.textMuted }}>{k}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: color || T.text }}>{v}</span>
    </div>
  );
}
