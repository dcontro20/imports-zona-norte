// Métricas ejecutivas — lógica pura para el panorama "salud del negocio en 1
// pantalla" (S19). Sin side effects, testeable.

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * Proyección de cierre de mes por run-rate lineal.
 * valueSoFar acumulado hasta dayOfMonth → proyecta a daysInMonth.
 */
export function monthRunRate({ valueSoFar = 0, dayOfMonth = 1, daysInMonth = 30 }) {
  const d = Math.max(1, dayOfMonth);
  const projected = Math.round((valueSoFar / d) * daysInMonth);
  return {
    projected,
    perDay: Math.round(valueSoFar / d),
    pctOfMonth: Math.round((d / daysInMonth) * 100),
  };
}

/**
 * Score de salud del negocio 0-100, compuesto por 4 factores ponderados.
 * Es una heurística pensada para un vistazo rápido, no contabilidad exacta.
 *
 * Factores (peso):
 *   - Margen neto (30): ideal >= 30%
 *   - Crecimiento vs mes anterior (25): -25% → 0, +25% → full
 *   - Salud de inventario (25): % de stock muerto, 0% ideal, >=40% → 0
 *   - Deuda de clientes (20): deuda/ingresos, 0 ideal, >=0.5 → 0
 *
 * Devuelve { score, label, color, factors: [{ key, label, score, max }] }.
 */
export function businessHealthScore({
  netMarginPct = 0,
  revenueDeltaPct = 0,
  deadStockPct = 0,
  debtRatio = 0,
} = {}) {
  const factors = [
    { key: "margin", label: "Margen neto", max: 30, score: clamp01(netMarginPct / 30) * 30 },
    { key: "growth", label: "Crecimiento", max: 25, score: clamp01((revenueDeltaPct + 25) / 50) * 25 },
    { key: "stock", label: "Inventario sano", max: 25, score: clamp01(1 - deadStockPct / 40) * 25 },
    { key: "debt", label: "Deuda baja", max: 20, score: clamp01(1 - debtRatio / 0.5) * 20 },
  ].map(f => ({ ...f, score: Math.round(f.score) }));

  const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.score, 0)));

  let label, color;
  if (score >= 75) { label = "Excelente"; color = "#0F6B5C"; }
  else if (score >= 55) { label = "Sólido"; color = "#22C55E"; }
  else if (score >= 35) { label = "Atención"; color = "#B07A1F"; }
  else { label = "Riesgo"; color = "#B83232"; }

  return { score, label, color, factors };
}

/**
 * % de stock muerto: productos con stock > 0 que no vendieron en `days` días.
 * Sobre el total de productos con stock.
 */
export function deadStockPct(products = [], sales = [], days = 60, now = Date.now()) {
  const withStock = (products || []).filter(p => !p.isDeleted && (p.stock || 0) > 0);
  if (withStock.length === 0) return 0;
  const cutoff = now - days * 86400000;
  const soldRecently = new Set();
  (sales || []).filter(s => !s.isDeleted).forEach(s => {
    if (new Date(s.date).getTime() >= cutoff) {
      (s.items || []).forEach(it => { if (it.productId) soldRecently.add(it.productId); });
    }
  });
  const dead = withStock.filter(p => !soldRecently.has(p.id)).length;
  return Math.round((dead / withStock.length) * 100);
}
