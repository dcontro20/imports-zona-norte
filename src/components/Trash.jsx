import { useState, useMemo } from "react";
import { formatDate, formatMoney } from "../helpers.js";

const ENTITY_LABELS = {
  products: { label: "Productos", icon: "📦" },
  sales: { label: "Ventas", icon: "🛒" },
  purchases: { label: "Compras", icon: "🚚" },
  expenses: { label: "Gastos", icon: "💸" },
  cashMovements: { label: "Mov. Caja", icon: "💰" },
  partnerWithdrawals: { label: "Retiros Socios", icon: "🤝" },
};

export function Trash({
  products = [], setProducts,
  sales = [], setSales,
  purchases = [], setPurchases,
  expenses = [], setExpenses,
  cashMovements = [], setCashMovements,
  partnerWithdrawals = [], setPartnerWithdrawals,
  logAudit, currentUser
}) {
  const [activeTab, setActiveTab] = useState("all");
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [confirmPermanent, setConfirmPermanent] = useState(null);

  // Gather all deleted items
  const trashItems = useMemo(() => {
    const items = [];
    products.filter(p => p.isDeleted).forEach(p => items.push({
      ...p, _type: "products", _label: `${p.brand} ${p.model} - ${p.flavor}`,
      _sub: `Stock: ${p.stock || 0}`, _setter: setProducts
    }));
    sales.filter(s => s.isDeleted).forEach(s => items.push({
      ...s, _type: "sales", _label: `Venta ${s.clientName || ""}`,
      _sub: `${formatDate(s.date)} · ${formatMoney(s.total, s.currency)}`, _setter: setSales
    }));
    purchases.filter(p => p.isDeleted).forEach(p => items.push({
      ...p, _type: "purchases", _label: `Compra - ${p.supplier || ""}`,
      _sub: `${formatDate(p.date)} · ${p.status}`, _setter: setPurchases
    }));
    expenses.filter(e => e.isDeleted).forEach(e => items.push({
      ...e, _type: "expenses", _label: `${e.category} - ${e.description || ""}`,
      _sub: `${formatDate(e.date)} · ${formatMoney(e.amountARS || e.amountUSD, e.currency)}`, _setter: setExpenses
    }));
    cashMovements.filter(m => m.isDeleted).forEach(m => items.push({
      ...m, _type: "cashMovements", _label: `${m.type || "Movimiento"} ${m.from || ""} → ${m.to || ""}`,
      _sub: `${formatDate(m.date)} · $${m.amount}`, _setter: setCashMovements
    }));
    partnerWithdrawals.filter(w => w.isDeleted).forEach(w => items.push({
      ...w, _type: "partnerWithdrawals", _label: `Retiro - ${w.person}`,
      _sub: `${formatDate(w.date)} · $${w.amount}`, _setter: setPartnerWithdrawals
    }));
    // Sort by deletedAt descending
    items.sort((a, b) => (b.deletedAt || "").localeCompare(a.deletedAt || ""));
    return items;
  }, [products, sales, purchases, expenses, cashMovements, partnerWithdrawals]);

  const filtered = activeTab === "all" ? trashItems : trashItems.filter(i => i._type === activeTab);

  // Count per type
  const counts = useMemo(() => {
    const c = {};
    trashItems.forEach(i => { c[i._type] = (c[i._type] || 0) + 1; });
    return c;
  }, [trashItems]);

  const restore = (item) => {
    if (confirmRestore !== item.id) {
      setConfirmRestore(item.id);
      setTimeout(() => setConfirmRestore(null), 3000);
      return;
    }
    const setter = item._type === "products" ? setProducts :
                   item._type === "sales" ? setSales :
                   item._type === "purchases" ? setPurchases :
                   item._type === "expenses" ? setExpenses :
                   item._type === "cashMovements" ? setCashMovements :
                   item._type === "partnerWithdrawals" ? setPartnerWithdrawals : null;
    if (!setter) return;
    setter(prev => prev.map(x => x.id === item.id ? (() => {
      const { isDeleted, deletedAt, deletedBy, ...rest } = x;
      return rest;
    })() : x));
    if (logAudit) {
      const entityLabel = ENTITY_LABELS[item._type]?.label || item._type;
      logAudit("restore", item._type.replace(/s$/, ""), item.id, `Restauró ${entityLabel}: ${item._label}`);
    }
    setConfirmRestore(null);
  };

  const permanentDelete = (item) => {
    if (confirmPermanent !== item.id) {
      setConfirmPermanent(item.id);
      setTimeout(() => setConfirmPermanent(null), 3000);
      return;
    }
    const setter = item._type === "products" ? setProducts :
                   item._type === "sales" ? setSales :
                   item._type === "purchases" ? setPurchases :
                   item._type === "expenses" ? setExpenses :
                   item._type === "cashMovements" ? setCashMovements :
                   item._type === "partnerWithdrawals" ? setPartnerWithdrawals : null;
    if (!setter) return;
    setter(prev => prev.filter(x => x.id !== item.id));
    setConfirmPermanent(null);
  };

  // Auto-clean items older than 30 days
  const oldItems = trashItems.filter(i => {
    if (!i.deletedAt) return false;
    const daysDiff = (Date.now() - new Date(i.deletedAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff > 30;
  });

  const btnStyle = {
    padding: "5px 12px", border: "none", borderRadius: 6, fontSize: 12,
    fontWeight: 600, cursor: "pointer"
  };

  const tabStyle = (active) => ({
    padding: "6px 14px", border: "1px solid " + (active ? "#6366f1" : "#e2e4e9"),
    borderRadius: 20, fontSize: 12, fontWeight: active ? 700 : 500,
    background: active ? "#f0f0ff" : "#fff", color: active ? "#6366f1" : "#6b7280",
    cursor: "pointer"
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1a1a2e", margin: 0 }}>Papelera</h2>
          <p style={{ color: "#9ca3af", fontSize: 13, margin: "4px 0 0" }}>
            {trashItems.length} elementos eliminados · Se eliminan permanentemente después de 30 días
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={() => setActiveTab("all")} style={tabStyle(activeTab === "all")}>
          Todos ({trashItems.length})
        </button>
        {Object.entries(ENTITY_LABELS).map(([key, { label, icon }]) => {
          const count = counts[key] || 0;
          if (count === 0) return null;
          return (
            <button key={key} onClick={() => setActiveTab(key)} style={tabStyle(activeTab === key)}>
              {icon} {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Items */}
      <div style={{ background: "#fff", border: "1px solid #e2e4e9", borderRadius: 12, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
            La papelera está vacía
          </div>
        ) : (
          filtered.map((item, i) => {
            const entityInfo = ENTITY_LABELS[item._type] || { label: item._type, icon: "📄" };
            const deletedDate = item.deletedAt ? new Date(item.deletedAt) : null;
            const daysLeft = deletedDate ? Math.max(0, 30 - Math.floor((Date.now() - deletedDate.getTime()) / (1000 * 60 * 60 * 24))) : "?";

            return (
              <div key={item.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                borderBottom: i < filtered.length - 1 ? "1px solid #f0f1f5" : "none",
              }}>
                <span style={{ fontSize: 20 }}>{entityInfo.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#1a1a2e", fontWeight: 600 }}>{item._label}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>
                    {item._sub} · Eliminado por {item.deletedBy || "?"} · {daysLeft} días restantes
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {confirmRestore === item.id ? (
                    <button onClick={() => restore(item)} style={{ ...btnStyle, background: "#ecfdf5", color: "#059669" }}>
                      Confirmar restaurar
                    </button>
                  ) : (
                    <button onClick={() => restore(item)} style={{ ...btnStyle, background: "#f0f0ff", color: "#6366f1" }} title="Restaurar">
                      ↩️ Restaurar
                    </button>
                  )}
                  {confirmPermanent === item.id ? (
                    <button onClick={() => permanentDelete(item)} style={{ ...btnStyle, background: "#fef2f2", color: "#dc2626" }}>
                      Confirmar eliminar
                    </button>
                  ) : (
                    <button onClick={() => permanentDelete(item)} style={{ ...btnStyle, background: "#fef2f2", color: "#dc2626" }} title="Eliminar permanentemente">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
