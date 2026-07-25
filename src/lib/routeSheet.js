// src/lib/routeSheet.js
//
// Genera la HOJA DE RUTA en texto plano — imprimible y compartible (WhatsApp /
// copiar). Función PURA. Lista ordenada de paradas con dirección, items y total
// a cobrar por parada, más el total de la ruta.

import { resolveStop, routeTotals } from "../routes.js";

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString("es-AR")}`;
const fmtDate = (iso) => {
  const d = new Date(iso || Date.now());
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-AR");
};

// Devuelve el texto de la hoja de ruta lista para copiar/imprimir.
export function generateRouteSheet(route, { clients = [], sales = [] } = {}) {
  if (!route) return "";
  const totals = routeTotals(route, sales);
  const lines = [];
  lines.push(`🚚 HOJA DE RUTA — ${route.name || "Ruta"}`);
  lines.push(`📅 ${fmtDate(route.date)}  ·  ${totals.stops} paradas  ·  ${totals.totalUnits}u  ·  ${money(totals.totalARS)}`);
  lines.push("-----------------------------------------");

  const stops = [...(route.stops || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  stops.forEach((st, i) => {
    const r = resolveStop(st, { clients, sales });
    const mark = st.status === "entregado" ? "✅" : st.status === "no_estaba" ? "🚫" : st.status === "reprogramar" ? "↻" : "⬜";
    lines.push("");
    lines.push(`${i + 1}. ${mark} ${r.name}`);
    if (r.address) lines.push(`   📍 ${r.address}${r.zone ? ` (${r.zone})` : ""}`);
    else if (r.zone) lines.push(`   📍 ${r.zone}`);
    // Items del pedido
    (r.sale?.items || []).forEach(it => {
      lines.push(`   • ${it.qty}x ${it.name || "producto"}`);
    });
    lines.push(`   💵 A cobrar: ${money(r.totalARS)} (${r.units}u)`);
    if (r.sale?.orderNote) lines.push(`   📝 ${r.sale.orderNote}`);
    if (st.notes) lines.push(`   📝 ${st.notes}`);
  });

  lines.push("");
  lines.push("-----------------------------------------");
  lines.push(`TOTAL: ${totals.totalUnits}u · ${money(totals.totalARS)}`);
  return lines.join("\n");
}
