// src/lib/dashboardAlerts.js
//
// Genera alertas del Dashboard con jerarquía y acción concreta.
//
// 3 niveles (urgencia decreciente):
//   urgent       — afecta plata HOY (agotado de top, margen crítico, deuda)
//   week         — planificar esta semana (stock bajo, caída, dormido)
//   opportunity  — vender más (stock parado, cumpleaños, restock disponible)
//
// Cada alerta:
//   { level, icon, title, detail, action: { label, page } }
// `page` matchea las keys de NAV_ITEMS en App.jsx para navegación directa.
//
// IMPORTANTE: usa filterRealProducts para NO contar el catálogo fantasma.
// Funciones PURAS.

import { filterRealProducts } from "./realProducts.js";
import { buildProductSalesStats, findVelocityDrops } from "../productIntelligence.js";
import { findLowMarginProducts } from "../pricing.js";
import { dormantClients } from "./smartOffers.js";

const MS_PER_DAY = 86400000;

export function generateDashboardAlerts({
  products = [],
  sales = [],
  purchases = [],
  clients = [],
  settings = {},
  exchangeRate = 1,
  now = new Date(),
} = {}) {
  const urgent = [];
  const week = [];
  const opportunity = [];

  // Filtramos a productos reales para NO contar el catálogo fantasma
  const realProducts = filterRealProducts(products, sales, purchases);

  const lowStockThreshold = settings.lowStockThreshold || 3;
  const willRunOutDays = settings.willRunOutDays || 7;
  const willRunOutMaxStock = settings.willRunOutMaxStock || 10;
  const staleProductDays = settings.staleProductDays || 60;
  const debtTotalAlertARS = settings.debtTotalAlertARS || 50000;

  // ============================================================
  // 🔴 URGENTE
  // ============================================================

  // Agotados de productos que SÍ tienen demanda reciente
  const outOfStock = realProducts.filter(p => (Number(p.stock) || 0) <= 0);
  if (outOfStock.length > 0) {
    const sevenAgo = new Date(now.getTime() - 7 * MS_PER_DAY).toISOString();
    const recentSold = {};
    (sales || []).filter(s => !s.isDeleted && s.date >= sevenAgo).forEach(s => {
      (s.items || []).forEach(i => {
        recentSold[i.productId] = (recentSold[i.productId] || 0) + (i.qty || 1);
      });
    });
    const popularOut = outOfStock.filter(p => recentSold[p.id] > 0);
    if (popularOut.length > 0) {
      urgent.push({
        level: "urgent",
        icon: "🚨",
        title: `${popularOut.length} agotado${popularOut.length > 1 ? "s" : ""} con demanda reciente`,
        detail: popularOut.slice(0, 3).map(p => `${p.brand} ${p.flavor || p.model}`).join(" · "),
        action: { label: "Hacer pedido", page: "procurement" },
      });
    } else if (outOfStock.length > 0) {
      // Agotados sin demanda → no urgente, va a opportunity
      opportunity.push({
        level: "opportunity",
        icon: "📦",
        title: `${outOfStock.length} agotado${outOfStock.length > 1 ? "s" : ""} sin demanda reciente`,
        detail: outOfStock.slice(0, 3).map(p => `${p.brand} ${p.flavor || p.model}`).join(" · "),
        action: { label: "Revisar stock", page: "products" },
      });
    }
  }

  // Margen crítico (<15%)
  const lowMargin = findLowMarginProducts(realProducts, { dangerPct: 15, warningPct: 25 });
  const dangerMargin = lowMargin.filter(x => x.severity === "danger");
  if (dangerMargin.length > 0) {
    urgent.push({
      level: "urgent",
      icon: "💸",
      title: `${dangerMargin.length} con margen crítico (<15%)`,
      detail: dangerMargin.slice(0, 3).map(d =>
        `${d.product.brand} ${d.product.flavor || d.product.model} (${d.marginPct}%)`
      ).join(" · "),
      action: { label: "Ajustar precio", page: "pricelog" },
    });
  }

  // Deuda total grande
  const debtors = (clients || []).filter(c => !c.isDeleted && (c.balance || 0) < 0);
  const totalDebt = debtors.reduce((s, c) => s + Math.abs(c.balance), 0);
  if (debtors.length > 0 && totalDebt > debtTotalAlertARS) {
    urgent.push({
      level: "urgent",
      icon: "💰",
      title: `${debtors.length} cliente${debtors.length > 1 ? "s" : ""} con deuda pendiente`,
      detail: `Total: $${Math.round(totalDebt).toLocaleString("es-AR")}`,
      action: { label: "Ver clientes", page: "clients" },
    });
  }

  // ============================================================
  // 🟡 ESTA SEMANA
  // ============================================================

  // Stock bajo (≤ threshold pero >0)
  const lowStock = realProducts.filter(p =>
    (Number(p.stock) || 0) > 0 && (Number(p.stock) || 0) <= lowStockThreshold
  );
  if (lowStock.length > 0) {
    week.push({
      level: "week",
      icon: "📉",
      title: `${lowStock.length} con stock bajo (≤${lowStockThreshold})`,
      detail: lowStock.slice(0, 3).map(p => `${p.brand} ${p.flavor || p.model} (${p.stock})`).join(" · "),
      action: { label: "Plan pedido", page: "procurement" },
    });
  }

  // Se agota en ≤N días al ritmo actual
  const sevenAgo = new Date(now.getTime() - 7 * MS_PER_DAY).toISOString();
  const weekItems = {};
  (sales || []).filter(s => !s.isDeleted && s.date >= sevenAgo).forEach(s => {
    (s.items || []).forEach(i => {
      weekItems[i.productId] = (weekItems[i.productId] || 0) + (i.qty || 1);
    });
  });
  const willRunOut = realProducts.filter(p => {
    const stock = Number(p.stock) || 0;
    return stock > 0 &&
      stock <= willRunOutMaxStock &&
      weekItems[p.id] > 0 &&
      stock / (weekItems[p.id] / 7) <= willRunOutDays;
  });
  if (willRunOut.length > 0) {
    week.push({
      level: "week",
      icon: "⏳",
      title: `${willRunOut.length} se agota${willRunOut.length > 1 ? "n" : ""} en ≤${willRunOutDays} días`,
      detail: willRunOut.slice(0, 3).map(p => `${p.brand} ${p.flavor || p.model}`).join(" · "),
      action: { label: "Hacer pedido", page: "procurement" },
    });
  }

  // Caída de ventas
  const stats = buildProductSalesStats(realProducts, sales, exchangeRate);
  const drops = findVelocityDrops(stats, { minMonthlyQty: 5, minDropPct: 50 });
  if (drops.length > 0) {
    week.push({
      level: "week",
      icon: "📊",
      title: `${drops.length} con caída de ventas`,
      detail: drops.slice(0, 3).map(d =>
        `${d.product.brand} ${d.product.flavor || d.product.model} (-${d.dropPct}%)`
      ).join(" · "),
      action: { label: "Ver Análisis", page: "analisis" },
    });
  }

  // Cliente dormido valioso
  const dormant = dormantClients(clients, sales, { daysThreshold: 30, exchangeRate, now });
  if (dormant.length > 0) {
    week.push({
      level: "week",
      icon: "😴",
      title: `${dormant.length} cliente${dormant.length > 1 ? "s" : ""} dormido${dormant.length > 1 ? "s" : ""}`,
      detail: dormant.slice(0, 3).map(d => `${d.client.name} (hace ${d.daysSince}d)`).join(" · "),
      action: { label: "Reactivar", page: "offers" },
    });
  }

  // ============================================================
  // 🔵 OPORTUNIDAD
  // ============================================================

  // Stock parado para liquidar
  const staleAgo = new Date(now.getTime() - staleProductDays * MS_PER_DAY).toISOString();
  const recentItems = {};
  (sales || []).filter(s => !s.isDeleted && s.date >= staleAgo).forEach(s => {
    (s.items || []).forEach(i => {
      recentItems[i.productId] = (recentItems[i.productId] || 0) + (i.qty || 1);
    });
  });
  const stale = realProducts.filter(p => (Number(p.stock) || 0) > 0 && !recentItems[p.id]);
  if (stale.length > 0) {
    opportunity.push({
      level: "opportunity",
      icon: "💤",
      title: `${stale.length} sin vender hace ${staleProductDays}+ días`,
      detail: stale.slice(0, 3).map(p => `${p.brand} ${p.flavor || p.model}`).join(" · "),
      action: { label: "Crear oferta", page: "offers" },
    });
  }

  // Cumpleaños de hoy — excluye clientes inactivos (ej: viven afuera)
  const todayMM = String(now.getMonth() + 1).padStart(2, "0");
  const todayDD = String(now.getDate()).padStart(2, "0");
  const birthdays = (clients || []).filter(c => {
    if (!c || c.isDeleted || c.inactive || !c.dateOfBirth) return false;
    return c.dateOfBirth.slice(5, 7) === todayMM && c.dateOfBirth.slice(8, 10) === todayDD;
  });
  if (birthdays.length > 0) {
    opportunity.push({
      level: "opportunity",
      icon: "🎂",
      title: `${birthdays.length} cumple${birthdays.length > 1 ? "n" : ""} hoy`,
      detail: birthdays.map(c => c.name).join(" · "),
      action: { label: "Saludar", page: "clients" },
    });
  }

  return {
    urgent,
    week,
    opportunity,
    totalCount: urgent.length + week.length + opportunity.length,
  };
}
