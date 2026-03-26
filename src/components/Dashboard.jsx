import { useState, useMemo } from "react";
import { formatMoney, formatDate } from "../helpers.js";
import { Card, StatCard, Badge } from "./UI.jsx";
import { BRAND_COLORS } from "../constants.js";

// -- DASHBOARD PROFESIONAL --
export const Dashboard = ({ products, sales, purchases, expenses, withdrawals, exchangeRate }) => {
  const now = new Date();
  const today = now.toDateString();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const [period, setPeriod] = useState("month"); // "today" | "week" | "month"

  // ---- Date filters ----
  const isToday = (d) => new Date(d).toDateString() === today;
  const isThisWeek = (d) => {
    const date = new Date(d);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return date >= startOfWeek && date <= now;
  };
  const isThisMonth = (d) => {
    const date = new Date(d);
    return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
  };

  const filterByPeriod = (arr, dateField = "date") => {
    if (period === "today") return arr.filter(x => isToday(x[dateField]));
    if (period === "week") return arr.filter(x => isThisWeek(x[dateField]));
    return arr.filter(x => isThisMonth(x[dateField]));
  };

  // ---- Core metrics ----
  const periodSales = filterByPeriod(sales);
  const periodExpenses = filterByPeriod(expenses);
  const periodPurchases = filterByPeriod(purchases);
  const periodWithdrawals = filterByPeriod(withdrawals || []);

  // Revenue in USD (normalize everything to USD)
  const revenueUSD = periodSales.reduce((sum, s) => {
    if (s.currency === "ARS") return sum + (s.total / exchangeRate);
    return sum + s.total; // USD or USDT
  }, 0);

  const revenueARS = periodSales.reduce((sum, s) => {
    if (s.currency === "USD" || s.currency === "USDT") return sum + s.total * exchangeRate;
    return sum + s.total;
  }, 0);

  // Cost of goods sold (from items sold)
  const cogsUSD = periodSales.reduce((sum, s) => {
    return sum + (s.items || []).reduce((isum, item) => {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) return isum;
      // Estimate cost using the pricing formula from RESUMEN
      const costUSDT = prod.costUSDT || 0;
      const realCost = costUSDT > 0 ? (costUSDT * 1.01 * 1.05) + 0.40 : (prod.priceUSD || 0) * 0.52;
      return isum + realCost * item.qty;
    }, 0);
  }, 0);

  const expensesUSD = periodExpenses.reduce((sum, e) => {
    if (e.amountUSD) return sum + e.amountUSD;
    return sum + ((e.amountARS || 0) / exchangeRate);
  }, 0);

  const purchasesUSDT = periodPurchases.reduce((sum, p) => sum + (p.totalUSDT || 0), 0);

  const grossProfitUSD = revenueUSD - cogsUSD;
  const netProfitUSD = revenueUSD - cogsUSD - expensesUSD;

  // Stock metrics
  const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
  const stockValueUSD = products.reduce((sum, p) => sum + (p.stock || 0) * (p.priceUSD || 0), 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= 3);

  // Sales by payment method
  const salesByMethod = useMemo(() => {
    const methods = {};
    periodSales.forEach(s => {
      const m = s.paymentMethod || "Otro";
      if (!methods[m]) methods[m] = { count: 0, totalARS: 0 };
      methods[m].count += 1;
      if (s.currency === "USD" || s.currency === "USDT") {
        methods[m].totalARS += s.total * exchangeRate;
      } else {
        methods[m].totalARS += s.total;
      }
    });
    return Object.entries(methods).sort((a, b) => b[1].totalARS - a[1].totalARS);
  }, [periodSales, exchangeRate]);

  // Sales by brand
  const salesByBrand = useMemo(() => {
    const brands = {};
    periodSales.forEach(s => {
      (s.items || []).forEach(item => {
        const prod = products.find(p => p.id === item.productId);
        if (!prod) return;
        if (!brands[prod.brand]) brands[prod.brand] = { qty: 0, revenue: 0 };
        brands[prod.brand].qty += item.qty;
        brands[prod.brand].revenue += (item.priceUSD || prod.priceUSD || 0) * item.qty;
      });
    });
    return Object.entries(brands).sort((a, b) => b[1].qty - a[1].qty);
  }, [periodSales, products]);

  // Top products
  const topProducts = useMemo(() => {
    const counts = {};
    periodSales.forEach(s => (s.items || []).forEach(item => {
      counts[item.productId] = (counts[item.productId] || 0) + item.qty;
    }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([pid, qty]) => {
      const prod = products.find(p => p.id === pid);
      return { name: prod ? `${prod.brand} ${prod.model} - ${prod.flavor}` : "Desconocido", brand: prod?.brand, qty };
    });
  }, [periodSales, products]);

  // Partner metrics
  const diegoSales = periodSales.filter(s => s.createdBy === "Diego");
  const gustavoSales = periodSales.filter(s => s.createdBy === "Gustavo");
  const diegoRevenue = diegoSales.reduce((sum, s) => {
    if (s.currency === "ARS") return sum + (s.total / exchangeRate);
    return sum + s.total;
  }, 0);
  const gustavoRevenue = gustavoSales.reduce((sum, s) => {
    if (s.currency === "ARS") return sum + (s.total / exchangeRate);
    return sum + s.total;
  }, 0);

  // Mermas
  const totalMermas = periodWithdrawals.reduce((s, w) => s + w.qty, 0);
  const mermasValueUSD = periodWithdrawals.reduce((s, w) => s + (w.costEstimateUSD || 0), 0);

  // Discounts given
  const totalDiscounts = periodSales.reduce((s, sale) => s + (sale.discountAmount || 0), 0);

  // Sales velocity
  const daysInPeriod = period === "today" ? 1 : period === "week" ? 7 : now.getDate();
  const avgSalesPerDay = periodSales.length > 0 ? (periodSales.length / daysInPeriod).toFixed(1) : "0";
  const avgUnitsPerDay = periodSales.reduce((s, sale) => s + (sale.items || []).reduce((is, i) => is + i.qty, 0), 0) / daysInPeriod;

  // Recent sales (last 5)
  const recentSales = [...sales].slice(0, 5);

  const periodLabels = { today: "Hoy", week: "Esta semana", month: "Este mes" };

  // Simple bar component
  const Bar = ({ value, max, color }) => (
    <div style={{ flex: 1, height: 6, background: "#f0f1f5", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
    </div>
  );

  return (
    <div>
      {/* Header with period selector */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22, fontWeight: 800 }}>Panel de Control</h2>
          <p style={{ color: "#6b7280", margin: "4px 0 0", fontSize: 13 }}>
            Blue: <span style={{ color: "#1a1a2e", fontWeight: 700 }}>${exchangeRate}</span> · {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div style={{ display: "flex", gap: 4, background: "#f0f1f5", borderRadius: 8, padding: 3 }}>
          {["today", "week", "month"].map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: "6px 14px", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: "pointer", transition: "all 0.2s",
              background: period === p ? "#fff" : "transparent",
              color: period === p ? "#6366f1" : "#6b7280",
              boxShadow: period === p ? "0 1px 3px rgba(0,0,0,0.08)" : "none"
            }}>{periodLabels[p]}</button>
          ))}
        </div>
      </div>

      {/* KPI Cards - Row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 16 }}>
        <Card style={{ background: "linear-gradient(135deg, #6366f1 0%, #818cf8 100%)", border: "none" }}>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>Ventas</div>
          <div style={{ color: "#fff", fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{periodSales.length}</div>
          <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 6 }}>{formatMoney(revenueUSD, "USD")} · {formatMoney(revenueARS)}</div>
        </Card>

        <Card style={{ background: "linear-gradient(135deg, #059669 0%, #34d399 100%)", border: "none" }}>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>Ganancia Neta</div>
          <div style={{ color: "#fff", fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{formatMoney(netProfitUSD, "USD")}</div>
          <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 6 }}>{formatMoney(netProfitUSD * exchangeRate)} ARS</div>
        </Card>

        <Card style={{ position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 10, right: 14, fontSize: 28, opacity: 0.1 }}>📦</div>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>Stock</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#f59e0b", lineHeight: 1 }}>{totalStock}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>Valor: {formatMoney(stockValueUSD, "USD")}</div>
        </Card>

        <Card style={{ position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 10, right: 14, fontSize: 28, opacity: 0.1 }}>📊</div>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>Velocidad</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#6366f1", lineHeight: 1 }}>{avgSalesPerDay}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>ventas/día · {avgUnitsPerDay.toFixed(1)} uds/día</div>
        </Card>
      </div>

      {/* KPI Cards - Row 2: Financials */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
        <Card style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Gastos</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#e74c3c" }}>{formatMoney(expensesUSD, "USD")}</div>
        </Card>
        <Card style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Compras USDT</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#e17055" }}>{formatMoney(purchasesUSDT, "USDT")}</div>
        </Card>
        <Card style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Mermas</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#f59e0b" }}>{totalMermas} <span style={{ fontSize: 12, fontWeight: 600 }}>uds</span></div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{formatMoney(mermasValueUSD, "USD")} perdido</div>
        </Card>
        <Card style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Descuentos</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#8b5cf6" }}>{formatMoney(totalDiscounts)}</div>
        </Card>
      </div>

      {/* Main content grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* Ventas por socio */}
        <Card>
          <h4 style={{ color: "#1a1a2e", margin: "0 0 16px", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Ventas por socio</h4>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1, textAlign: "center", padding: "12px 0", background: "#f5f3ff", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>DIEGO</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#6366f1" }}>{diegoSales.length}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{formatMoney(diegoRevenue, "USD")}</div>
            </div>
            <div style={{ flex: 1, textAlign: "center", padding: "12px 0", background: "#ecfdf5", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>GUSTAVO</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#059669" }}>{gustavoSales.length}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{formatMoney(gustavoRevenue, "USD")}</div>
            </div>
          </div>
        </Card>

        {/* Métodos de pago */}
        <Card>
          <h4 style={{ color: "#1a1a2e", margin: "0 0 16px", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Métodos de pago</h4>
          {salesByMethod.length === 0 ? <p style={{ color: "#9ca3af", fontSize: 13 }}>Sin ventas</p> :
            salesByMethod.map(([method, data], i) => {
              const maxVal = salesByMethod[0]?.[1]?.totalARS || 1;
              const colors = { "Mercado Pago": "#6366f1", "Lemon": "#f9ca24", "USD Cash": "#00cec9", "USDT": "#26de81", "Pesos Cash": "#fdcb6e" };
              return (
                <div key={method} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: "#4b5563", width: 100, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{method}</span>
                  <Bar value={data.totalARS} max={maxVal} color={colors[method] || "#a855f7"} />
                  <span style={{ fontSize: 11, color: "#6b7280", minWidth: 32, textAlign: "right", fontWeight: 600 }}>{data.count}</span>
                </div>
              );
            })}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* Top productos */}
        <Card>
          <h4 style={{ color: "#1a1a2e", margin: "0 0 14px", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Más vendidos</h4>
          {topProducts.length === 0 ? <p style={{ color: "#9ca3af", fontSize: 13 }}>Sin ventas aún</p> :
            topProducts.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < topProducts.length - 1 ? "1px solid #f0f1f5" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: i === 0 ? "#f59e0b" : i === 1 ? "#9ca3af" : i === 2 ? "#cd7f32" : "#e5e7eb", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                  <span style={{ color: "#4b5563", fontSize: 12 }}>{p.name}</span>
                </div>
                <Badge color={BRAND_COLORS[p.brand] || "#6366f1"}>{p.qty} uds</Badge>
              </div>
            ))}
        </Card>

        {/* Ventas por marca */}
        <Card>
          <h4 style={{ color: "#1a1a2e", margin: "0 0 14px", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Ventas por marca</h4>
          {salesByBrand.length === 0 ? <p style={{ color: "#9ca3af", fontSize: 13 }}>Sin ventas</p> :
            salesByBrand.map(([brand, data], i) => {
              const maxQty = salesByBrand[0]?.[1]?.qty || 1;
              return (
                <div key={brand} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: "#4b5563", width: 80, fontWeight: 600 }}>{brand}</span>
                  <Bar value={data.qty} max={maxQty} color={BRAND_COLORS[brand] || "#a855f7"} />
                  <span style={{ fontSize: 11, color: "#6b7280", minWidth: 45, textAlign: "right" }}>{data.qty} uds</span>
                  <span style={{ fontSize: 11, color: "#059669", minWidth: 55, textAlign: "right", fontWeight: 600 }}>{formatMoney(data.revenue, "USD")}</span>
                </div>
              );
            })}
        </Card>
      </div>

      {/* Bottom row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        {/* Últimas ventas */}
        <Card>
          <h4 style={{ color: "#1a1a2e", margin: "0 0 14px", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Últimas ventas</h4>
          {recentSales.length === 0 ? <p style={{ color: "#9ca3af", fontSize: 13 }}>Sin ventas registradas</p> :
            recentSales.map((s, i) => {
              const itemCount = (s.items || []).reduce((sum, it) => sum + it.qty, 0);
              return (
                <div key={s.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < recentSales.length - 1 ? "1px solid #f0f1f5" : "none" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#1a1a2e", fontWeight: 600 }}>{s.clientName || "Sin nombre"}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{formatDate(s.date)} · {itemCount} uds · {s.paymentMethod || ""}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#059669" }}>{formatMoney(s.total, s.currency || "ARS")}</div>
                    <Badge color={s.createdBy === "Diego" ? "#6366f1" : "#059669"}>{s.createdBy || "?"}</Badge>
                  </div>
                </div>
              );
            })}
        </Card>

        {/* Stock bajo */}
        <Card>
          <h4 style={{ color: "#e74c3c", margin: "0 0 14px", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Stock bajo (≤3)</h4>
          {lowStock.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
              <p style={{ color: "#059669", fontSize: 13, fontWeight: 600 }}>Stock OK</p>
            </div>
          ) :
            lowStock.slice(0, 10).map((p, i) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < Math.min(lowStock.length, 10) - 1 ? "1px solid #f0f1f5" : "none" }}>
                <span style={{ color: "#4b5563", fontSize: 11 }}>{p.brand} {p.model} - {p.flavor}</span>
                <Badge color={p.stock <= 1 ? "#e74c3c" : "#f59e0b"}>{p.stock}</Badge>
              </div>
            ))
          }
          {lowStock.length > 10 && <p style={{ color: "#9ca3af", fontSize: 11, marginTop: 8, textAlign: "center" }}>+{lowStock.length - 10} más</p>}
        </Card>
      </div>
    </div>
  );
};
