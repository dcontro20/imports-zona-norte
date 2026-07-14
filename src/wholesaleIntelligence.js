// src/wholesaleIntelligence.js
//
// Inteligencia B2B (mayorista). Funciones PURAS. Opera sobre clientes
// type="mayorista" y ventas saleType="mayorista". Reusa el patrón de cadencia de
// clientIntelligence pero filtrado a mayorista, y calcula rentabilidad/KPIs/P&L.

import { getProductCostUSDT } from "./finance.js";

const MS_DAY = 86400000;
const toMs = (d) => new Date(d).getTime();
const saleUnits = (s) => (s?.items || []).reduce((a, i) => a + (Number(i.qty) || 0), 0);

// COGS de una venta en ARS: usa el costo snapshot (costUSDTAtSale) o cae al costo
// actual del producto. Convierte con el rate histórico de la venta.
function saleCogsARS(sale, productsById = {}) {
  const rate = Number(sale?.exchangeRate) || 0;
  let usdt = 0;
  (sale?.items || []).forEach(it => {
    const unit = Number(it.costUSDTAtSale) > 0 ? Number(it.costUSDTAtSale) : getProductCostUSDT(productsById[it.productId]);
    usdt += (Number(it.qty) || 0) * (unit || 0);
  });
  return Math.round(usdt * rate);
}

export function clientWholesaleSales(client, sales) {
  if (!client) return [];
  return (sales || [])
    .filter(s => s && !s.isDeleted && s.saleType === "mayorista" && s.clientId === client.id)
    .sort((a, b) => toMs(b.date) - toMs(a.date));
}

// Recompra esperada de un kiosco según su cadencia de pedidos mayoristas.
// Devuelve { orders, lastDate, avgDaysBetween, expectedDate, overdueDays, status } o null.
// status: "al_dia" | "por_comprar" | "atrasado"
export function expectedRepurchase(client, sales, now = Date.now()) {
  const cs = clientWholesaleSales(client, sales);
  if (cs.length === 0) return null;
  const lastMs = toMs(cs[0].date);
  let avg = null;
  if (cs.length >= 2) {
    const span = toMs(cs[0].date) - toMs(cs[cs.length - 1].date);
    avg = Math.max(1, Math.round(span / MS_DAY / (cs.length - 1)));
  }
  if (!avg) return { orders: cs.length, lastDate: cs[0].date, avgDaysBetween: null, expectedDate: null, overdueDays: null, status: "al_dia" };
  const expected = lastMs + avg * MS_DAY;
  const overdueDays = Math.floor((now - expected) / MS_DAY);
  let status;
  if (overdueDays < -3) status = "al_dia";
  else if (overdueDays <= avg * 0.5) status = "por_comprar";
  else status = "atrasado";
  return { orders: cs.length, lastDate: cs[0].date, avgDaysBetween: avg, expectedDate: new Date(expected).toISOString().slice(0, 10), overdueDays, status };
}

// Kioscos en riesgo (churn B2B): mayoristas con >=2 pedidos y recompra atrasada.
// Ordenados por días de atraso desc.
export function clientsAtRisk(clients, sales, now = Date.now()) {
  const out = [];
  (clients || []).filter(c => c && !c.isDeleted && c.type === "mayorista" && !c.inactive).forEach(c => {
    const rep = expectedRepurchase(c, sales, now);
    if (rep && rep.status === "atrasado" && rep.orders >= 2) {
      out.push({ client: c, ...rep });
    }
  });
  return out.sort((a, b) => (b.overdueDays || 0) - (a.overdueDays || 0));
}

// Ranking de kioscos por rentabilidad (ganancia = revenue − cogs) en un período.
export function rankByProfitability(clients, sales, { products = [], sinceDays = 90, now = Date.now() } = {}) {
  const productsById = {};
  (products || []).forEach(p => { if (p) productsById[p.id] = p; });
  const cutoff = now - sinceDays * MS_DAY;
  return (clients || [])
    .filter(c => c && !c.isDeleted && c.type === "mayorista")
    .map(c => {
      const cs = clientWholesaleSales(c, sales).filter(s => toMs(s.date) >= cutoff);
      let revenue = 0, cogs = 0;
      cs.forEach(s => { revenue += Number(s.total) || 0; cogs += saleCogsARS(s, productsById); });
      const margin = revenue - cogs;
      return {
        client: c, orders: cs.length,
        revenueARS: Math.round(revenue), cogsARS: Math.round(cogs), marginARS: Math.round(margin),
        marginPct: revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : 0,
      };
    })
    .filter(r => r.orders > 0)
    .sort((a, b) => b.marginARS - a.marginARS);
}

