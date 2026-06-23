import { useState, useMemo } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { isDateInClosedMonth } from "../calcs.js";
import { useResponsive } from "../App.jsx";
import { Modal, Card, Btn, Input, Select, Table, Badge, StatCard } from "./UI.jsx";
import { EXPENSE_CATEGORIES } from "../constants.js";

// Category colors
const CAT_COLORS = {
  "Flete Paraguay": "#e17055",
  "Comisiones Crypto": "#6c5ce7",
  "Packaging": "#00cec9",
  "Envíos locales": "#fdcb6e",
  "Publicidad": "#e84393",
  "Comisión pasero": "#f9ca24",
  "Comisión proveedor": "#0984e3",
  "Envío Vía Cargo": "#d63031",
  "Impuestos/Tasas": "#636e72",
  "Herramientas/Sistema": "#00b894",
  "Otro": "#b2bec3",
};

// -- EXPENSES MEJORADO --
export const Expenses = ({ expenses, setExpenses, currentUser, exchangeRate, logAudit, monthlyClosures = [] }) => {
  const { isMobile } = useResponsive();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all"); // "all" | category name
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [customCategories, setCustomCategories] = useState(() => {
    try { return JSON.parse(localStorage.getItem("vapestock_customExpenseCats") || "[]"); } catch { return []; }
  });
  const [showTrendChart, setShowTrendChart] = useState(false);
  const [form, setForm] = useState({
    category: "", description: "", amountARS: "", amountUSD: "",
    currency: "ARS", date: new Date().toISOString().slice(0, 10),
    relatedTo: "", recurring: false, receiptUrl: ""
  });

  const openNew = () => {
    setForm({
      category: "", description: "", amountARS: "", amountUSD: "",
      currency: "ARS", date: new Date().toISOString().slice(0, 10),
      relatedTo: "", recurring: false, receiptUrl: ""
    });
    setEditing(null);
    setModal(true);
  };

  const openEdit = (e) => {
    // S14.5 — guard mes cerrado
    if (isDateInClosedMonth(monthlyClosures, e.date)) {
      const proceed = confirm(
        `⚠️ Este gasto es de un mes YA CERRADO (${(e.date || "").slice(0, 7)}).\n\n` +
        `Editarlo descuadrara el snapshot del cierre. ¿Continuar de todos modos?`
      );
      if (!proceed) return;
    }
    setForm({
      category: e.category || "", description: e.description || "",
      amountARS: e.amountARS || "", amountUSD: e.amountUSD || "",
      currency: e.currency || "ARS",
      date: e.date ? e.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      relatedTo: e.relatedTo || "", recurring: e.recurring || false
    });
    setEditing(e.id);
    setModal(true);
  };

  const save = () => {
    if (!form.category || (!form.amountARS && !form.amountUSD)) return;
    const data = {
      ...form,
      amountARS: Number(form.amountARS) || 0,
      amountUSD: Number(form.amountUSD) || 0,
      createdBy: currentUser?.name || ""
    };
    if (editing) {
      setExpenses(prev => prev.map(e => e.id === editing ? { ...data, id: editing } : e));
      if (logAudit) logAudit("update", "expense", editing, `Editó gasto: ${form.category} - ${form.description || ""}`);
    } else {
      const newId = uid();
      setExpenses(prev => [{ ...data, id: newId }, ...prev]);
      if (logAudit) logAudit("create", "expense", newId, `Creó gasto: ${form.category} - ${formatMoney(data.amountARS || data.amountUSD, form.currency)}`);
    }
    setModal(false);
    setEditing(null);
  };

  const [confirmDeleteExp, setConfirmDeleteExp] = useState(null);
  const deleteExpense = (id) => {
    if (confirmDeleteExp !== id) { setConfirmDeleteExp(id); setTimeout(() => setConfirmDeleteExp(null), 3000); return; }
    const exp = expenses.find(e => e.id === id);
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "?" } : e));
    if (logAudit && exp) logAudit("delete", "expense", id, `Eliminó gasto: ${exp.category} - ${exp.description || ""}`);
    setConfirmDeleteExp(null);
  };

  // ---- Stats ----
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const activeExpenses = expenses.filter(e => !e.isDeleted);
  const monthExpenses = activeExpenses.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  const totalMonthARS = monthExpenses.reduce((s, e) => s + (e.amountARS || 0), 0);
  const totalMonthUSD = monthExpenses.reduce((s, e) => s + (e.amountUSD || 0), 0);
  const totalAllARS = activeExpenses.reduce((s, e) => s + (e.amountARS || 0), 0);
  const totalAllUSD = activeExpenses.reduce((s, e) => s + (e.amountUSD || 0), 0);

  // By category breakdown
  const byCategory = useMemo(() => {
    const cats = {};
    monthExpenses.forEach(e => {
      const c = e.category || "Otro";
      if (!cats[c]) cats[c] = { ars: 0, usd: 0, count: 0 };
      cats[c].ars += e.amountARS || 0;
      cats[c].usd += e.amountUSD || 0;
      cats[c].count += 1;
    });
    return Object.entries(cats).sort((a, b) => {
      const totalA = a[1].ars + (a[1].usd * (exchangeRate || 1));
      const totalB = b[1].ars + (b[1].usd * (exchangeRate || 1));
      return totalB - totalA;
    });
  }, [monthExpenses, exchangeRate]);

  // Filtered data
  const filteredExpenses = activeExpenses.filter(e => {
    if (filter !== "all" && e.category !== filter) return false;
    if (search && !`${e.description || ""} ${e.category || ""} ${e.relatedTo || ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo && e.date > dateTo) return false;
    if (minAmount && Number(e.amountARS || 0) < Number(minAmount)) return false;
    return true;
  });

  // Combinar categorías default + custom para el Select
  const allCategories = useMemo(() => [
    ...EXPENSE_CATEGORIES.map(c => typeof c === "string" ? c : c.value || c.label),
    ...customCategories,
  ], [customCategories]);

  // Stats por categoría últimos 6 meses (para tendencia)
  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("es-AR", { month: "short" }),
        year: d.getFullYear(), month: d.getMonth(),
      });
    }
    const byCatAndMonth = {};
    activeExpenses.forEach(e => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!months.find(m => m.key === key)) return;
      const cat = e.category || "Otros";
      if (!byCatAndMonth[cat]) byCatAndMonth[cat] = {};
      byCatAndMonth[cat][key] = (byCatAndMonth[cat][key] || 0) + Number(e.amountARS || 0);
    });
    return Object.entries(byCatAndMonth)
      .map(([cat, byMonth]) => {
        const values = months.map(m => byMonth[m.key] || 0);
        const last = values[values.length - 1];
        const prev = values[values.length - 2] || 0;
        const trend = prev > 0 ? ((last - prev) / prev) * 100 : 0;
        return { cat, values, total: values.reduce((a, b) => a + b, 0), trend, last };
      })
      .sort((a, b) => b.total - a.total);
  }, [activeExpenses]);

  const persistCustomCats = (next) => {
    setCustomCategories(next);
    try { localStorage.setItem("vapestock_customExpenseCats", JSON.stringify(next)); } catch {}
  };

  const addCustomCategory = () => {
    const name = prompt("Nombre de la nueva categoría:");
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    if (allCategories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      alert("Esa categoría ya existe");
      return;
    }
    persistCustomCats([...customCategories, trimmed]);
  };

  const removeCustomCategory = (cat) => {
    if (!confirm(`¿Eliminar categoría "${cat}"? Los gastos existentes mantienen el nombre pero no podrás seleccionarla.`)) return;
    persistCustomCats(customCategories.filter(c => c !== cat));
  };

  // Generar gastos del mes para los recurrentes (un click)
  const generateRecurringForMonth = () => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    // Templates: usar los gastos con recurring=true del mes anterior como plantilla
    const recurringTemplates = activeExpenses.filter(e => e.recurring);
    if (recurringTemplates.length === 0) {
      alert("No hay gastos marcados como 'Recurrente'. Marcá un gasto como recurrente al crearlo.");
      return;
    }
    // Evitar duplicados: si ya existe un gasto recurring de la misma categoría+description en este mes, skip
    const existingThisMonth = activeExpenses.filter(e => e.date?.slice(0, 7) === monthKey);
    const toCreate = recurringTemplates.filter(t => !existingThisMonth.some(e =>
      e.category === t.category && e.description === t.description && e.recurring
    ));
    if (toCreate.length === 0) {
      alert("Ya están generados todos los gastos recurrentes de este mes.");
      return;
    }
    if (!confirm(`Generar ${toCreate.length} gastos recurrentes para ${monthKey}?\n\n${toCreate.map(t => `· ${t.category} — ${t.description} (${formatMoney(t.amountARS)})`).join("\n")}`)) return;
    const today = new Date().toISOString().slice(0, 10);
    setExpenses(prev => [
      ...toCreate.map(t => ({
        ...t, id: uid(), date: today, createdAt: new Date().toISOString(), createdBy: currentUser?.name || "?",
      })),
      ...prev,
    ]);
    if (logAudit) logAudit("create", "expense", "bulk", `Generación recurrentes: ${toCreate.length} gastos`);
  };

  // Unique categories used
  const usedCategories = [...new Set(activeExpenses.map(e => e.category).filter(Boolean))];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#1E2B4A", margin: 0, fontSize: 22, fontWeight: 800 }}>Gastos Operativos</h2>
          <p style={{ color: "#6B7794", margin: "4px 0 0", fontSize: 13 }}>Control de egresos del negocio</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" onClick={generateRecurringForMonth} style={{ padding: "10px 14px" }}>🔁 Generar recurrentes</Btn>
          <Btn variant="secondary" onClick={() => setShowTrendChart(s => !s)} style={{ padding: "10px 14px" }}>📈 Tendencia 6m</Btn>
          <Btn onClick={openNew}>+ Registrar Gasto</Btn>
        </div>
      </div>

      {/* Búsqueda + filtros avanzados */}
      <div style={{
        display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap",
        padding: 10, background: "#F8F2E7", borderRadius: 10, border: "1px solid #E5DAC2",
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar descripción..."
          style={{
            flex: "1 1 200px", padding: "10px 12px", minHeight: 44, boxSizing: "border-box", borderRadius: 8,
            border: "1px solid #E5DAC2", fontSize: 16, outline: "none",
            background: "#fff", fontFamily: "inherit",
          }}
        />
        <input
          type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          title="Desde"
          style={{ padding: "10px", minHeight: 44, boxSizing: "border-box", borderRadius: 8, border: "1px solid #E5DAC2", fontSize: 16, outline: "none", background: "#fff", fontFamily: "inherit" }}
        />
        <input
          type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          title="Hasta"
          style={{ padding: "10px", minHeight: 44, boxSizing: "border-box", borderRadius: 8, border: "1px solid #E5DAC2", fontSize: 16, outline: "none", background: "#fff", fontFamily: "inherit" }}
        />
        <input
          type="number" value={minAmount} onChange={e => setMinAmount(e.target.value)}
          placeholder="Min ARS"
          style={{ width: 110, padding: "10px", minHeight: 44, boxSizing: "border-box", borderRadius: 8, border: "1px solid #E5DAC2", fontSize: 16, outline: "none", background: "#fff", fontFamily: "inherit" }}
        />
        {(search || dateFrom || dateTo || minAmount) && (
          <button onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setMinAmount(""); }} style={{
            padding: "7px 12px", borderRadius: 8, border: "none",
            background: "transparent", color: "#6B7794", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>✕ Limpiar</button>
        )}
      </div>

      {showTrendChart && monthlyTrend.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#1E2B4A" }}>
            📈 Tendencia últimos 6 meses por categoría
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {monthlyTrend.slice(0, 8).map(row => {
              const maxVal = Math.max(1, ...row.values);
              const trendUp = row.trend > 5;
              const trendDown = row.trend < -5;
              return (
                <div key={row.cat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 130, fontSize: 12, color: "#1E2B4A", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.cat}
                  </div>
                  <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 3, height: 36 }}>
                    {row.values.map((v, i) => (
                      <div key={i} title={`${v.toLocaleString()}`} style={{
                        flex: 1,
                        height: `${(v / maxVal) * 100}%`,
                        minHeight: v > 0 ? 2 : 1,
                        background: i === row.values.length - 1 ? "#1E2B4A" : "#1E2B4A50",
                        borderRadius: "3px 3px 0 0",
                      }} />
                    ))}
                  </div>
                  <div style={{ width: 90, textAlign: "right", fontSize: 11, fontWeight: 700 }}>
                    <div style={{ color: "#1E2B4A" }}>{formatMoney(row.last)}</div>
                    {(trendUp || trendDown) && (
                      <div style={{ color: trendUp ? "#E03E3E" : "#0F7B6C", fontSize: 10 }}>
                        {trendUp ? "▲" : "▼"} {Math.abs(row.trend).toFixed(0)}%
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(180px, 1fr))", gap: isMobile ? 8 : 14, marginBottom: 20 }}>
        <Card style={{ padding: "14px 18px", background: "linear-gradient(135deg, #F7D7D6 0%, #FFFFFF 100%)" }}>
          <div style={{ fontSize: 11, color: "#6B7794", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700, marginBottom: 6 }}>Este mes (ARS)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#E03E3E" }}>{formatMoney(totalMonthARS)}</div>
          {totalMonthUSD > 0 && <div style={{ fontSize: 11, color: "#6B7794", marginTop: 2 }}>+ {formatMoney(totalMonthUSD, "USD")}</div>}
        </Card>
        <Card style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 11, color: "#6B7794", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700, marginBottom: 6 }}>Este mes (USD equiv.)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#e17055" }}>
            {formatMoney(totalMonthUSD + (exchangeRate ? totalMonthARS / exchangeRate : 0), "USD")}
          </div>
        </Card>
        <Card style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 11, color: "#6B7794", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700, marginBottom: 6 }}>Gastos este mes</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1E2B4A" }}>{monthExpenses.length}</div>
          <div style={{ fontSize: 11, color: "#6B7794", marginTop: 2 }}>{byCategory.length} categorías</div>
        </Card>
        <Card style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 11, color: "#6B7794", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700, marginBottom: 6 }}>Total histórico</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#636e72" }}>{formatMoney(totalAllARS)}</div>
          {totalAllUSD > 0 && <div style={{ fontSize: 11, color: "#6B7794", marginTop: 2 }}>+ {formatMoney(totalAllUSD, "USD")}</div>}
        </Card>
      </div>

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <h4 style={{ color: "#1E2B4A", margin: "0 0 14px", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
            Desglose por categoría (este mes)
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {byCategory.map(([cat, data]) => {
              const total = data.ars + (data.usd * (exchangeRate || 1));
              const maxTotal = byCategory[0] ? byCategory[0][1].ars + (byCategory[0][1].usd * (exchangeRate || 1)) : 1;
              return (
                <div key={cat} onClick={() => setFilter(filter === cat ? "all" : cat)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: filter === cat ? "#f5f3ff" : "#F8F2E7", border: filter === cat ? "1px solid #D4D7F2" : "1px solid transparent", transition: "all 0.2s" }}>
                  <div style={{ width: 4, height: 32, borderRadius: 2, background: CAT_COLORS[cat] || "#b2bec3" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#3A4868", fontWeight: 600 }}>{cat}</div>
                    <div style={{ fontSize: 11, color: "#9AA2B3" }}>{data.count} gasto{data.count > 1 ? "s" : ""}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1E2B4A" }}>{formatMoney(total)}</div>
                    {data.usd > 0 && <div style={{ fontSize: 11, color: "#0F7B6C", fontWeight: 600 }}>{formatMoney(data.usd, "USD")}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {filter !== "all" && (
            <button onClick={() => setFilter("all")} style={{ marginTop: 10, background: "none", border: "none", color: "#1E2B4A", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              ✕ Quitar filtro "{filter}"
            </button>
          )}
        </Card>
      )}

      {/* Table */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h4 style={{ color: "#1E2B4A", margin: 0, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
            {filter === "all" ? "Todos los gastos" : `Gastos: ${filter}`}
            <span style={{ color: "#9AA2B3", fontWeight: 500 }}> ({filteredExpenses.length})</span>
          </h4>
        </div>
        <Table
          columns={[
            { key: "date", label: "Fecha", render: r => formatDate(r.date) },
            { key: "category", label: "Categoría", render: r => (
              <Badge color={CAT_COLORS[r.category] || "#b2bec3"}>{r.category}</Badge>
            )},
            { key: "description", label: "Descripción", render: r => (
              <div>
                <div style={{ color: "#1E2B4A", fontSize: 13 }}>{r.description || "—"}</div>
                {r.relatedTo && <div style={{ fontSize: 11, color: "#6B7794" }}>Ref: {r.relatedTo}</div>}
              </div>
            )},
            { key: "amount", label: "Monto", render: r => (
              <div style={{ textAlign: "right" }}>
                {r.amountARS > 0 && <div style={{ fontWeight: 700, color: "#E03E3E" }}>{formatMoney(r.amountARS)}</div>}
                {r.amountUSD > 0 && <div style={{ fontWeight: 700, color: "#e17055" }}>{formatMoney(r.amountUSD, "USD")}</div>}
              </div>
            )},
            { key: "createdBy", label: "Quién", render: r => r.createdBy ? <Badge color={r.createdBy === "Diego" ? "#1E2B4A" : "#0F7B6C"}>{r.createdBy}</Badge> : "—" },
            { key: "actions", label: "", render: r => (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} style={{ background: "none", border: "none", color: "#a855f7", cursor: "pointer", fontSize: 14 }}>✏️</button>
                {confirmDeleteExp === r.id
                ? <button onClick={(e) => { e.stopPropagation(); deleteExpense(r.id); }} style={{ background: "#F7D7D6", border: "1px solid #E03E3E55", color: "#E03E3E", padding: isMobile ? "10px 14px" : "3px 8px", minHeight: isMobile ? 40 : "auto", borderRadius: 6, cursor: "pointer", fontSize: isMobile ? 13 : 11, fontWeight: 600 }}>Confirmar</button>
                : <button onClick={(e) => { e.stopPropagation(); deleteExpense(r.id); }} style={{ background: "none", border: "none", color: "#E03E3E", cursor: "pointer", fontSize: 14 }}>🗑️</button>
              }
              </div>
            )},
          ]}
          data={filteredExpenses}
          emptyMsg="No hay gastos registrados"
        />
      </Card>

      {/* Modal */}
      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? "Editar Gasto" : "Registrar Gasto"}>
        <Input label="Fecha" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <Select label="Categoría" options={allCategories.map(c => ({ value: c, label: c }))} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
          </div>
          <button type="button" onClick={addCustomCategory} style={{
            padding: "8px 10px", borderRadius: 8, minHeight: 38,
            border: "1px solid #1E2B4A", background: "#1E2B4A15", color: "#1E2B4A",
            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>+ Nueva</button>
        </div>
        {customCategories.length > 0 && (
          <div style={{ marginTop: -4, marginBottom: 10, fontSize: 11, color: "#6B7794" }}>
            Custom: {customCategories.map(c => (
              <span key={c} style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "2px 6px", margin: "0 4px 4px 0", borderRadius: 999,
                background: "#EFE5CE", color: "#1E2B4A", fontWeight: 500,
              }}>
                {c}
                <button onClick={() => removeCustomCategory(c)} style={{
                  background: "none", border: "none", color: "#6B7794",
                  cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1,
                }}>×</button>
              </span>
            ))}
          </div>
        )}

        <Input label="Descripción" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detalle del gasto..." />

        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}>
            <Input label="Monto ARS" type="number" value={form.amountARS} onChange={e => setForm(f => ({ ...f, amountARS: e.target.value }))} placeholder="ej: 15000" />
          </div>
          <div style={{ flex: 1 }}>
            <Input label="Monto USD" type="number" value={form.amountUSD} onChange={e => setForm(f => ({ ...f, amountUSD: e.target.value }))} placeholder="ej: 10" />
          </div>
        </div>

        {form.amountARS > 0 && exchangeRate > 0 && (
          <div style={{ color: "#6B7794", fontSize: 12, marginBottom: 8 }}>
            Equivalente: ~{formatMoney(Number(form.amountARS) / exchangeRate, "USD")}
          </div>
        )}

        <Input label="Referencia (opcional)" value={form.relatedTo} onChange={e => setForm(f => ({ ...f, relatedTo: e.target.value }))} placeholder="ej: Pedido #5, envío a cliente X..." />

        <Input
          label="🧾 URL comprobante (opcional)"
          value={form.receiptUrl || ""}
          onChange={e => setForm(f => ({ ...f, receiptUrl: e.target.value }))}
          placeholder="https://..."
        />

        <label style={{
          display: "flex", alignItems: "center", gap: 8, padding: 10, marginTop: 4,
          background: form.recurring ? "#1E2B4A15" : "#F8F2E7",
          border: `1px solid ${form.recurring ? "#1E2B4A44" : "#E5DAC2"}`,
          borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#1E2B4A",
        }}>
          <input
            type="checkbox"
            checked={!!form.recurring}
            onChange={e => setForm(f => ({ ...f, recurring: e.target.checked }))}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          🔁 Se repite mensualmente (alquiler, servicios, etc.)
        </label>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => { setModal(false); setEditing(null); }}>Cancelar</Btn>
          <Btn onClick={save}>{editing ? "Guardar" : "Registrar"}</Btn>
        </div>
      </Modal>
    </div>
  );
};
