// src/lib/dashboardGoal.js
//
// Meta del mes — progreso de ventas vs un objetivo configurable.
// Si el usuario no configuró meta (= 0), devuelve null y la card no se muestra.
//
// Calcula también el "esperado a esta altura del mes" (prorrateado por días
// transcurridos) para que Diego sepa si va bien encaminado o atrasado.
//
// Funciones PURAS.

// Devuelve {
//   revenueARS, goalARS, pct,
//   expectedByNowARS, onTrack (revenue >= expected),
//   daysRemaining, dailyAvg, dailyNeeded,
// } o null si no hay meta configurada.
export function calcMonthGoalProgress(sales, monthlyGoalARS, exchangeRate, now = new Date()) {
  if (!monthlyGoalARS || monthlyGoalARS <= 0) return null;

  const yearMonth = now.toISOString().slice(0, 7);
  const monthSales = (sales || []).filter(s =>
    s && !s.isDeleted && (s.date || "").slice(0, 7) === yearMonth
  );

  const fallbackRate = Number(exchangeRate) || 1;
  const revenueARS = monthSales.reduce((sum, s) => {
    const total = Number(s.total) || 0;
    const cur = s.currency || "ARS";
    if (cur === "USD" || cur === "USDT") {
      const r = Number(s.exchangeRate) || fallbackRate;
      return sum + total * r;
    }
    return sum + total;
  }, 0);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysElapsed = dayOfMonth;
  const daysRemaining = daysInMonth - dayOfMonth;

  const expectedByNowARS = (monthlyGoalARS * daysElapsed) / daysInMonth;
  const dailyAvg = daysElapsed > 0 ? revenueARS / daysElapsed : 0;
  const remaining = Math.max(0, monthlyGoalARS - revenueARS);
  const dailyNeeded = daysRemaining > 0 ? remaining / daysRemaining : 0;

  return {
    revenueARS,
    goalARS: monthlyGoalARS,
    pct: (revenueARS / monthlyGoalARS) * 100,
    expectedByNowARS,
    onTrack: revenueARS >= expectedByNowARS,
    daysRemaining,
    dailyAvg,
    dailyNeeded,
  };
}