// Productos que más pegan por zona (unidades) — top N por zona.
export function productsByZone(clients, sales, products = [], topN = 5) {
  const clientById = {}; (clients || []).forEach(c => { if (c) clientById[c.id] = c; });
  const prodById = {}; (products || []).forEach(p => { if (p) prodById[p.id] = p; });
  const zones = {};
  (sales || []).filter(s => s && !s.isDeleted && s.saleType === "mayorista").forEach(s => {
    const zone = (clientById[s.clientId]?.zone || "").trim() || "Sin zona";
    (s.items || []).forEach(it => {
      if (!it.productId) return;
      zones[zone] = zones[zone] || {};
      zones[zone][it.productId] = (zones[zone][it.productId] || 0) + (Number(it.qty) || 0);
    });
  });
  const out = {};
  Object.entries(zones).forEach(([zone, byProd]) => {
    out[zone] = Object.entries(byProd)
      .map(([productId, qty]) => {
        const p = prodById[productId];
        return { productId, qty, name: p ? `${p.brand} ${p.model} ${p.flavor}`.trim() : productId };
      })
      .sort((a, b) => b.qty - a.qty)
      .slice(0, topN);
  });
  return out;
}

// KPIs del dashboard mayorista en un período.
export function wholesaleKpis(clients, sales, prospects, { periodDays = 30, now = Date.now() } = {}) {
  const cutoff = now - periodDays * MS_DAY;
  const mayoristas = (clients || []).filter(c => c && !c.isDeleted && c.type === "mayorista");
  const activos = mayoristas.filter(c => !c.inactive).length;
  const enPipeline = (prospects || []).filter(p => p && !p.isDeleted && !p.convertedClientId).length;

  const wSales = (sales || []).filter(s => s && !s.isDeleted && s.saleType === "mayorista" && toMs(s.date) >= cutoff);
  const facturacionMayorista = wSales.reduce((a, s) => a + (Number(s.total) || 0), 0);
  const ticketB2B = wSales.length > 0 ? Math.round(facturacionMayorista / wSales.length) : 0;
  const clientesQueCompraron = new Set(wSales.map(s => s.clientId)).size;

  const mSales = (sales || []).filter(s => s && !s.isDeleted && s.saleType !== "mayorista" && toMs(s.date) >= cutoff);
  const facturacionMinorista = mSales.reduce((a, s) => a + (Number(s.total) || 0), 0);

  return {
    activos, enPipeline, recompraMes: clientesQueCompraron, ticketB2B,
    facturacionMayorista: Math.round(facturacionMayorista),
    facturacionMinorista: Math.round(facturacionMinorista),
    pedidosMayorista: wSales.length,
  };
}

// Unidades COMPROMETIDAS: pedidos mayoristas confirmados no entregados. El stock ya
// se descontó al crear el pedido (Fase 1), así que esto es sólo visibilidad de lo
// que está "en la calle" (armado/en_ruta) o por salir (pendiente).
export function committedUnits(sales) {
  return (sales || [])
    .filter(s => s && !s.isDeleted && s.saleType === "mayorista" && ["pendiente", "armado", "en_ruta"].includes(s.fulfillmentStatus))
    .reduce((a, s) => a + saleUnits(s), 0);
}

// P&L mayorista vs minorista en un período (revenue, cogs, margen).
export function plByChannel(sales, { products = [], periodDays = 30, now = Date.now() } = {}) {
  const productsById = {}; (products || []).forEach(p => { if (p) productsById[p.id] = p; });
  const cutoff = now - periodDays * MS_DAY;
  const blank = () => ({ revenueARS: 0, cogsARS: 0, marginARS: 0, marginPct: 0, orders: 0 });
  const acc = { mayorista: blank(), minorista: blank() };
  (sales || []).filter(s => s && !s.isDeleted && toMs(s.date) >= cutoff).forEach(s => {
    const key = s.saleType === "mayorista" ? "mayorista" : "minorista";
    acc[key].revenueARS += Number(s.total) || 0;
    acc[key].cogsARS += saleCogsARS(s, productsById);
    acc[key].orders += 1;
  });
  ["mayorista", "minorista"].forEach(k => {
    acc[k].revenueARS = Math.round(acc[k].revenueARS);
    acc[k].cogsARS = Math.round(acc[k].cogsARS);
    acc[k].marginARS = acc[k].revenueARS - acc[k].cogsARS;
    acc[k].marginPct = acc[k].revenueARS > 0 ? Math.round((acc[k].marginARS / acc[k].revenueARS) * 1000) / 10 : 0;
  });
  return acc;
}
