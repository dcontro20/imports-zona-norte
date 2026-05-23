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
  clients = [], setClients,
  coupons = [], setCoupons,
  logAudit, currentUser
}) {
  const [activeTab, setActiveTab] = useState("all");
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [confirmPermanent, setConfirmPermanent] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

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

  // Multi-select bulk actions
  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const clearSelection = () => setSelectedIds([]);
  const selectAll = () => setSelectedIds(filtered.map(i => i.id));
  // _type viene PLURAL desde trashItems ("products", "sales", "purchases", "expenses", "cashMovements", "partnerWithdrawals")
  const setterByType = {
    products: setProducts,
    sales: setSales,
    purchases: setPurchases,
    expenses: setExpenses,
    cashMovements: setCashMovements,
    partnerWithdrawals: setPartnerWithdrawals,
  };
  const bulkRestore = () => {
    if (selectedIds.length === 0) return;
    const items = trashItems.filter(i => selectedIds.includes(i.id));
    if (!confirm(`¿Restaurar ${items.length} items? Se reactivarán y se revertirán los efectos secundarios (stock, balances) que habían sido revertidos al borrar.`)) return;

    // 1) Revertir efectos colaterales por tipo (igual que restore() individual)
    const stockDeltas = {}; // productId -> qty a aplicar (negativo para sales, positivo para purchases)
    const balanceDeltas = {}; // clientId -> ARS a aplicar al balance
    const couponDeltas = {}; // couponCode -> usedCount a re-incrementar
    items.forEach(item => {
      if (item._type === "sales") {
        // Re-decrementar stock (deleteSale lo había devuelto)
        (item.items || []).forEach(it => {
          if (!it.productId) return;
          stockDeltas[it.productId] = (stockDeltas[it.productId] || 0) - (it.qty || 1);
        });
        // Re-aplicar efectos en balance del cliente
        if (item.clientId) {
          let delta = 0;
          if (item.debtAmount > 0) delta -= item.debtAmount;
          if (item.creditUsed > 0) delta -= item.creditUsed;
          if (item.changeAmount > 0 && item.changeMethod === "credit") delta += item.changeAmount;
          if (delta !== 0) balanceDeltas[item.clientId] = (balanceDeltas[item.clientId] || 0) + delta;
        }
        // S16.1 BUG-FIX — re-incrementar usedCount del cupón (deleteSale lo había decrementado)
        if (item.couponCode) {
          couponDeltas[item.couponCode] = (couponDeltas[item.couponCode] || 0) + 1;
        }
      } else if (item._type === "purchases" && item.status === "verificado") {
        // Re-sumar stock (deletePurchase lo había restado)
        (item.items || []).forEach(it => {
          if (!it.productId) return;
          stockDeltas[it.productId] = (stockDeltas[it.productId] || 0) + Number(it.qty || 0);
        });
      }
    });
    if (Object.keys(stockDeltas).length > 0) {
      setProducts(prev => prev.map(p => stockDeltas[p.id] !== undefined && !p.isDeleted
        ? { ...p, stock: Math.max(0, (p.stock || 0) + stockDeltas[p.id]) }
        : p
      ));
    }
    if (Object.keys(balanceDeltas).length > 0 && setClients) {
      setClients(prev => prev.map(c => balanceDeltas[c.id] !== undefined
        ? { ...c, balance: Math.round(((c.balance || 0) + balanceDeltas[c.id]) * 100) / 100 }
        : c
      ));
    }
    if (Object.keys(couponDeltas).length > 0 && setCoupons) {
      setCoupons(prev => prev.map(c => couponDeltas[c.code] !== undefined
        ? { ...c, usedCount: (c.usedCount || 0) + couponDeltas[c.code] }
        : c
      ));
    }

    // 2) Toggle isDeleted off agrupado por tipo (un solo setter por tipo evita race)
    const idsByType = {};
    items.forEach(item => {
      if (!idsByType[item._type]) idsByType[item._type] = new Set();
      idsByType[item._type].add(item.id);
    });
    Object.entries(idsByType).forEach(([type, idSet]) => {
      const setter = setterByType[type];
      if (!setter) return;
      setter(prev => prev.map(x => idSet.has(x.id) ? (() => {
        const { isDeleted, deletedAt, deletedBy, ...rest } = x;
        return rest;
      })() : x));
    });

    if (logAudit) logAudit("restore", "trash", "bulk", `Restauración masiva: ${items.length} items (stock y balances revertidos)`);
    clearSelection();
  };
  const bulkDeleteForever = () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`⚠️ ¿ELIMINAR PERMANENTEMENTE ${selectedIds.length} items? Esta acción NO se puede deshacer.`)) return;
    if (!confirm(`Última confirmación. ¿Estás seguro?`)) return;
    const items = trashItems.filter(i => selectedIds.includes(i.id));
    items.forEach(item => {
      const setter = setterByType[item._type];
      if (setter) setter(prev => prev.filter(x => x.id !== item.id));
    });
    if (logAudit) logAudit("delete_forever", "trash", "bulk", `Eliminación masiva permanente: ${items.length} items`);
    clearSelection();
  };

  // Count per type
  const counts = useMemo(() => {
    const c = {};
    trashItems.forEach(i => { c[i._type] = (c[i._type] || 0) + 1; });
    return c;
  }, [trashItems]);

  // Restore con reversión simétrica de efectos colaterales.
  // Cada tipo revierte lo que su delete había aplicado:
  //  - sales.delete: +stock, +balance cliente (deuda/crédito/vuelto-crédito) → restore resta stock y re-aplica deuda/crédito
  //  - purchases.delete (verificado): -stock → restore +stock
  //  - products/expenses/cashMovements/partnerWithdrawals: solo toggle isDeleted (sin side-effects persistidos)
  const restore = (item) => {
    if (confirmRestore !== item.id) {
      setConfirmRestore(item.id);
      setTimeout(() => setConfirmRestore(null), 3000);
      return;
    }

    // 1) Revertir efectos colaterales específicos del tipo
    if (item._type === "sales") {
      // Re-decrementar stock (simetría con deleteSale que lo había devuelto)
      (item.items || []).forEach(it => {
        setProducts(prev => prev.map(p =>
          p.id === it.productId && !p.isDeleted
            ? { ...p, stock: Math.max(0, (p.stock || 0) - (it.qty || 1)) }
            : p
        ));
      });
      // Re-aplicar efectos en balance del cliente (inverso de lo que deleteSale había revertido)
      if (item.clientId && setClients) {
        setClients(prev => prev.map(c => {
          if (c.id !== item.clientId) return c;
          let bal = c.balance || 0;
          if (item.debtAmount > 0) bal -= item.debtAmount; // re-aplicar deuda
          if (item.creditUsed > 0) bal -= item.creditUsed; // re-consumir crédito
          if (item.changeAmount > 0 && item.changeMethod === "credit") bal += item.changeAmount; // re-dar vuelto como crédito
          return { ...c, balance: Math.round(bal * 100) / 100 };
        }));
      }
      // S16.1 BUG-FIX — re-incrementar usedCount del cupón (deleteSale lo había decrementado)
      if (item.couponCode && setCoupons) {
        setCoupons(prev => prev.map(c =>
          c.code === item.couponCode ? { ...c, usedCount: (c.usedCount || 0) + 1 } : c
        ));
      }
    }

    if (item._type === "purchases" && item.status === "verificado") {
      // Re-sumar stock (simetría con deletePurchase que lo había restado)
      (item.items || []).forEach(it => {
        setProducts(prev => prev.map(p =>
          p.id === it.productId && !p.isDeleted
            ? { ...p, stock: (p.stock || 0) + (Number(it.qty) || 0) }
            : p
        ));
      });
    }

    // 2) Toggle isDeleted off en la entidad restaurada
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
    padding: "6px 14px", border: "1px solid " + (active ? "#1E2B4A" : "#E5DAC2"),
    borderRadius: 20, fontSize: 12, fontWeight: active ? 700 : 500,
    background: active ? "#E8EBF2" : "#F8F2E7", color: active ? "#1E2B4A" : "#6B7794",
    cursor: "pointer"
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1E2B4A", margin: 0 }}>Papelera</h2>
          <p style={{ color: "#9AA2B3", fontSize: 13, margin: "4px 0 0" }}>
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
      <div style={{ background: "#FFFFFF", border: "1px solid #E5DAC2", borderRadius: 12, overflow: "hidden" }}>
        {filtered.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: 10, marginBottom: 10,
            background: selectedIds.length > 0 ? "#EAECF9" : "#F8F2E7",
            border: `1px solid ${selectedIds.length > 0 ? "#1E2B4A44" : "#E5DAC2"}`,
            borderRadius: 8, flexWrap: "wrap",
          }}>
            <input
              type="checkbox"
              checked={selectedIds.length === filtered.length && filtered.length > 0}
              onChange={() => selectedIds.length === filtered.length ? clearSelection() : selectAll()}
              style={{ width: 16, height: 16, cursor: "pointer" }}
              aria-label="Seleccionar todo"
            />
            <span style={{ fontSize: 12, color: "#1E2B4A", fontWeight: 600 }}>
              {selectedIds.length === 0
                ? "Seleccionar todo"
                : `${selectedIds.length} seleccionado${selectedIds.length > 1 ? "s" : ""}`}
            </span>
            {selectedIds.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                <button onClick={bulkRestore} style={{
                  padding: "5px 10px", borderRadius: 6, border: "1px solid #0F7B6C",
                  background: "#E8F5E9", color: "#0F7B6C", fontSize: 11, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}>↩ Restaurar selección</button>
                <button onClick={bulkDeleteForever} style={{
                  padding: "5px 10px", borderRadius: 6, border: "1px solid #E03E3E",
                  background: "#FBE4E4", color: "#E03E3E", fontSize: 11, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}>🗑️ Borrar permanente</button>
                <button onClick={clearSelection} style={{
                  padding: "5px 10px", borderRadius: 6, border: "1px solid #E5DAC2",
                  background: "transparent", color: "#6B7794", fontSize: 11, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}>Cancelar</button>
              </div>
            )}
          </div>
        )}
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9AA2B3", fontSize: 14 }}>
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
                borderBottom: i < filtered.length - 1 ? "1px solid #E5DAC2" : "none",
                background: selectedIds.includes(item.id) ? "#EAECF940" : "transparent",
              }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
                  aria-label="Seleccionar item"
                />
                <span style={{ fontSize: 20 }}>{entityInfo.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#1E2B4A", fontWeight: 600 }}>{item._label}</div>
                  <div style={{ fontSize: 12, color: "#9AA2B3" }}>
                    {item._sub} · Eliminado por {item.deletedBy || "?"} · {daysLeft} días restantes
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {confirmRestore === item.id ? (
                    <button onClick={() => restore(item)} style={{ ...btnStyle, background: "#DDEDEA", color: "#0F7B6C" }}>
                      Confirmar restaurar
                    </button>
                  ) : (
                    <button onClick={() => restore(item)} style={{ ...btnStyle, background: "#E8EBF2", color: "#1E2B4A" }} title="Restaurar">
                      ↩️ Restaurar
                    </button>
                  )}
                  {confirmPermanent === item.id ? (
                    <button onClick={() => permanentDelete(item)} style={{ ...btnStyle, background: "#FBE4E4", color: "#E03E3E" }}>
                      Confirmar eliminar
                    </button>
                  ) : (
                    <button onClick={() => permanentDelete(item)} style={{ ...btnStyle, background: "#FBE4E4", color: "#E03E3E" }} title="Eliminar permanentemente">
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
