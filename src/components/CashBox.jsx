import { useState, useMemo } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Modal, Card, Btn, Input, Select, Table, Badge, StatCard, SearchBar } from "./UI.jsx";

// -- CASH / CAJA --
const INITIAL_BALANCES = {
  lemonPesos: 273646.62,
  lemonUSDT: 40.12,
  mpDiego: 0,
  mpGustavo: 0,
  usdCash: 0,
  pesosCash: 120000,
};

const ACCOUNTS = [
  { id: "mpDiego", label: "MP Diego", currency: "ARS", icon: "💜", color: "#a855f7" },
  { id: "mpGustavo", label: "MP Gustavo", currency: "ARS", icon: "💙", color: "#00b894" },
  { id: "lemonPesos", label: "Lemon (Pesos)", currency: "ARS", icon: "🍋", color: "#f9ca24" },
  { id: "lemonUSDT", label: "Lemon (USDT)", currency: "USDT", icon: "🍋", color: "#26de81" },
  { id: "usdCash", label: "USD Cash", currency: "USD", icon: "💵", color: "#00cec9" },
  { id: "pesosCash", label: "Pesos Cash", currency: "ARS", icon: "💰", color: "#fdcb6e" },
];

const MOVEMENT_TYPES = [
  { value: "transfer", label: "Transferencia entre cuentas" },
  { value: "crypto_buy", label: "Compra USDT (pesos → crypto)" },
  { value: "deposit", label: "Ingreso / Depósito" },
  { value: "withdrawal", label: "Retiro / Extracción" },
];

