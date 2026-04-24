import { useState, useMemo } from "react";
import { uid, formatMoney, formatDate, safeRate, dayKey } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Modal } from "./UI.jsx";
import { T } from "../theme.js";
import {
  INITIAL_BALANCES, ACCOUNTS, ACCOUNT_BY_ID,
  MOVEMENT_TYPES, TYPE_BY_KEY, normalizeType,
} from "./cash/shared.js";
import MovementForm from "./cash/MovementForm.jsx";

// ============================================
// CASHBOX — el corazón financiero del negocio
// Importación Paraguay (USDT) → venta ARS → Lemon → USDT → proveedor
// ============================================

// ---- date helpers ----
const msPerDay = 86400000;
const daysAgo = (d, days) => new Date(d) >= new Date(Date.now() - days * msPerDay);

// ============================================
// MAIN
// ============================================
export const CashBox = ({ sales, purchases, expenses, withdrawals, cashMovements, setCashMovements, exchangeRate, setExchangeRate, currentUser, logAudit }) => {
  const { isMobile } = useResponsive();
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [editMovementType, setEditMovementType] = useState(null); // pre-selects type when set
  const [showConciliation, setShowConciliation] = useState(false);
  const [showDailyClose, setShowDailyClose] = useState(false);
  const [period, setPeriod] = useState("month"); // today | week | month | lastMonth | custom
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // ---- balance calculation (same as before — robust) ----
  const calcBalance = (accountId) => {
    let bal = INITIAL_BALANCES[accountId] || 0;
    const activeSales = (sales || []).filter(s => !s.isDeleted);
    const activePurchases = (purchases || []).filter(p => !p.isDeleted);

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
          sale.payments.filter(matchFn).forEach(p => { bal += Number(p.amount) || 0; });
        } else {
          const legacyPay = { method: sale.paymentMethod, mpAccount: sale.mpAccount, amount: sale.total };
          if (matchFn(legacyPay)) bal += Number(sale.total) || 0;
        }
      });

      // Vueltos: si la venta tiene changeAmount > 0 con changeMethod (no credit),
      // descontar de la cuenta correspondiente. Antes esto se hacía con un
      // cashMovement automático en Sales.jsx pero generaba doble contabilización.
      // Ahora la venta es la fuente única de verdad para el vuelto.
      activeSales.forEach(sale => {
        if (sale.changeAmount > 0 && sale.changeMethod && sale.changeMethod !== "credit") {
          const changeAccountId = payMethodToAccountId(sale.changeMethod, sale.changeMpAccount);
          // Guard: si payMethodToAccountId devolvió "" (método desconocido),
          // no descontar de ninguna cuenta. Previene que "" matchee fallback.
          if (changeAccountId && changeAccountId === accountId) bal -= Number(sale.changeAmount) || 0;
        }
      });
    }

    if (accountId === "lemonUSDT") {
      bal -= activePurchases.filter(p => p.status === "verificado" || !p.status).reduce((s, p) => s + (p.totalUSDT || 0), 0);
    }

    (cashMovements || []).filter(m => !m.isDeleted && m.type !== "daily_close" && m.type !== "conciliation_adjust").forEach(m => {
      const t = normalizeType(m.type);
      if (m.from === accountId) bal -= Number(m.amount) || 0;
      if (m.to === accountId) {
        if ((t === "crypto_buy" && accountId === "lemonUSDT") || (t === "crypto_sell" && accountId !== "lemonUSDT" && m.amountUSDT)) {
          bal += Number(m.amount) || 0; // for crypto_sell the destination gets pesos = amount
        } else if (t === "crypto_buy" && accountId === "lemonUSDT") {
          bal += Number(m.amountUSDT) || 0;
        } else {
          bal += Number(m.amount) || 0;
        }
      }
    });
    // Fix: crypto_buy increases USDT on 'to' side
    (cashMovements || []).filter(m => !m.isDeleted && normalizeType(m.type) === "crypto_buy" && m.to === "lemonUSDT" && accountId === "lemonUSDT").forEach(m => {
      // already added m.amount above, need to subtract and add amountUSDT instead
      bal -= Number(m.amount) || 0;
      bal += Number(m.amountUSDT) || 0;
    });
    // Fix: crypto_sell decreases USDT on 'from' side
    (cashMovements || []).filter(m => !m.isDeleted && normalizeType(m.type) === "crypto_sell" && m.from === "lemonUSDT" && accountId === "lemonUSDT").forEach(m => {
      // 'from' already subtracted m.amount; for USDT we should subtract m.amountUSDT instead
      bal += Number(m.amount) || 0;
      bal -= Number(m.amountUSDT) || 0;
    });

    // Conciliation adjustments
    (cashMovements || []).filter(m => !m.isDeleted && m.type === "conciliation_adjust" && m.account === accountId).forEach(m => {
      bal += Number(m.delta) || 0;
    });
    return bal;
  };

  const balances = useMemo(() => {
    const b = {};
    ACCOUNTS.forEach(a => { b[a.id] = calcBalance(a.id); });
    return b;
  }, [sales, purchases, cashMovements, exchangeRate]);

  // ---- totals ----
  const totalsByCurrency = useMemo(() => {
    let ars = 0, usd = 0, usdt = 0;
    ACCOUNTS.forEach(a => {
      const v = balances[a.id] || 0;
      if (a.currency === "ARS") ars += v;
      else if (a.currency === "USD") usd += v;
      else if (a.currency === "USDT") usdt += v;
    });
    return { ars, usd, usdt };
  }, [balances]);

  const rateSafe = safeRate(exchangeRate);
  const patrimonyARS = totalsByCurrency.ars + (totalsByCurrency.usd * rateSafe) + (totalsByCurrency.usdt * rateSafe);
  const patrimonyUSD = rateSafe > 0 ? Math.round((patrimonyARS / rateSafe) * 100) / 100 : 0;

  // ---- unified ledger (same as before with crypto_sell) ----
  const ledger = useMemo(() => {
    const entries = [];
    const activeSales = (sales || []).filter(s => !s.isDeleted);
    const activeExpenses = (expenses || []).filter(e => !e.isDeleted);
    const activePurchases = (purchases || []).filter(p => !p.isDeleted);
    const activeMovements = (cashMovements || []).filter(m => !m.isDeleted && m.type !== "daily_close");

    // Sales
    activeSales.forEach(s => {
      const payments = s.payments && s.payments.length > 0 ? s.payments : [{ method: s.paymentMethod, mpAccount: s.mpAccount, amount: s.total }];
      payments.forEach(pay => {
        if (!pay.method || !Number(pay.amount)) return;
        const accountId = payMethodToAccountId(pay.method, pay.mpAccount);
        entries.push({
          date: s.date || "", kind: "sale", type: "income", category: "Venta",
          description: `${s.clientName || "Sin cliente"}`,
          accountId, account: ACCOUNT_BY_ID[accountId]?.label || pay.method,
          amount: Number(pay.amount), currency: s.currency || "ARS",
          icon: "🛒", color: T.green, refId: s.id, createdBy: s.createdBy || "",
        });
      });
      if (s.changeAmount > 0 && s.changeMethod && s.changeMethod !== "credit") {
        const accountId = payMethodToAccountId(s.changeMethod, s.changeMpAccount);
        entries.push({
          date: s.date || "", kind: "change", type: "expense", category: "Vuelto",
          description: `Vuelto a ${s.clientName || "cliente"}`,
          accountId, account: ACCOUNT_BY_ID[accountId]?.label || s.changeMethod,
          amount: s.changeAmount, currency: s.currency || "ARS",
          icon: "💸", color: T.amber, refId: s.id, createdBy: s.createdBy || "",
        });
      }
    });

    // Expenses (assume from pesos cash unless specified)
    activeExpenses.forEach(e => {
      entries.push({
        date: e.date || "", kind: "expense", type: "expense",
        category: e.category || "Gasto",
        description: e.description || e.category || "Gasto",
        accountId: "pesosCash", account: "Pesos Cash",
        amount: e.amountARS || 0, currency: "ARS",
        icon: "💸", color: T.red, refId: e.id, createdBy: e.createdBy || "",
      });
    });

    // Purchases (USDT out)
    activePurchases.filter(p => p.totalUSDT > 0 && (p.status === "verificado" || !p.status)).forEach(p => {
      entries.push({
        date: p.date || "", kind: "purchase", type: "expense",
        category: "Importación",
        description: `${p.supplier || "Proveedor"} — ${(p.items || p.groups || []).length} ítems`,
        accountId: "lemonUSDT", account: "Lemon USDT",
        amount: p.totalUSDT || 0, currency: "USDT",
        icon: "🚚", color: T.primary, refId: p.id, createdBy: p.createdBy || "",
      });
    });

    // Manual cash movements
    activeMovements.filter(m => m.type !== "conciliation_adjust").forEach(m => {
      const t = normalizeType(m.type);
      const typeInfo = TYPE_BY_KEY[t] || { label: t, color: T.textMuted, icon: "💱" };
      if (m.from) {
        const fromAcc = ACCOUNT_BY_ID[m.from];
        const cur = t === "crypto_sell" ? "USDT" : (fromAcc?.currency || "ARS");
        const amt = t === "crypto_sell" ? (Number(m.amountUSDT) || 0) : (Number(m.amount) || 0);
        entries.push({
          date: m.date || "", kind: "movement", type: "expense",
          category: typeInfo.label,
          description: m.description || `${typeInfo.label}${m.to ? ` → ${ACCOUNT_BY_ID[m.to]?.short || m.to}` : ""}`,
          accountId: m.from, account: fromAcc?.label || m.from,
          amount: amt, currency: cur,
          icon: typeInfo.icon, color: typeInfo.color, refId: m.id, createdBy: m.createdBy || "",
        });
      }
      if (m.to) {
        const toAcc = ACCOUNT_BY_ID[m.to];
        const cur = t === "crypto_buy" && m.to === "lemonUSDT" ? "USDT" : (toAcc?.currency || "ARS");
        const amt = t === "crypto_buy" && m.to === "lemonUSDT" ? (Number(m.amountUSDT) || 0) : (Number(m.amount) || 0);
        entries.push({
          date: m.date || "", kind: "movement", type: "income",
          category: typeInfo.label,
          description: m.description || `${typeInfo.label}${m.from ? ` ← ${ACCOUNT_BY_ID[m.from]?.short || m.from}` : ""}`,
          accountId: m.to, account: toAcc?.label || m.to,
          amount: amt, currency: cur,
          icon: typeInfo.icon, color: typeInfo.color, refId: m.id, createdBy: m.createdBy || "",
        });
      }
    });

    // Conciliation adjustments
    activeMovements.filter(m => m.type === "conciliation_adjust").forEach(m => {
      const acc = ACCOUNT_BY_ID[m.account];
      const delta = Number(m.delta) || 0;
      entries.push({
        date: m.date || "", kind: "conciliation", type: delta >= 0 ? "income" : "expense",
        category: "Ajuste conciliación",
        description: m.description || "Conciliación",
        accountId: m.account, account: acc?.label || m.account,
        amount: Math.abs(delta), currency: acc?.currency || "ARS",
        icon: "⚖️", color: T.textMuted, refId: m.id, createdBy: m.createdBy || "",
      });
    });

    entries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return entries;
  }, [sales, expenses, purchases, cashMovements]);

  // ---- period filters ----
  const periodRange = useMemo(() => {
    const today = new Date();
    const toISO = (d) => d.toISOString().slice(0, 10);
    if (period === "today") return { from: toISO(today), to: toISO(today), label: "hoy" };
    if (period === "week") {
      const from = new Date(today.getTime() - 6 * msPerDay);
      return { from: toISO(from), to: toISO(today), label: "últimos 7 días" };
    }
    if (period === "month") {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toISO(from), to: toISO(today), label: "este mes" };
    }
    if (period === "lastMonth") {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: toISO(from), to: toISO(to), label: "mes anterior" };
    }
    return { from: customFrom || "", to: customTo || toISO(today), label: "personalizado" };
  }, [period, customFrom, customTo]);

  const periodEntries = useMemo(() => {
    return ledger.filter(e => {
      const d = (e.date || "").slice(0, 10);
      if (periodRange.from && d < periodRange.from) return false;
      if (periodRange.to && d > periodRange.to) return false;
      return true;
    });
  }, [ledger, periodRange]);

  // ---- patrimony trend vs 30 days ago ----
  const patrimonyTrend = useMemo(() => {
    const thirtyAgo = dayKey(new Date(Date.now() - 30 * msPerDay));
    let arsDelta = 0, usdDelta = 0, usdtDelta = 0;
    ledger.filter(e => (e.date || "").slice(0, 10) >= thirtyAgo).forEach(e => {
      const sign = e.type === "income" ? 1 : -1;
      if (e.currency === "ARS") arsDelta += sign * e.amount;
      else if (e.currency === "USD") usdDelta += sign * e.amount;
      else if (e.currency === "USDT") usdtDelta += sign * e.amount;
    });
    const totalDeltaARS = arsDelta + (usdDelta * exchangeRate) + (usdtDelta * exchangeRate);
    const past = patrimonyARS - totalDeltaARS;
    const pct = past > 0 ? Math.round(((patrimonyARS - past) / past) * 100) : 0;
    return { past, deltaARS: totalDeltaARS, pct };
  }, [ledger, patrimonyARS, exchangeRate]);

  // ---- sparkline per account (30 days daily balance) ----
  const accountSparklines = useMemo(() => {
    const out = {};
    ACCOUNTS.forEach(a => {
      // Sum entries for this account in last 30 days by day
      const days = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      // Start with current balance, walk backwards day by day undoing entries
      let bal = balances[a.id];
      const daily = []; // today backwards
      for (let i = 0; i < 30; i++) {
        const d = new Date(today.getTime() - i * msPerDay);
        const ds = dayKey(d);
        // After all i-th day entries applied, balance = current (approx, for i=0)
        daily.unshift(bal);
        // Undo entries of this day for next iteration (move to previous day's end)
        ledger.filter(e => e.accountId === a.id && (e.date || "").slice(0, 10) === ds).forEach(e => {
          const sign = e.type === "income" ? 1 : -1;
          bal -= sign * e.amount;
        });
      }
      out[a.id] = daily;
    });
    return out;
  }, [balances, ledger]);

  // ---- last movement per account ----
  const lastMovementByAccount = useMemo(() => {
    const out = {};
    ACCOUNTS.forEach(a => {
      out[a.id] = ledger.find(e => e.accountId === a.id);
    });
    return out;
  }, [ledger]);

  // ---- save movement ----
  const saveMovement = (form) => {
    if (!form.amount || Number(form.amount) <= 0) return false;
    const t = form.type;
    const req = TYPE_BY_KEY[t]?.requires || [];
    for (const r of req) if (!form[r]) return false;

    // Usa el id pre-generado del form (estable desde antes de submit) o genera uno nuevo.
    // Si ya existe un movimiento con este id (doble submit antes del debounce, race
    // de Firestore al refrescar), aborta sin crear duplicado.
    const newId = form.id || uid();
    const existing = (cashMovements || []).find(m => m.id === newId);
    if (existing) {
      console.warn(`[saveMovement] id ${newId} ya existe, ignorando doble submit`);
      return false;
    }

    const movement = {
      id: newId,
      type: t,
      from: form.from || "",
      to: form.to || "",
      amount: Number(form.amount) || 0,
      amountUSDT: Number(form.amountUSDT) || 0,
      description: (form.description || "").trim(),
      date: form.date || dayKey(new Date()),
      createdAtMs: form.createdAtMs || Date.now(),
      createdAt: new Date(form.createdAtMs || Date.now()).toISOString(),
      createdBy: currentUser?.name || "",
    };
    setCashMovements(prev => [movement, ...prev]);
    if (logAudit) logAudit("create", "cashMovement", newId, `${TYPE_BY_KEY[t].label}: ${formatMoney(form.amount)} ${form.from ? ACCOUNT_BY_ID[form.from]?.short : ""} → ${form.to ? ACCOUNT_BY_ID[form.to]?.short : ""}`);
    return true;
  };

  // ---- conciliation save ----
  const saveConciliation = (adjustments) => {
    // adjustments: { accountId: { real, note } }
    const today = dayKey(new Date());
    adjustments.forEach(({ accountId, delta, note }) => {
      if (Math.abs(delta) < 0.01) return;
      const newId = uid();
      setCashMovements(prev => [{
        id: newId,
        type: "conciliation_adjust",
        account: accountId,
        delta,
        description: note || `Ajuste de conciliación en ${ACCOUNT_BY_ID[accountId]?.label}`,
        date: today,
        createdBy: currentUser?.name || "",
        conciliationGroup: today + "-" + (currentUser?.name || ""),
      }, ...prev]);
      if (logAudit) logAudit("create", "conciliation", newId, `Ajuste ${ACCOUNT_BY_ID[accountId]?.label}: ${delta > 0 ? "+" : ""}${formatMoney(delta, ACCOUNT_BY_ID[accountId]?.currency)}`);
    });
  };

  const [confirmDel, setConfirmDel] = useState(null);
  const deleteMovement = (id) => {
    if (confirmDel !== id) { setConfirmDel(id); setTimeout(() => setConfirmDel(null), 3000); return; }
    const mov = (cashMovements || []).find(m => m.id === id);
    setCashMovements(prev => prev.map(m => m.id === id ? { ...m, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser?.name || "?" } : m));
    if (logAudit && mov) logAudit("delete", "cashMovement", id, `Eliminó: ${mov.type} $${mov.amount}`);
    setConfirmDel(null);
  };

  // ---- daily close ----
  const todayStr = dayKey(new Date());
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
      patrimonyARS: Math.round(patrimonyARS * 100) / 100,
      createdBy: currentUser?.name || "",
    }, ...prev]);
    if (logAudit) logAudit("create", "dailyClose", newId, `Cierre de caja: ${todayStr}`);
    setShowDailyClose(false);
  };

  // ---- alerts ----
  const alerts = useMemo(() => {
    const list = [];
    ACCOUNTS.forEach(a => {
      const v = balances[a.id];
      if (v < 0) list.push({ t: "danger", msg: `${a.label} en negativo`, detail: formatMoney(v, a.currency) });
    });

    // Auto-detección de duplicados: pares de cashMovements activos con mismo
    // (amount, from, to, description) en una ventana de 5 min
    const activeMovs = (cashMovements || []).filter(m => !m.isDeleted && m.type !== "daily_close" && m.type !== "conciliation_adjust");
    const dupPairs = [];
    for (let i = 0; i < activeMovs.length; i++) {
      for (let j = i + 1; j < activeMovs.length; j++) {
        const a = activeMovs[i], b = activeMovs[j];
        if (a.amount !== b.amount) continue;
        if (a.from !== b.from || a.to !== b.to) continue;
        if ((a.description || "").trim() !== (b.description || "").trim()) continue;
        const ta = new Date(a.createdAtMs || a.createdAt || a.date).getTime();
        const tb = new Date(b.createdAtMs || b.createdAt || b.date).getTime();
        if (Math.abs(ta - tb) <= 5 * 60 * 1000) dupPairs.push([a, b]);
      }
    }
    if (dupPairs.length > 0) {
      list.push({
        t: "danger",
        msg: `${dupPairs.length} posible${dupPairs.length > 1 ? "s" : ""} duplicado${dupPairs.length > 1 ? "s" : ""} en historial`,
        detail: dupPairs.slice(0, 2).map(([a]) => `${a.description} · ${formatMoney(a.amount)}`).join(" · "),
      });
    }

    // Detección de movimientos huérfanos: cashMovements con saleRef de venta inexistente o eliminada
    const activeSaleIds = new Set((sales || []).filter(s => !s.isDeleted).map(s => s.id));
    const orphans = activeMovs.filter(m => m.saleRef && !activeSaleIds.has(m.saleRef));
    if (orphans.length > 0) {
      list.push({
        t: "warning",
        msg: `${orphans.length} movimiento${orphans.length > 1 ? "s" : ""} sin venta asociada`,
        detail: "Posibles ventas eliminadas con sus vueltos huérfanos",
      });
    }

    // unusual large movement (>500k ARS or >200 USDT/USD) in last 7 days
    const bigThreshold = { ARS: 500000, USD: 500, USDT: 500 };
    const bigRecent = ledger.filter(e => daysAgo(e.date, 7) && e.amount > (bigThreshold[e.currency] || 500000));
    if (bigRecent.length > 0) {
      list.push({
        t: "info",
        msg: `${bigRecent.length} movimiento${bigRecent.length > 1 ? "s" : ""} grande${bigRecent.length > 1 ? "s" : ""} esta semana`,
        detail: bigRecent.slice(0, 2).map(e => `${e.category}: ${formatMoney(e.amount, e.currency)}`).join(" · "),
      });
    }
    // last conciliation
    const lastConciliation = (cashMovements || []).filter(m => !m.isDeleted && m.type === "conciliation_adjust").sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
    const daysSinceConciliation = lastConciliation ? Math.floor((Date.now() - new Date(lastConciliation.date).getTime()) / msPerDay) : 999;
    if (daysSinceConciliation > 14) {
      list.push({ t: "warning", msg: lastConciliation ? `Sin conciliar hace ${daysSinceConciliation} días` : "Caja nunca se concilió", detail: "Conciliá para detectar diferencias" });
    }
    return list;
  }, [balances, ledger, cashMovements, sales]);

  // ============================================
  // RENDER
  // ============================================
  return (
    <div style={{ fontFamily: T.font }}>
      {/* ========== HEADER ========== */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 26 : 32, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.02em", fontFamily: T.fontDisplay }}>
            Caja
          </h1>
          <p style={{ color: T.textMuted, fontSize: 14, margin: "6px 0 0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>{ACCOUNTS.length} cuentas activas</span>
            <span style={{ color: T.textFaint }}>·</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green }} />
              Blue
              <input type="number" value={exchangeRate} onChange={e => setExchangeRate(Number(e.target.value))}
                style={{
                  width: 70, padding: "3px 8px", background: T.surface2,
                  border: `1px solid ${T.borderSoft}`, borderRadius: 6,
                  color: T.text, fontSize: 13, fontWeight: 700, fontFamily: "inherit", outline: "none",
                }} />
            </span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setShowConciliation(true)} style={ghostBtn()}>⚖️ Conciliar</button>
          {!todayAlreadyClosed ? (
            <button onClick={() => setShowDailyClose(true)} style={ghostBtn()}>📋 Cerrar caja</button>
          ) : (
            <span style={{ padding: "8px 14px", borderRadius: 10, background: T.greenBg, color: T.green, fontSize: 13, fontWeight: 600, border: `1px solid ${T.greenBorder}` }}>
              ✓ Cerrada hoy
            </span>
          )}
          <button onClick={() => { setEditMovementType(null); setShowMovementModal(true); }} style={{
            padding: "10px 20px", borderRadius: 10, border: "none",
            background: T.primary, color: "#fff", fontSize: 14, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", boxShadow: T.shadowSm,
          }}>+ Nuevo movimiento</button>
        </div>
      </div>

      {/* ========== ALERTS ========== */}
      {alerts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
          {alerts.map((a, i) => {
            const st = { danger: { bg: T.redBg, border: T.redBorder, dot: T.red }, warning: { bg: T.amberBg, border: T.amberBorder, dot: T.amber }, info: { bg: T.blueBg, border: T.blueBorder, dot: T.blue } }[a.t];
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", background: st.bg, border: `1px solid ${st.border}`, borderRadius: 10,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 13, color: T.text }}>
                  <b style={{ color: st.dot, fontWeight: 600 }}>{a.msg}</b>
                  {a.detail && <span style={{ marginLeft: 8, color: T.textSub, fontSize: 12 }}>· {a.detail}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========== PATRIMONY HERO ========== */}
      <PatrimonyHero
        patrimonyARS={patrimonyARS}
        patrimonyUSD={patrimonyUSD}
        totals={totalsByCurrency}
        trend={patrimonyTrend}
        exchangeRate={exchangeRate}
        isMobile={isMobile}
      />

      {/* ========== 6 ACCOUNT CARDS ========== */}
      <SectionTitle>Cuentas</SectionTitle>
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)",
        gap: isMobile ? 10 : 14, marginBottom: 24,
      }}>
        {ACCOUNTS.map(a => (
          <AccountCard
            key={a.id}
            account={a}
            balance={balances[a.id]}
            exchangeRate={exchangeRate}
            sparkData={accountSparklines[a.id] || []}
            lastMovement={lastMovementByAccount[a.id]}
            isMobile={isMobile}
          />
        ))}
      </div>

      {/* ========== PERIOD FLOW ========== */}
      <SectionTitle right={
        <PeriodSelector value={period} onChange={setPeriod} customFrom={customFrom} customTo={customTo} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} />
      }>Flujo de dinero</SectionTitle>
      <PeriodFlow
        entries={periodEntries}
        range={periodRange}
        exchangeRate={exchangeRate}
        isMobile={isMobile}
      />

      {/* ========== HISTORIAL ========== */}
      <SectionTitle>Historial</SectionTitle>
      <HistoryList
        ledger={ledger}
        isMobile={isMobile}
        onDelete={deleteMovement}
        confirmDel={confirmDel}
        currentExchangeRate={exchangeRate}
      />

      {/* ========== DAILY CLOSES ========== */}
      {dailyCloses.length > 0 && (
        <>
          <SectionTitle>Cierres de caja diarios</SectionTitle>
          <DailyClosesList closes={dailyCloses} isMobile={isMobile} />
        </>
      )}

      {/* ========== MODALS ========== */}
      {showMovementModal && (
        <Modal open={true} onClose={() => { setShowMovementModal(false); setEditMovementType(null); }} title="Nuevo movimiento">
          <MovementForm
            presetType={editMovementType}
            exchangeRate={exchangeRate}
            currentUser={currentUser}
            balances={balances}
            recentMovements={(cashMovements || []).filter(m => !m.isDeleted && m.type !== "daily_close").slice(0, 30)}
            onSave={(form) => { if (saveMovement(form)) { setShowMovementModal(false); setEditMovementType(null); } }}
            onCancel={() => { setShowMovementModal(false); setEditMovementType(null); }}
          />
        </Modal>
      )}

      {showConciliation && (
        <Modal open={true} onClose={() => setShowConciliation(false)} title="Conciliar caja">
          <ConciliationForm
            balances={balances}
            onSave={(adjustments) => { saveConciliation(adjustments); setShowConciliation(false); }}
            onCancel={() => setShowConciliation(false)}
          />
        </Modal>
      )}

      {showDailyClose && (
        <Modal open={true} onClose={() => setShowDailyClose(false)} title={`Cerrar caja · ${todayStr}`}>
          <div>
            <p style={{ fontSize: 14, color: T.textSub, marginBottom: 14, lineHeight: 1.5 }}>
              Se guarda una foto de los saldos actuales. Hoy: <strong style={{ color: T.text }}>{todaySalesCount} ventas</strong> ·{" "}
              <strong style={{ color: T.text }}>{todayMovementsCount} movimientos</strong>.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {ACCOUNTS.map(a => (
                <div key={a.id} style={{ background: T.surface2, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.borderSoft}` }}>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{a.icon} {a.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: a.accent, fontFamily: T.fontDisplay }}>
                    {formatMoney(balances[a.id] || 0, a.currency)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowDailyClose(false)} style={ghostBtn()}>Cancelar</button>
              <button onClick={doDailyClose} style={primaryBtn()}>Confirmar cierre</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ============================================
// HELPERS
// ============================================
function payMethodToAccountId(method, mpAccount) {
  if (method === "Mercado Pago") return mpAccount === "MP Gustavo" ? "mpGustavo" : "mpDiego";
  if (method === "Lemon") return "lemonPesos";
  if (method === "USDT") return "lemonUSDT";
  if (method === "USD Cash") return "usdCash";
  if (method === "Pesos Cash") return "pesosCash";
  return "";
}

// ============================================
// UI PRIMITIVES
// ============================================
const SectionTitle = ({ children, right }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, marginTop: 8, gap: 12, flexWrap: "wrap" }}>
    <h2 style={{ fontSize: 13, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.8, margin: 0 }}>{children}</h2>
    {right}
  </div>
);

const ghostBtn = () => ({
  padding: "8px 14px", borderRadius: 10, border: `1px solid ${T.border}`,
  background: T.card, color: T.textSub, fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
});
const primaryBtn = () => ({
  padding: "10px 20px", borderRadius: 10, border: "none",
  background: T.primary, color: "#fff", fontSize: 14, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit", boxShadow: T.shadowSm,
});

const Sparkline = ({ data, color, width = 100, height = 28 }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = (max - min) || 1;
  const n = data.length;
  const points = data.map((v, i) => {
    const x = (i / (n - 1)) * (width - 2) + 1;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return [x, y];
  });
  const path = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const area = `${path} L${points[n - 1][0]},${height} L${points[0][0]},${height} Z`;
  const gradId = `sp-${Math.random().toString(36).slice(2)}`;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ============================================
// PATRIMONY HERO
// ============================================
const PatrimonyHero = ({ patrimonyARS, patrimonyUSD, totals, trend, exchangeRate, isMobile }) => {
  const up = trend.pct >= 0;
  return (
    <div style={{
      background: T.card, borderRadius: T.radiusLg,
      border: `1px solid ${T.borderSoft}`, boxShadow: T.shadowSm,
      padding: isMobile ? 18 : 24, marginBottom: 20,
      background: `linear-gradient(135deg, ${T.card} 0%, #FDFCF8 100%)`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
            Patrimonio del negocio
          </div>
          <div style={{
            fontSize: isMobile ? 34 : 44, fontWeight: 800, color: T.text,
            fontFamily: T.fontDisplay, lineHeight: 1, letterSpacing: "-0.025em",
          }}>
            {formatMoney(Math.round(patrimonyARS))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: T.textSub, fontFamily: T.fontDisplay }}>
              ≈ {formatMoney(patrimonyUSD, "USD")}
            </span>
            {trend.pct !== 0 && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 10px", borderRadius: 999,
                background: up ? T.greenBg : T.redBg,
                color: up ? T.green : T.red,
                fontSize: 12, fontWeight: 700,
              }}>
                <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: up ? "none" : "rotate(180deg)" }}>
                  <path d="M5 1 L9 6 L1 6 Z" fill="currentColor" />
                </svg>
                {Math.abs(trend.pct)}% últimos 30 días
              </span>
            )}
          </div>
        </div>

        {/* Breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr 1fr" : "1fr 1fr 1fr", gap: isMobile ? 6 : 10, flex: "1 1 100%", width: "100%" }}>
          <MiniBreakdown label="Pesos" value={formatMoney(totals.ars)} color={T.primary} />
          <MiniBreakdown label="USD" value={formatMoney(totals.usd, "USD")} sub={totals.usd > 0 ? `${formatMoney(totals.usd * exchangeRate)} ARS` : ""} color={T.green} />
          <MiniBreakdown label="USDT" value={formatMoney(totals.usdt, "USDT")} sub={totals.usdt > 0 ? `${formatMoney(totals.usdt * exchangeRate)} ARS` : ""} color={T.amber} />
        </div>
      </div>
    </div>
  );
};

const MiniBreakdown = ({ label, value, sub, color }) => (
  <div style={{
    background: T.surface2, border: `1px solid ${T.borderSoft}`, borderRadius: 10,
    padding: "10px 12px",
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</span>
    </div>
    <div style={{ fontSize: 15, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, lineHeight: 1.1, letterSpacing: "-0.01em" }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: T.textMuted, marginTop: 3 }}>{sub}</div>}
  </div>
);

// ============================================
// ACCOUNT CARD
// ============================================
const AccountCard = ({ account, balance, exchangeRate, sparkData, lastMovement, isMobile }) => {
  const arsEquiv = account.currency === "ARS" ? null : balance * exchangeRate;
  const lastInfo = lastMovement ? (() => {
    const diff = (Date.now() - new Date(lastMovement.date).getTime()) / msPerDay;
    let when;
    if (diff < 1) when = "hoy";
    else if (diff < 2) when = "ayer";
    else if (diff < 30) when = `hace ${Math.floor(diff)}d`;
    else when = formatDate(lastMovement.date);
    return { when, category: lastMovement.category, amount: lastMovement.amount, currency: lastMovement.currency, type: lastMovement.type };
  })() : null;
  const negative = balance < 0;
  return (
    <div style={{
      background: T.card, borderRadius: T.radiusLg,
      border: `1px solid ${negative ? T.redBorder : T.borderSoft}`,
      padding: isMobile ? 14 : 16, boxShadow: T.shadowXs,
      display: "flex", flexDirection: "column", gap: 12,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${account.accent}18`, color: account.accent,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0,
          }}>{account.icon}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.label}</div>
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{account.sub}</div>
          </div>
        </div>
        <Sparkline data={sparkData} color={account.accent} width={60} height={24} />
      </div>

      <div>
        <div style={{
          fontSize: isMobile ? 19 : 22, fontWeight: 800,
          color: negative ? T.red : T.text,
          fontFamily: T.fontDisplay, lineHeight: 1.1, letterSpacing: "-0.02em",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {formatMoney(balance, account.currency)}
        </div>
        {arsEquiv != null && (
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
            ≈ {formatMoney(Math.round(arsEquiv))} ARS
          </div>
        )}
      </div>

      {lastInfo ? (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 11, color: T.textSub, paddingTop: 10, borderTop: `1px solid ${T.borderSoft}`, gap: 6,
        }}>
          <span style={{ color: T.textMuted }}>{lastInfo.when}</span>
          <span style={{
            color: lastInfo.type === "income" ? T.green : T.red, fontWeight: 600,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {lastInfo.type === "income" ? "+" : "−"}{formatMoney(lastInfo.amount, lastInfo.currency)} {lastInfo.category}
          </span>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: T.textMuted, paddingTop: 10, borderTop: `1px solid ${T.borderSoft}` }}>
          Sin movimientos
        </div>
      )}
    </div>
  );
};

// ============================================
// PERIOD SELECTOR + PERIOD FLOW
// ============================================
const PeriodSelector = ({ value, onChange, customFrom, customTo, setCustomFrom, setCustomTo }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
    <div style={{ display: "inline-flex", background: T.surface2, borderRadius: 10, padding: 3, border: `1px solid ${T.borderSoft}` }}>
      {[
        { k: "today", l: "Hoy" },
        { k: "week", l: "Semana" },
        { k: "month", l: "Mes" },
        { k: "lastMonth", l: "Mes ant." },
        { k: "custom", l: "Custom" },
      ].map(o => (
        <button key={o.k} onClick={() => onChange(o.k)} style={{
          padding: "5px 10px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 7,
          background: value === o.k ? T.card : "transparent",
          color: value === o.k ? T.text : T.textSub,
          boxShadow: value === o.k ? T.shadowXs : "none",
          cursor: "pointer", fontFamily: "inherit",
        }}>{o.l}</button>
      ))}
    </div>
    {value === "custom" && (
      <>
        <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={dateInput()} />
        <span style={{ color: T.textMuted, fontSize: 12 }}>—</span>
        <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={dateInput()} />
      </>
    )}
  </div>
);

const dateInput = () => ({
  padding: "5px 10px", fontSize: 12, border: `1px solid ${T.border}`,
  borderRadius: 7, background: T.card, color: T.text, fontFamily: "inherit", outline: "none",
});

const PeriodFlow = ({ entries, range, exchangeRate, isMobile }) => {
  // Convert to ARS for flow totals
  const toARS = (amt, cur) => cur === "USD" || cur === "USDT" ? amt * exchangeRate : amt;
  const income = entries.filter(e => e.type === "income").reduce((s, e) => s + toARS(e.amount, e.currency), 0);
  const expense = entries.filter(e => e.type === "expense").reduce((s, e) => s + toARS(e.amount, e.currency), 0);
  const net = income - expense;

  // By account
  const byAccount = {};
  ACCOUNTS.forEach(a => { byAccount[a.id] = { in: 0, out: 0 }; });
  entries.forEach(e => {
    if (!byAccount[e.accountId]) return;
    const v = toARS(e.amount, e.currency);
    if (e.type === "income") byAccount[e.accountId].in += v;
    else byAccount[e.accountId].out += v;
  });

  // Daily bars
  const days = [];
  if (range.from && range.to) {
    const start = new Date(range.from);
    const end = new Date(range.to);
    const dayCount = Math.min(60, Math.max(1, Math.round((end - start) / msPerDay) + 1));
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(start.getTime() + i * msPerDay);
      days.push({ key: dayKey(d), label: d.toLocaleDateString("es-AR", { day: "numeric", month: "short" }), in: 0, out: 0 });
    }
  }
  const dayIdx = Object.fromEntries(days.map((d, i) => [d.key, i]));
  entries.forEach(e => {
    const k = (e.date || "").slice(0, 10);
    const idx = dayIdx[k];
    if (idx == null) return;
    const v = toARS(e.amount, e.currency);
    if (e.type === "income") days[idx].in += v;
    else days[idx].out += v;
  });
  const maxBar = Math.max(1, ...days.map(d => Math.max(d.in, d.out)));

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: T.radiusLg,
      padding: isMobile ? 14 : 18, boxShadow: T.shadowXs, marginBottom: 24,
    }}>
      {/* Summary */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)",
        gap: 10, marginBottom: 16,
      }}>
        <FlowStat label="Ingresos" value={formatMoney(Math.round(income))} color={T.green} />
        <FlowStat label="Egresos" value={formatMoney(Math.round(expense))} color={T.red} />
        <FlowStat label="Neto" value={formatMoney(Math.round(net))} color={net >= 0 ? T.green : T.red} span={isMobile ? 2 : 1} emphasize />
      </div>

      {/* Daily chart */}
      {days.length > 1 && (income > 0 || expense > 0) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
            Día por día ({range.label})
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80, paddingBottom: 4 }}>
            {days.map((d, i) => (
              <div key={d.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, height: "100%", justifyContent: "flex-end" }} title={`${d.label}: +${formatMoney(Math.round(d.in))} / −${formatMoney(Math.round(d.out))}`}>
                <div style={{ width: "100%", background: T.green, height: `${(d.in / maxBar) * 70}%`, borderRadius: "3px 3px 0 0", minHeight: d.in > 0 ? 2 : 0, opacity: 0.9 }} />
                <div style={{ width: "100%", background: T.red, height: `${(d.out / maxBar) * 70}%`, borderRadius: d.in > 0 ? 0 : "3px 3px 0 0", minHeight: d.out > 0 ? 2 : 0, opacity: 0.7 }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.textFaint, marginTop: 4 }}>
            <span>{days[0]?.label}</span>
            <span>{days[days.length - 1]?.label}</span>
          </div>
        </div>
      )}

      {/* By account */}
      <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
        Por cuenta
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {ACCOUNTS.map(a => {
          const b = byAccount[a.id];
          if (b.in === 0 && b.out === 0) return null;
          return (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
              background: T.surface2, borderRadius: 8, border: `1px solid ${T.borderSoft}`,
            }}>
              <span style={{ fontSize: 14 }}>{a.icon}</span>
              <span style={{ fontSize: 12, color: T.text, fontWeight: 600, flex: 1 }}>{a.short}</span>
              {b.in > 0 && <span style={{ fontSize: 11, color: T.green, fontWeight: 700, fontFamily: T.fontDisplay }}>+{formatMoney(Math.round(b.in))}</span>}
              {b.out > 0 && <span style={{ fontSize: 11, color: T.red, fontWeight: 700, fontFamily: T.fontDisplay }}>−{formatMoney(Math.round(b.out))}</span>}
            </div>
          );
        })}
        {ACCOUNTS.every(a => byAccount[a.id].in === 0 && byAccount[a.id].out === 0) && (
          <div style={{ fontSize: 12, color: T.textMuted, padding: "8px 0" }}>Sin movimientos en este período</div>
        )}
      </div>
    </div>
  );
};