export const CashBox = ({ sales, purchases, expenses, withdrawals, cashMovements, setCashMovements, exchangeRate, setExchangeRate, currentUser, logAudit }) => {
  const { isMobile } = useResponsive();
  const [modal, setModal] = useState(false);
  const [moveForm, setMoveForm] = useState({ type: "transfer", from: "", to: "", amount: "", amountUSDT: "", description: "", date: new Date().toISOString().slice(0, 10) });
  const [showDailyClose, setShowDailyClose] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState("all"); // all | sales | expenses | movements | purchases
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerLimit, setLedgerLimit] = useState(50);

  // Calculate account balances including movements
  // IMPORTANT: All queries must exclude soft-deleted items (!isDeleted)
  const calcBalance = (accountId) => {
    let bal = INITIAL_BALANCES[accountId] || 0;

    // Only count active (non-deleted) sales
    const activeSales = (sales || []).filter(s => !s.isDeleted);
    const activePurchases = (purchases || []).filter(p => !p.isDeleted);

    // Add from sales — supports both legacy (single paymentMethod) and new (payments array) format
    const ACCOUNT_METHOD_MAP = {
      mpDiego: (p) => p.method === "Mercado Pago" && p.mpAccount === "MP Diego",
      mpGustavo: (p) => p.method === "Mercado Pago" && p.mpAccount === "MP Gustavo",
      lemonPesos: (p) => p.method === "Lemon",
      lemonUSDT: (p) => p.method === "USDT",
      usdCash: (p) => p.method === "USD Cash",
      pesosCash: (p) => p.method === "Pesos Cash",
    };
    const matchFn = ACCOUNT_METHOD_MAP[accountId];
    if (matchFn) {
      activeSales.forEach(sale => {
        if (sale.payments && sale.payments.length > 0) {
          // New format: sum matching payments from the payments array
          sale.payments.filter(matchFn).forEach(p => { bal += Number(p.amount) || 0; });
        } else {
          // Legacy format: single paymentMethod field
          const legacyPay = { method: sale.paymentMethod, mpAccount: sale.mpAccount, amount: sale.total };
          if (matchFn(legacyPay)) bal += Number(sale.total) || 0;
        }
      });
    }
    // Purchases reduce USDT
    if (accountId === "lemonUSDT") {
      bal -= activePurchases.filter(p => p.status === "verificado" || !p.status).reduce((s, p) => s + (p.totalUSDT || 0), 0);
    }

    // Apply cash movements (exclude deleted)
    (cashMovements || []).filter(m => !m.isDeleted).forEach(m => {
      if (m.from === accountId) bal -= Number(m.amount) || 0;
      if (m.to === accountId) {
        if (m.type === "crypto_buy" && accountId === "lemonUSDT") bal += Number(m.amountUSDT) || 0;
        else bal += Number(m.amount) || 0;
      }
    });

    return bal;
  };

  const balances = {};
  ACCOUNTS.forEach(a => { balances[a.id] = calcBalance(a.id); });

  const totalARS = (balances.mpDiego || 0) + (balances.mpGustavo || 0) + (balances.lemonPesos || 0) + (balances.pesosCash || 0);
  const totalUSD = balances.usdCash || 0;
  const totalUSDT = balances.lemonUSDT || 0;

  const saveMovement = () => {
    if (!moveForm.amount || (!moveForm.from && !moveForm.to)) return;
    const newId = uid();
    const movement = { ...moveForm, id: newId, amount: Number(moveForm.amount), amountUSDT: Number(moveForm.amountUSDT) || 0, createdBy: currentUser?.name || "" };
    setCashMovements(prev => [movement, ...prev]);
    if (logAudit) logAudit("create", "cashMovement", newId, `Creó movimiento: ${moveForm.type} $${moveForm.amount} ${moveForm.from ? getAccountLabel(moveForm.from) : ""} → ${moveForm.to ? getAccountLabel(moveForm.to) : ""}`);
    setModal(false);
    setMoveForm({ type: "transfer", from: "", to: "", amount: "", amountUSDT: "", description: "", date: new Date().toISOString().slice(0, 10) });
  };

  const [confirmDeleteMov, setConfirmDeleteMov] = useState(null);
  const deleteMovement = (id) => {
    if (confirmDeleteMov !== id) { setConfirmDeleteMov(id); setTimeout(() => setConfirmDeleteMov(null), 3000); return; }
    const mov = (cashMovements || []).find(m => m.id === id);
    setCashMovements(prev => prev.map(m => m.id === id ? { ...m, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "?" } : m));
    if (logAudit && mov) logAudit("delete", "cashMovement", id, `Eliminó movimiento: ${mov.type} $${mov.amount}`);
    setConfirmDeleteMov(null);
  };

  const getAccountLabel = (id) => ACCOUNTS.find(a => a.id === id)?.label || id;

  // ============================================
  // LIBRO DIARIO — All money movements unified
  // ============================================
  const ledger = useMemo(() => {
    const entries = [];
    const activeSales = (sales || []).filter(s => !s.isDeleted);
    const activeExpenses = (expenses || []).filter(e => !e.isDeleted);
    const activePurchases = (purchases || []).filter(p => !p.isDeleted);
    const activeMovements = (cashMovements || []).filter(m => !m.isDeleted && m.type !== "daily_close");

    // Sales → each payment is an income entry
    activeSales.forEach(s => {
      const payments = s.payments && s.payments.length > 0 ? s.payments : [{ method: s.paymentMethod, mpAccount: s.mpAccount, amount: s.total }];
      payments.forEach(pay => {
        if (!pay.method || !Number(pay.amount)) return;
        const acct = pay.method === "Mercado Pago" ? (pay.mpAccount || pay.account || "MP Diego") : pay.method;
        entries.push({
          date: s.date || "", type: "income", category: "Venta",
          description: `${s.clientName || "Sin cliente"} — ${(s.items || []).map(i => i.name || "?").join(", ")}`,
          account: acct, amount: Number(pay.amount), currency: s.currency || "ARS",
          icon: "🛒", color: "#0F7B6C", refId: s.id, createdBy: s.createdBy || "",
        });
      });
      // Change (vuelto) given → expense from account
      if (s.changeAmount > 0 && s.changeMethod && s.changeMethod !== "credit") {
        const acct = s.changeMethod === "Mercado Pago" ? (s.changeMpAccount || "MP Diego") : s.changeMethod;
        entries.push({
          date: s.date || "", type: "expense", category: "Vuelto",
          description: `Vuelto a ${s.clientName || "cliente"}`,
          account: acct, amount: s.changeAmount, currency: s.currency || "ARS",
          icon: "💸", color: "#ea580c", refId: s.id, createdBy: s.createdBy || "",
        });
      }
    });

    // Expenses
    activeExpenses.forEach(e => {
      entries.push({
        date: e.date || "", type: "expense", category: e.category || "Gasto",
        description: e.description || e.category || "Gasto",
        account: "Pesos Cash", amount: e.amountARS || 0, currency: "ARS",
        icon: "💸", color: "#E03E3E", refId: e.id, createdBy: e.createdBy || "",
      });
    });

    // Purchases (USDT out)
    activePurchases.filter(p => p.totalUSDT > 0 && (p.status === "verificado" || !p.status)).forEach(p => {
      entries.push({
        date: p.date || "", type: "expense", category: "Compra importación",
        description: `${p.supplier || "Proveedor"} — ${(p.items || p.groups || []).length} productos`,
        account: "Lemon (USDT)", amount: p.totalUSDT || 0, currency: "USDT",
        icon: "🚚", color: "#5E6AD2", refId: p.id, createdBy: p.createdBy || "",
      });
    });

    // Cash movements (manual: transfers, deposits, withdrawals, crypto buys)
    activeMovements.forEach(m => {
      const typeLabels = { transfer: "Transferencia", crypto_buy: "Compra USDT", deposit: "Ingreso", withdrawal: "Retiro" };
      if (m.from) {
        entries.push({
          date: m.date || "", type: "expense", category: typeLabels[m.type] || m.type,
          description: m.description || `${typeLabels[m.type] || "Movimiento"} → ${m.to ? getAccountLabel(m.to) : ""}`,
          account: getAccountLabel(m.from), amount: Number(m.amount) || 0, currency: ACCOUNTS.find(a => a.id === m.from)?.currency || "ARS",
          icon: m.type === "crypto_buy" ? "🪙" : "💱", color: "#CB912F", refId: m.id, createdBy: m.createdBy || "",
        });
      }
      if (m.to) {
        const amtIn = m.type === "crypto_buy" && m.to === "lemonUSDT" ? (Number(m.amountUSDT) || 0) : (Number(m.amount) || 0);
        const cur = m.type === "crypto_buy" && m.to === "lemonUSDT" ? "USDT" : (ACCOUNTS.find(a => a.id === m.to)?.currency || "ARS");
        entries.push({
          date: m.date || "", type: "income", category: typeLabels[m.type] || m.type,
          description: m.description || `${typeLabels[m.type] || "Movimiento"} ← ${m.from ? getAccountLabel(m.from) : ""}`,
          account: getAccountLabel(m.to), amount: amtIn, currency: cur,
          icon: m.type === "crypto_buy" ? "🪙" : "💱", color: "#CB912F", refId: m.id, createdBy: m.createdBy || "",
        });
      }
    });

    // Sort by date descending
    entries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return entries;
  }, [sales, expenses, purchases, cashMovements]);

  // Filtered ledger
  const filteredLedger = useMemo(() => {
    let list = ledger;
    if (ledgerFilter === "sales") list = list.filter(e => e.category === "Venta" || e.category === "Vuelto");
    else if (ledgerFilter === "expenses") list = list.filter(e => e.category !== "Venta" && e.category !== "Vuelto" && e.type === "expense" && !["Transferencia", "Compra USDT", "Ingreso", "Retiro"].includes(e.category));
    else if (ledgerFilter === "movements") list = list.filter(e => ["Transferencia", "Compra USDT", "Ingreso", "Retiro"].includes(e.category));
    else if (ledgerFilter === "purchases") list = list.filter(e => e.category === "Compra importación");
    if (ledgerSearch) {
      const q = ledgerSearch.toLowerCase();
      list = list.filter(e => (e.description || "").toLowerCase().includes(q) || (e.account || "").toLowerCase().includes(q) || (e.category || "").toLowerCase().includes(q));
    }
    return list;
  }, [ledger, ledgerFilter, ledgerSearch]);

  // Daily close: snapshot of current balances
  const todayStr = new Date().toISOString().slice(0, 10);
  const dailyCloses = (cashMovements || []).filter(m => !m.isDeleted && m.type === "daily_close");
  const todayAlreadyClosed = dailyCloses.some(m => m.date === todayStr);

  const todaySalesCount = (sales || []).filter(s => !s.isDeleted && (s.date || "").slice(0, 10) === todayStr).length;
  const todayMovementsCount = (cashMovements || []).filter(m => !m.isDeleted && m.type !== "daily_close" && (m.date || "").slice(0, 10) === todayStr).length;

  const doDailyClose = () => {
    const snapshot = {};
    ACCOUNTS.forEach(a => { snapshot[a.id] = Math.round(balances[a.id] * 100) / 100; });
    const newId = uid();
    setCashMovements(prev => [{
      id: newId, type: "daily_close", date: todayStr,
      description: `Cierre de caja — ${todaySalesCount} ventas, ${todayMovementsCount} movimientos`,
      snapshot, exchangeRate,
      totalARS: Math.round(totalARS * 100) / 100,
      totalUSD: Math.round(totalUSD * 100) / 100,
      totalUSDT: Math.round(totalUSDT * 100) / 100,
      createdBy: currentUser?.name || "",
    }, ...prev]);
    if (logAudit) logAudit("create", "dailyClose", newId, `Cierre de caja diario: ${todayStr}`);
    setShowDailyClose(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#37352F", margin: 0, fontSize: 22 }}>Caja Multi-Moneda</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {!isMobile && <>
            <span style={{ color: "#8C8A82", fontSize: 13 }}>Blue:</span>
            <input type="number" value={exchangeRate} onChange={e => setExchangeRate(Number(e.target.value))}
              style={{ width: 80, padding: "6px 10px", background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 8, color: "#00b894", fontSize: 14, fontWeight: 700 }} />
          </>}
          <Btn onClick={() => setModal(true)} style={{ padding: "8px 12px", fontSize: isMobile ? 12 : 14 }}>{isMobile ? "💱" : "💱 Movimiento"}</Btn>
          {!todayAlreadyClosed ? (
            <Btn variant="success" onClick={() => setShowDailyClose(true)} style={{ padding: "8px 14px" }}>📋 Cerrar caja</Btn>
          ) : (
            <Badge color="#0F7B6C">✅ Caja cerrada hoy</Badge>
          )}
        </div>
      </div>

      {/* Daily close confirm */}
      {showDailyClose && (
        <Card style={{ marginBottom: 14, background: "#DDEDEA", border: "1px solid #B6D4CC" }}>
          <h4 style={{ color: "#0F7B6C", margin: "0 0 8px", fontSize: 14 }}>📋 Cerrar caja de hoy ({todayStr})</h4>
          <p style={{ color: "#8C8A82", fontSize: 13, margin: "0 0 10px" }}>
            Se guarda una foto de los saldos actuales. Ventas hoy: {todaySalesCount} · Movimientos hoy: {todayMovementsCount}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="success" onClick={doDailyClose}>Confirmar cierre</Btn>
            <Btn variant="secondary" onClick={() => setShowDailyClose(false)}>Cancelar</Btn>
          </div>
        </Card>
      )}

      {/* Totals */}
      <Card style={{ marginBottom: 16, background: "linear-gradient(135deg, #f8f9fc 0%, #f0f1f8 100%)", border: "1px solid #E8E7E3" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 0, textAlign: "center" }}>
          <div style={{ padding: "8px 12px" }}>
            <div style={{ color: "#8C8A82", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Total Pesos</div>
            <div style={{ color: "#5E6AD2", fontSize: isMobile ? 16 : 20, fontWeight: 800 }}>{formatMoney(totalARS)}</div>
          </div>
          <div style={{ padding: "8px 12px", borderLeft: "1px solid #E8E7E3" }}>
            <div style={{ color: "#8C8A82", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Total USD</div>
            <div style={{ color: "#00b8a9", fontSize: isMobile ? 16 : 20, fontWeight: 800 }}>{formatMoney(totalUSD, "USD")}</div>
          </div>
          <div style={{ padding: "8px 12px", borderLeft: "1px solid #E8E7E3" }}>
            <div style={{ color: "#8C8A82", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Total USDT</div>
            <div style={{ color: "#26de81", fontSize: isMobile ? 16 : 20, fontWeight: 800 }}>{formatMoney(totalUSDT, "USDT")}</div>
          </div>
          <div style={{ padding: "8px 12px", borderLeft: "1px solid #E8E7E3" }}>
            <div style={{ color: "#8C8A82", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Todo en ARS</div>
            <div style={{ color: "#CB912F", fontSize: isMobile ? 16 : 20, fontWeight: 800 }}>{formatMoney(totalARS + (totalUSD * exchangeRate) + (totalUSDT * exchangeRate))}</div>
          </div>
        </div>
      </Card>

      {/* Account cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(180px, 1fr))", gap: isMobile ? 8 : 14, marginBottom: 20 }}>
        {ACCOUNTS.map(a => {
          const val = formatMoney(balances[a.id], a.currency);
          const isLong = val.length > 12;
          return (
            <Card key={a.id} style={{ position: "relative", overflow: "hidden", padding: isMobile ? "12px 14px" : "16px 18px" }}>
              <div style={{ position: "absolute", top: 10, right: 10, fontSize: 20, opacity: 0.15 }}>{a.icon}</div>
              <div style={{ fontSize: 11, color: "#8C8A82", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: 600, whiteSpace: "nowrap" }}>{a.label}</div>
              <div style={{ fontSize: isMobile ? (isLong ? 16 : 18) : (isLong ? 20 : 24), fontWeight: 800, color: a.color, lineHeight: 1.1 }}>{val}</div>
            </Card>
          );
        })}
      </div>

      {/* ============================================ */}
      {/* LIBRO DIARIO — All movements */}
      {/* ============================================ */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <h4 style={{ color: "#37352F", margin: 0, fontSize: 16, fontWeight: 800 }}>📒 Libro Diario</h4>
          <span style={{ color: "#8C8A82", fontSize: 12 }}>{filteredLedger.length} movimientos</span>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { key: "all", label: "Todo", color: "#37352F" },
            { key: "sales", label: "Ventas", color: "#0F7B6C" },
            { key: "expenses", label: "Gastos", color: "#E03E3E" },
            { key: "purchases", label: "Compras", color: "#5E6AD2" },
            { key: "movements", label: "Movimientos", color: "#CB912F" },
          ].map(f => (
            <button key={f.key} onClick={() => { setLedgerFilter(f.key); setLedgerLimit(50); }}
              style={{
                padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: `1.5px solid ${ledgerFilter === f.key ? f.color : "#E8E7E3"}`,
                background: ledgerFilter === f.key ? `${f.color}15` : "#FAFAF9",
                color: ledgerFilter === f.key ? f.color : "#8C8A82",
              }}>{f.label}</button>
          ))}
          <div style={{ flex: 1, minWidth: 150 }}>
            <input value={ledgerSearch} onChange={e => setLedgerSearch(e.target.value)} placeholder="Buscar..."
              style={{ width: "100%", padding: "6px 12px", background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>

        {/* Entries */}
        {filteredLedger.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: "#B1AFA7" }}>Sin movimientos</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {filteredLedger.slice(0, ledgerLimit).map((entry, idx) => {
              const isIncome = entry.type === "income";
              // Group separator by date
              const prevDate = idx > 0 ? formatDate(filteredLedger[idx - 1].date) : null;
              const thisDate = formatDate(entry.date);
              const showDateHeader = thisDate !== prevDate;

              return (
                <div key={`${entry.refId}-${entry.type}-${entry.account}-${idx}`}>
                  {showDateHeader && (
                    <div style={{ padding: "10px 0 6px", fontSize: 12, fontWeight: 700, color: "#5E6AD2", borderBottom: "1px solid #E8E7E3", marginBottom: 4, marginTop: idx > 0 ? 8 : 0 }}>
                      {thisDate}
                    </div>
                  )}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 4px",
                    borderBottom: "1px solid #E8E7E3",
                  }}>
                    {/* Icon */}
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{entry.icon}</span>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Badge color={entry.color}>{entry.category}</Badge>
                        <span style={{ fontSize: 11, color: "#B1AFA7" }}>{entry.account}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#555247", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.description}
                      </div>
                    </div>
                    {/* Amount */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: isIncome ? "#0F7B6C" : "#E03E3E" }}>
                        {isIncome ? "+" : "-"}{formatMoney(entry.amount, entry.currency)}
                      </div>
                      {entry.createdBy && <div style={{ fontSize: 10, color: "#B1AFA7" }}>{entry.createdBy}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredLedger.length > ledgerLimit && (
              <button onClick={() => setLedgerLimit(l => l + 50)} style={{
                background: "none", border: "1px dashed #5E6AD233", color: "#5E6AD2", padding: "10px",
                borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, width: "100%", marginTop: 8,
              }}>Mostrar más ({filteredLedger.length - ledgerLimit} restantes)</button>
            )}
          </div>
        )}
      </Card>

      {/* Daily closes history */}
      {dailyCloses.length > 0 && (
        <Card style={{ marginTop: 14 }}>
          <h4 style={{ color: "#0F7B6C", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>📋 Cierres de caja diarios</h4>
          {dailyCloses.slice(0, 10).map((dc, i) => (
            <div key={dc.id} style={{ padding: "10px 0", borderBottom: i < Math.min(dailyCloses.length, 10) - 1 ? "1px solid #E8E7E3" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontWeight: 700, color: "#37352F", fontSize: 14 }}>{formatDate(dc.date)}</span>
                <span style={{ color: "#8C8A82", fontSize: 11 }}>por {dc.createdBy} · Blue: ${dc.exchangeRate}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {dc.snapshot && ACCOUNTS.map(a => (
                  <span key={a.id} style={{ fontSize: 11, color: "#555247", background: "#FAFAF9", padding: "3px 8px", borderRadius: 6, border: "1px solid #E8E7E3" }}>
                    {a.icon} {a.label}: <b style={{ color: a.color }}>{formatMoney(dc.snapshot[a.id] || 0, a.currency)}</b>
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#B1AFA7", marginTop: 4 }}>{dc.description}</div>
            </div>
          ))}
        </Card>
      )}

      {/* Movement Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="💱 Nuevo Movimiento de Caja">
        <Input label="Fecha" type="date" value={moveForm.date} onChange={e => setMoveForm(f => ({ ...f, date: e.target.value }))} />
        <Select label="Tipo de movimiento" options={MOVEMENT_TYPES.map(t => ({ value: t.value, label: t.label }))} value={moveForm.type} onChange={e => setMoveForm(f => ({ ...f, type: e.target.value, from: "", to: "" }))} />
        
        {(moveForm.type === "transfer" || moveForm.type === "crypto_buy") && (
          <div style={{ display: "flex", gap: 12 }}>
            <Select label="Desde" options={ACCOUNTS.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` }))} value={moveForm.from} onChange={e => setMoveForm(f => ({ ...f, from: e.target.value }))} />
            <Select label="Hacia" options={ACCOUNTS.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` }))} value={moveForm.to} onChange={e => setMoveForm(f => ({ ...f, to: e.target.value }))} />
          </div>
        )}

        {moveForm.type === "deposit" && (
          <Select label="Cuenta destino" options={ACCOUNTS.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` }))} value={moveForm.to} onChange={e => setMoveForm(f => ({ ...f, to: e.target.value }))} />
        )}

        {moveForm.type === "withdrawal" && (
          <Select label="Cuenta origen" options={ACCOUNTS.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` }))} value={moveForm.from} onChange={e => setMoveForm(f => ({ ...f, from: e.target.value }))} />
        )}

        <Input label={moveForm.type === "crypto_buy" ? "Monto en pesos" : "Monto"} type="number" value={moveForm.amount} onChange={e => setMoveForm(f => ({ ...f, amount: e.target.value }))} placeholder="ej: 100000" />
        
        {moveForm.type === "crypto_buy" && (
          <>
            <Input label="USDT recibidos" type="number" value={moveForm.amountUSDT} onChange={e => setMoveForm(f => ({ ...f, amountUSDT: e.target.value }))} placeholder="ej: 65.5" />
            {moveForm.amount && moveForm.amountUSDT && (
              <div style={{ color: "#26de81", fontSize: 13, marginBottom: 8 }}>
                Cotización: {formatMoney(Math.round(Number(moveForm.amount) / Number(moveForm.amountUSDT)))} por USDT
              </div>
            )}
          </>
        )}

        <Input label="Descripción (opcional)" value={moveForm.description} onChange={e => setMoveForm(f => ({ ...f, description: e.target.value }))} placeholder="ej: Pasé plata a Lemon para comprar USDT" />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={saveMovement}>Registrar</Btn>
        </div>
      </Modal>
    </div>
  );
};