const FlowStat = ({ label, value, color, span, emphasize }) => (
  <div style={{
    background: emphasize ? `${color}10` : T.surface2,
    border: `1px solid ${emphasize ? `${color}40` : T.borderSoft}`,
    borderRadius: 10, padding: "12px 14px",
    gridColumn: span === 2 ? "span 2" : undefined,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</span>
    </div>
    <div style={{ fontSize: emphasize ? 22 : 18, fontWeight: 800, color, fontFamily: T.fontDisplay, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{value}</div>
  </div>
);

// ============================================
// MOVEMENT FORM
// ============================================
// Umbral configurable de "egreso grande" (ARS) que pide confirmación extra
const LARGE_EXPENSE_THRESHOLD_ARS = 200000;
// Ventana de detección de duplicados (ms)
const DUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutos
// Debounce del botón Registrar después de tocar (ms)
const SUBMIT_DEBOUNCE_MS = 3000;

// ============================================
// DAILY CLOSES LIST
// ============================================
const DailyClosesList = ({ closes, isMobile }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? closes : closes.slice(0, 3);
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: T.radiusLg,
      padding: isMobile ? 12 : 16, boxShadow: T.shadowXs, marginBottom: 20,
    }}>
      {visible.map((dc, i) => (
        <div key={dc.id} style={{
          padding: "10px 0",
          borderBottom: i < visible.length - 1 ? `1px solid ${T.borderSoft}` : "none",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
            <div>
              <span style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>{formatDate(dc.date)}</span>
              {dc.patrimonyARS && (
                <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 700, color: T.green, fontFamily: T.fontDisplay }}>
                  {formatMoney(dc.patrimonyARS)} patrimonio
                </span>
              )}
            </div>
            <span style={{ color: T.textMuted, fontSize: 11 }}>
              por <strong>{dc.createdBy}</strong> · Blue ${dc.exchangeRate}
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {dc.snapshot && ACCOUNTS.map(a => (
              <span key={a.id} style={{
                fontSize: 10, color: T.textSub, background: T.surface2,
                padding: "3px 8px", borderRadius: 6, border: `1px solid ${T.borderSoft}`,
              }}>
                {a.icon} <strong style={{ color: a.accent, fontFamily: T.fontDisplay }}>{formatMoney(dc.snapshot[a.id] || 0, a.currency)}</strong>
              </span>
            ))}
          </div>
        </div>
      ))}
      {closes.length > 3 && (
        <button onClick={() => setExpanded(v => !v)} style={{
          background: "none", border: "none", color: T.primary, fontSize: 12, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit", padding: "8px 0 0", textAlign: "left",
        }}>
          {expanded ? "Ver menos" : `+${closes.length - 3} cierres más`}
        </button>
      )}
    </div>
  );
};
