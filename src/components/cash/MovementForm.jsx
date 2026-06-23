import { useState, useMemo } from "react";
import { uid, formatMoney, formatDate, safeRate, dayKey } from "../../helpers.js";
import { useResponsive } from "../../App.jsx";
import { Modal, Card, Btn, Input } from "../UI.jsx";
import { T } from "../../theme.js";
import {
  ACCOUNTS, ACCOUNT_BY_ID, MOVEMENT_TYPES, TYPE_BY_KEY,
  ghostBtn, primaryBtn,
  LARGE_EXPENSE_THRESHOLD_ARS, DUP_WINDOW_MS, SUBMIT_DEBOUNCE_MS,
} from "./shared.js";

// MovementForm — Formulario unificado para los 5 tipos de movimiento de caja.
// Extraído de CashBox.jsx para reducir tamaño del archivo padre.

const MovementForm = ({ presetType, exchangeRate, balances, recentMovements = [], onSave, onCancel }) => {
  const { isMobile, isTablet } = useResponsive();
  const [type, setType] = useState(presetType || "transfer");
  const [form, setForm] = useState({
    from: "", to: "", amount: "", amountUSDT: "", description: "", date: dayKey(new Date()),
  });
  const [showMore, setShowMore] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [confirmingLarge, setConfirmingLarge] = useState(false);
  const [confirmingDup, setConfirmingDup] = useState(null); // { mov, minutes }
  const [submitting, setSubmitting] = useState(false);
  // ID estable generado UNA vez por intento → previene doble escritura si el componente
  // re-renderiza o el botón se toca dos veces rapidísimo antes del debounce
  const [draftId, setDraftId] = useState(() => uid());

  const typeInfo = TYPE_BY_KEY[type];
  const rate = form.amount && form.amountUSDT ? Math.round(Number(form.amount) / Number(form.amountUSDT)) : 0;

  // ---- validación robusta ----
  const validate = () => {
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return "El monto debe ser mayor a 0";
    if (amt < 0) return "El monto no puede ser negativo";
    for (const r of typeInfo.requires) {
      if (!form[r]) return `Falta el campo: ${r === "from" ? "cuenta origen" : r === "to" ? "cuenta destino" : r === "amountUSDT" ? "USDT" : r}`;
    }
    if (type === "transfer" && form.from === form.to) return "La cuenta origen y destino tienen que ser distintas";
    if (!form.description || form.description.trim().length < 3) return "La descripción tiene que tener al menos 3 caracteres";
    const today = dayKey(new Date());
    if (form.date && form.date > today) return "No se permiten fechas futuras";
    if ((type === "crypto_buy" || type === "crypto_sell") && (!form.amountUSDT || Number(form.amountUSDT) <= 0)) {
      return "Indicá el monto en USDT";
    }
    return null;
  };

  const canSave = !validate() && !submitting;

  // ---- detección de duplicado en últimos 5 min ----
  const findRecentDuplicate = () => {
    const amt = Number(form.amount);
    const desc = (form.description || "").trim().toLowerCase();
    const now = Date.now();
    return recentMovements.find(m => {
      if (m.isDeleted) return false;
      const mTime = new Date(m.createdAtMs || m.date).getTime();
      if (now - mTime > DUP_WINDOW_MS) return false;
      const sameAmount = Math.abs((Number(m.amount) || 0) - amt) < 0.01;
      const sameAccount = m.from === form.from && m.to === form.to;
      const sameDesc = (m.description || "").trim().toLowerCase() === desc;
      return sameAmount && sameAccount && sameDesc;
    });
  };

  // When type = crypto_buy, pre-fill suggested amountUSDT from exchange rate
  const suggestUSDT = () => {
    if (!form.amount) return;
    const r = safeRate(exchangeRate);
    if (r <= 0) return;
    setForm(f => ({ ...f, amountUSDT: (Number(f.amount) / r).toFixed(2) }));
  };

  // ---- handler unificado de submit con todas las protecciones ----
  const attemptSubmit = () => {
    const err = validate();
    if (err) { setValidationError(err); return; }
    setValidationError("");

    // 1. Duplicado en últimos 5min (a menos que el user ya haya confirmado)
    if (!confirmingDup) {
      const dup = findRecentDuplicate();
      if (dup) {
        const minutes = Math.max(1, Math.round((Date.now() - new Date(dup.createdAtMs || dup.date).getTime()) / 60000));
        setConfirmingDup({ mov: dup, minutes });
        return;
      }
    }

    // 2. Egreso grande (a menos que ya haya confirmado)
    const isLargeExpense = (type === "expense" || type === "transfer" || type === "crypto_buy") && Number(form.amount) >= LARGE_EXPENSE_THRESHOLD_ARS;
    if (isLargeExpense && !confirmingLarge) {
      setConfirmingLarge(true);
      return;
    }

    // 3. Submit con ID pre-generado y timestamp ms
    setSubmitting(true);
    onSave({
      ...form,
      type,
      id: draftId,
      createdAtMs: Date.now(),
    });

    // Re-arm: nuevo draftId para próximo registro, debounce visual
    setTimeout(() => {
      setDraftId(uid());
      setSubmitting(false);
      setConfirmingLarge(false);
      setConfirmingDup(null);
    }, SUBMIT_DEBOUNCE_MS);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Type selector */}
      <div>
        <label style={lblStyle}>Tipo de movimiento</label>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(140px, 1fr))", gap: 6 }}>
          {MOVEMENT_TYPES.map(t => (
            <button key={t.key} onClick={() => { setType(t.key); setForm(f => ({ ...f, from: "", to: "" })); }}
              style={{
                padding: "10px 12px", borderRadius: 10, textAlign: "left",
                border: `1px solid ${type === t.key ? t.color : T.borderSoft}`,
                background: type === t.key ? `${t.color}15` : T.card,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 16 }}>{t.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: type === t.key ? t.color : T.text }}>{t.label}</span>
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.3 }}>{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Account pickers */}
      {typeInfo.requires.includes("from") && (
        <AccountPicker label={type === "expense" || type === "transfer" || type.startsWith("crypto") ? "Desde cuenta" : "Cuenta origen"} value={form.from} onChange={v => setForm(f => ({ ...f, from: v }))} balances={balances} filter={type === "crypto_sell" ? "USDT" : type === "crypto_buy" ? "ARS" : null} />
      )}
      {typeInfo.requires.includes("to") && (
        <AccountPicker label={type === "income" || type === "transfer" || type.startsWith("crypto") ? "Hacia cuenta" : "Cuenta destino"} value={form.to} onChange={v => setForm(f => ({ ...f, to: v }))} balances={balances} filter={type === "crypto_buy" ? "USDT" : type === "crypto_sell" ? "ARS" : null} exclude={form.from} />
      )}

      {/* Amount */}
      <div>
        <label style={lblStyle}>
          {type === "crypto_buy" ? "Pesos a gastar" : type === "crypto_sell" ? "Pesos a recibir" : "Monto"}
        </label>
        <input type="number" value={form.amount}
          onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          placeholder="0"
          style={fieldStyle()} />
      </div>

      {/* Crypto USDT */}
      {(type === "crypto_buy" || type === "crypto_sell") && (
        <div>
          <label style={lblStyle}>USDT {type === "crypto_buy" ? "recibidos" : "entregados"}</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="number" value={form.amountUSDT}
              onChange={e => setForm(f => ({ ...f, amountUSDT: e.target.value }))}
              placeholder="0.00" step="0.01"
              style={{ ...fieldStyle(), flex: 1 }} />
            <button onClick={suggestUSDT} type="button" style={{
              padding: "0 12px", borderRadius: 10, border: `1px solid ${T.border}`,
              background: T.card, color: T.textSub, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            }}>Usar blue ${exchangeRate}</button>
          </div>
          {rate > 0 && (
            <div style={{
              marginTop: 6, padding: "6px 10px",
              background: T.amberBg, color: T.amber, borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: `1px solid ${T.amberBorder}`,
            }}>
              Cotización: <strong style={{ fontFamily: T.fontDisplay }}>${rate}</strong> por USDT
              {rate > exchangeRate * 1.05 && <span style={{ color: T.red, marginLeft: 6 }}>· más alto que blue</span>}
              {rate < exchangeRate * 0.95 && <span style={{ color: T.green, marginLeft: 6 }}>· más bajo que blue</span>}
            </div>
          )}
        </div>
      )}

      {/* Description */}
      <div>
        <label style={lblStyle}>Concepto / descripción</label>
        <input value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder={type === "expense" ? "ej: Pago proveedor Paraguay" : type === "income" ? "ej: Depósito inicial" : "ej: Pasé plata a Lemon para comprar USDT"}
          style={fieldStyle()} />
      </div>

      <div>
        <label style={lblStyle}>Etiquetas (opcional)</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {["personal", "negocio", "extraordinario", "reposición"].map(tag => {
            const active = (form.tags || []).includes(tag);
            return (
              <button
                type="button"
                key={tag}
                onClick={() => setForm(f => ({
                  ...f,
                  tags: active
                    ? (f.tags || []).filter(t => t !== tag)
                    : [...(f.tags || []), tag],
                }))}
                style={{
                  padding: "5px 10px", borderRadius: 14,
                  border: `1px solid ${active ? T.primary : T.borderSoft}`,
                  background: active ? `${T.primary}15` : "transparent",
                  color: active ? T.primary : T.textMuted,
                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >#{tag}</button>
            );
          })}
        </div>
      </div>

      {/* Advanced */}
      <button type="button" onClick={() => setShowMore(v => !v)} style={{
        background: "none", border: "none", color: T.primary, fontSize: 12, fontWeight: 600,
        cursor: "pointer", textAlign: "left", fontFamily: "inherit", padding: 0,
      }}>
        {showMore ? "▾" : "▸"} Fecha
      </button>
      {showMore && (
        <div>
          <label style={lblStyle}>Fecha</label>
          <input type="date" value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            style={fieldStyle()} />
        </div>
      )}

      {/* Validation error */}
      {validationError && (
        <div style={{
          padding: "10px 12px", borderRadius: 10,
          background: T.redBg, border: `1px solid ${T.redBorder}`,
          fontSize: 13, color: T.red, fontWeight: 600,
        }}>⚠️ {validationError}</div>
      )}

      {/* Duplicate warning */}
      {confirmingDup && (
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: T.amberBg, border: `1px solid ${T.amberBorder}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.amber, marginBottom: 4 }}>
            ⚠️ ¿Estás seguro? Movimiento parecido hace {confirmingDup.minutes} min
          </div>
          <div style={{ fontSize: 12, color: T.textSub, marginBottom: 8, lineHeight: 1.4 }}>
            <strong>{confirmingDup.mov.description}</strong><br />
            ${Number(confirmingDup.mov.amount).toLocaleString("es-AR")} · {confirmingDup.mov.from || confirmingDup.mov.to} · por {confirmingDup.mov.createdBy || "?"}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setConfirmingDup(null)} style={{ ...ghostBtn(), fontSize: 12, padding: "6px 12px" }}>
              Cancelar y revisar
            </button>
            <button onClick={attemptSubmit} style={{
              padding: "6px 12px", borderRadius: 8, border: "none",
              background: T.amber, color: "#fff", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}>Sí, registrarlo igual</button>
          </div>
        </div>
      )}

      {/* Large expense confirm */}
      {confirmingLarge && !confirmingDup && (
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: T.redBg, border: `1px solid ${T.redBorder}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.red, marginBottom: 4 }}>
            ⚠️ Movimiento grande
          </div>
          <div style={{ fontSize: 12, color: T.textSub, marginBottom: 8 }}>
            ${Number(form.amount).toLocaleString("es-AR")} es un monto importante. ¿Estás seguro?
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setConfirmingLarge(false)} style={{ ...ghostBtn(), fontSize: 12, padding: "6px 12px" }}>
              Revisar
            </button>
            <button onClick={attemptSubmit} style={{
              padding: "6px 12px", borderRadius: 8, border: "none",
              background: T.red, color: "#fff", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}>Confirmar</button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <button onClick={onCancel} style={ghostBtn()}>Cancelar</button>
        <button onClick={attemptSubmit} disabled={!canSave} style={{
          ...primaryBtn(),
          background: canSave ? T.primary : T.borderSoft,
          color: canSave ? "#fff" : T.textFaint,
          cursor: canSave ? "pointer" : "not-allowed",
          boxShadow: canSave ? T.shadowSm : "none",
        }}>{submitting ? "Registrando..." : "Registrar"}</button>
      </div>
    </div>
  );
};

const AccountPicker = ({ label, value, onChange, balances, filter, exclude }) => {
  const { isMobile, isTablet } = useResponsive();
  const opts = ACCOUNTS.filter(a => (!filter || a.currency === filter) && a.id !== exclude);
  return (
    <div>
      <label style={lblStyle}>{label}</label>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(140px, 1fr))", gap: 6 }}>
        {opts.map(a => (
          <button key={a.id} type="button" onClick={() => onChange(a.id)}
            style={{
              padding: "8px 10px", borderRadius: 10, textAlign: "left",
              border: `1px solid ${value === a.id ? a.accent : T.borderSoft}`,
              background: value === a.id ? `${a.accent}15` : T.card,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 8,
            }}>
            <span style={{ fontSize: 16 }}>{a.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: value === a.id ? a.accent : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.short}</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>
                {formatMoney(balances[a.id] || 0, a.currency)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

const lblStyle = {
  display: "block", fontSize: 11, fontWeight: 700, color: T.textMuted,
  textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6,
};
const fieldStyle = (err) => ({
  width: "100%", padding: "11px 14px", minHeight: 44,
  background: T.surface2, border: `1px solid ${err ? T.red : T.borderSoft}`,
  borderRadius: 10, color: T.text, fontSize: 16, outline: "none",
  boxSizing: "border-box", fontFamily: "inherit",
});

// ============================================
// HISTORY LIST
// ============================================
const HistoryList = ({ ledger, isMobile, onDelete, confirmDel, currentExchangeRate = 1 }) => {
  const [accountFilter, setAccountFilter] = useState([]);
  const [typeFilter, setTypeFilter] = useState(""); // "", "income", "expense"
  const [kindFilter, setKindFilter] = useState(""); // "", sale, expense, purchase, movement
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(50);

  const filtered = useMemo(() => {
    let list = ledger;
    if (accountFilter.length > 0) list = list.filter(e => accountFilter.includes(e.accountId));
    if (typeFilter) list = list.filter(e => e.type === typeFilter);
    if (kindFilter) list = list.filter(e => e.kind === kindFilter);
    if (dateFrom) list = list.filter(e => (e.date || "").slice(0, 10) >= dateFrom);
    if (dateTo) list = list.filter(e => (e.date || "").slice(0, 10) <= dateTo);
    if (minAmount) list = list.filter(e => e.amount >= Number(minAmount));
    if (maxAmount) list = list.filter(e => e.amount <= Number(maxAmount));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e => (e.description || "").toLowerCase().includes(q) || (e.category || "").toLowerCase().includes(q) || (e.account || "").toLowerCase().includes(q));
    }
    return list;
  }, [ledger, accountFilter, typeFilter, kindFilter, dateFrom, dateTo, minAmount, maxAmount, search]);

  const toggleAccount = (id) => setAccountFilter(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const clearFilters = () => {
    setAccountFilter([]); setTypeFilter(""); setKindFilter("");
    setDateFrom(""); setDateTo(""); setMinAmount(""); setMaxAmount(""); setSearch("");
  };
  const hasFilters = accountFilter.length > 0 || typeFilter || kindFilter || dateFrom || dateTo || minAmount || maxAmount || search;

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: T.radiusLg,
      padding: isMobile ? 12 : 16, boxShadow: T.shadowXs, marginBottom: 24,
    }}>
      {/* Search + kind filter */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ position: "relative", flex: "1 1 180px" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: T.textMuted, pointerEvents: "none" }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar descripción, cuenta, categoría..."
            style={{
              width: "100%", padding: "11px 12px 11px 34px", minHeight: 44, background: T.surface2,
              border: `1px solid ${T.borderSoft}`, borderRadius: 10,
              fontSize: 16, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
              color: T.text,
            }} />
        </div>
        <button onClick={() => setShowFilters(v => !v)} style={{
          padding: "9px 14px", borderRadius: 10, border: `1px solid ${hasFilters ? T.primary : T.border}`,
          background: hasFilters ? T.primarySoft : T.card,
          color: hasFilters ? T.primary : T.textSub,
          fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>
          Filtros {hasFilters && `(${accountFilter.length + (typeFilter ? 1 : 0) + (kindFilter ? 1 : 0) + (dateFrom || dateTo ? 1 : 0) + (minAmount || maxAmount ? 1 : 0)})`}
        </button>
      </div>

      {/* Kind quick pills */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: showFilters ? 12 : 14 }}>
        {[
          { k: "", l: "Todo", c: T.textSub },
          { k: "sale", l: "Ventas", c: T.green },
          { k: "expense", l: "Gastos", c: T.red },
          { k: "purchase", l: "Compras", c: T.primary },
          { k: "movement", l: "Movimientos", c: T.amber },
          { k: "conciliation", l: "Conciliación", c: T.textMuted },
        ].map(o => (
          <button key={o.k} onClick={() => setKindFilter(o.k)} style={{
            padding: "5px 12px", fontSize: 12, fontWeight: 600,
            border: `1px solid ${kindFilter === o.k ? o.c : T.borderSoft}`,
            background: kindFilter === o.k ? `${o.c}15` : T.card,
            color: kindFilter === o.k ? o.c : T.textSub,
            borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
          }}>{o.l}</button>
        ))}
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div style={{
          padding: 12, background: T.surface2, borderRadius: 10, marginBottom: 12,
          border: `1px solid ${T.borderSoft}`,
          display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 10,
        }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lblStyle}>Cuentas</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {ACCOUNTS.map(a => (
                <button key={a.id} onClick={() => toggleAccount(a.id)} style={{
                  padding: "4px 10px", fontSize: 11, fontWeight: 600,
                  border: `1px solid ${accountFilter.includes(a.id) ? a.accent : T.borderSoft}`,
                  background: accountFilter.includes(a.id) ? `${a.accent}15` : T.card,
                  color: accountFilter.includes(a.id) ? a.accent : T.textSub,
                  borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                }}>{a.icon} {a.short}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={lblStyle}>Tipo</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle()}>
              <option value="">Todos</option>
              <option value="income">Ingresos</option>
              <option value="expense">Egresos</option>
            </select>
          </div>
          <div>
            <label style={lblStyle}>Desde</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={selectStyle()} />
          </div>
          <div>
            <label style={lblStyle}>Hasta</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={selectStyle()} />
          </div>
          <div>
            <label style={lblStyle}>Monto mín.</label>
            <input type="number" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="0" style={selectStyle()} />
          </div>
          <div>
            <label style={lblStyle}>Monto máx.</label>
            <input type="number" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} placeholder="∞" style={selectStyle()} />
          </div>
          {hasFilters && (
            <div style={{ gridColumn: "1 / -1" }}>
              <button onClick={clearFilters} style={{
                background: "none", border: "none", color: T.red, fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit", padding: 0,
              }}>✕ Limpiar todos los filtros</button>
            </div>
          )}
        </div>
      )}

      {/* Count */}
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 8 }}>
        {filtered.length === ledger.length ? `${filtered.length} movimientos` : `${filtered.length} de ${ledger.length} movimientos`}
      </div>

      {/* Entries */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 16px", color: T.textMuted, fontSize: 13 }}>
          Sin movimientos con esos filtros
        </div>
      ) : (
        <>
          {(() => {
            // Pre-cómputo: para cada día visible, totales de ingresos/egresos en ARS equiv
            // (usa exchangeRate de hoy como aproximación; los items USD/USDT se convierten)
            const visible = filtered.slice(0, limit);
            const dayTotals = {}; // { "YYYY-MM-DD": { in, out, count } }
            visible.forEach(e => {
              const k = (e.date || "").slice(0, 10);
              if (!dayTotals[k]) dayTotals[k] = { in: 0, out: 0, count: 0 };
              const ARS = e.currency === "USD" || e.currency === "USDT"
                ? e.amount * (currentExchangeRate || 1)
                : e.amount;
              if (e.type === "income") dayTotals[k].in += ARS;
              else dayTotals[k].out += ARS;
              dayTotals[k].count++;
            });

            return visible.map((e, idx) => {
              const prevDate = idx > 0 ? (visible[idx - 1].date || "").slice(0, 10) : null;
              const thisDate = (e.date || "").slice(0, 10);
              const showDate = thisDate !== prevDate;
              const tot = dayTotals[thisDate];
              return (
                <div key={`${e.refId}-${e.type}-${e.accountId}-${idx}`}>
                  {showDate && (
                    <div style={{
                      padding: "14px 0 8px",
                      borderBottom: `1px solid ${T.borderSoft}`, marginBottom: 4, marginTop: idx > 0 ? 14 : 0,
                      display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8,
                    }}>
                      <div style={{
                        fontSize: 12, fontWeight: 700, color: T.primary,
                        textTransform: "uppercase", letterSpacing: 0.6,
                      }}>{formatDate(e.date)}</div>
                      <div style={{ display: "flex", gap: 12, alignItems: "baseline", fontSize: 11, fontFamily: T.fontDisplay }}>
                        {tot.in > 0 && <span style={{ color: T.green, fontWeight: 700 }}>+{formatMoney(Math.round(tot.in))}</span>}
                        {tot.out > 0 && <span style={{ color: T.red, fontWeight: 700 }}>−{formatMoney(Math.round(tot.out))}</span>}
                        <span style={{ color: T.textMuted }}>· {tot.count} mov{tot.count > 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  )}
                  <HistoryEntry entry={e} onDelete={onDelete} confirmDel={confirmDel} isMobile={isMobile} />
                </div>
              );
            });
          })()}
          {filtered.length > limit && (
            <button onClick={() => setLimit(l => l + 50)} style={{
              width: "100%", padding: "12px", marginTop: 10,
              background: "none", border: `1px dashed ${T.border}`, color: T.primary,
              borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>
              Mostrar más ({filtered.length - limit} restantes)
            </button>
          )}
        </>
      )}
    </div>
  );
};

const HistoryEntry = ({ entry: e, onDelete, confirmDel, isMobile }) => {
  const isIncome = e.type === "income";
  const canDelete = e.kind === "movement" || e.kind === "conciliation";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 4px",
      borderBottom: `1px solid ${T.borderSoft}`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: `${e.color}15`, color: e.color,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
      }}>{e.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
            background: `${e.color}15`, color: e.color, textTransform: "uppercase", letterSpacing: 0.3,
          }}>{e.category}</span>
          <span style={{ fontSize: 11, color: T.textMuted }}>{e.account}</span>
          {e.createdBy && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
              background: e.createdBy === "Diego" ? T.primarySoft : T.greenBg,
              color: e.createdBy === "Diego" ? T.primary : T.green,
            }}>{e.createdBy}</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: T.textSub, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {e.description}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          fontSize: 14, fontWeight: 800,
          color: isIncome ? T.green : T.red,
          fontFamily: T.fontDisplay, letterSpacing: "-0.01em",
        }}>
          {isIncome ? "+" : "−"}{formatMoney(e.amount, e.currency)}
        </div>
        {canDelete && (
          <button onClick={() => onDelete(e.refId)} style={{
            width: 28, height: 28, borderRadius: 6,
            background: confirmDel === e.refId ? T.red : "transparent",
            border: `1px solid ${confirmDel === e.refId ? T.red : T.borderSoft}`,
            color: confirmDel === e.refId ? "#fff" : T.textMuted,
            fontSize: 11, cursor: "pointer", fontFamily: "inherit",
          }} title={confirmDel === e.refId ? "Confirmar" : "Eliminar"}>
            {confirmDel === e.refId ? "✓" : "🗑"}
          </button>
        )}
      </div>
    </div>
  );
};

const selectStyle = () => ({
  width: "100%", padding: "11px 12px", minHeight: 44,
  background: T.card, border: `1px solid ${T.borderSoft}`,
  borderRadius: 10, color: T.text, fontSize: 16,
  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
});

// ============================================
// CONCILIATION FORM
// ============================================
const ConciliationForm = ({ balances, onSave, onCancel }) => {
  const { isMobile, isTablet } = useResponsive();
  const [real, setReal] = useState(() => {
    const r = {};
    ACCOUNTS.forEach(a => { r[a.id] = String(Math.round((balances[a.id] || 0) * 100) / 100); });
    return r;
  });
  const [notes, setNotes] = useState({});

  const diffs = ACCOUNTS.map(a => {
    const realVal = Number(real[a.id]);
    const sysVal = balances[a.id] || 0;
    const delta = isNaN(realVal) ? 0 : Math.round((realVal - sysVal) * 100) / 100;
    return { account: a, realVal, sysVal, delta };
  });
  const withDiffs = diffs.filter(d => Math.abs(d.delta) >= 0.01);
  const totalARSDiff = withDiffs.reduce((s, d) => s + (d.account.currency === "ARS" ? d.delta : 0), 0);

  const submit = () => {
    const adjustments = withDiffs.map(d => ({ accountId: d.account.id, delta: d.delta, note: notes[d.account.id] || "" }));
    onSave(adjustments);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 13, color: T.textSub, margin: 0, lineHeight: 1.5 }}>
        Ingresá el saldo real de cada cuenta. Si hay diferencia con lo que dice el sistema, se registra un ajuste con tu nota.
      </p>

      {diffs.map(d => {
        const hasDiff = Math.abs(d.delta) >= 0.01;
        return (
          <div key={d.account.id} style={{
            padding: 12, borderRadius: 10,
            border: `1px solid ${hasDiff ? T.redBorder : T.borderSoft}`,
            background: hasDiff ? T.redBg : T.surface2,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>{d.account.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{d.account.label}</div>
                <div style={{ fontSize: 11, color: T.textMuted }}>
                  Sistema: <strong style={{ color: T.text, fontFamily: T.fontDisplay }}>{formatMoney(d.sysVal, d.account.currency)}</strong>
                </div>
              </div>
              {hasDiff && (
                <span style={{
                  fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 999,
                  background: T.red, color: "#fff", fontFamily: T.fontDisplay,
                }}>
                  {d.delta > 0 ? "+" : "−"}{formatMoney(Math.abs(d.delta), d.account.currency)}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: isMobile ? "1 1 100%" : 1, minWidth: 0 }}>
                <label style={lblStyle}>Saldo real</label>
                <input type="number" value={real[d.account.id]}
                  onChange={e => setReal(r => ({ ...r, [d.account.id]: e.target.value }))}
                  step="0.01"
                  style={fieldStyle()} />
              </div>
              {hasDiff && (
                <div style={{ flex: isMobile ? "1 1 100%" : 2, minWidth: 0 }}>
                  <label style={lblStyle}>Nota (opcional)</label>
                  <input value={notes[d.account.id] || ""}
                    onChange={e => setNotes(n => ({ ...n, [d.account.id]: e.target.value }))}
                    placeholder="ej: vuelto no registrado"
                    style={fieldStyle()} />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {withDiffs.length > 0 && (
        <div style={{
          background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 10, padding: "10px 14px",
          fontSize: 12, color: T.text,
        }}>
          Se registrarán <strong>{withDiffs.length}</strong> ajuste{withDiffs.length > 1 ? "s" : ""}.
          {Math.abs(totalARSDiff) > 0 && (
            <span> Diferencia neta en ARS: <strong style={{ color: totalARSDiff >= 0 ? T.green : T.red, fontFamily: T.fontDisplay }}>
              {totalARSDiff >= 0 ? "+" : ""}{formatMoney(totalARSDiff)}
            </strong></span>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={ghostBtn()}>Cancelar</button>
        <button onClick={submit} disabled={withDiffs.length === 0} style={{
          ...primaryBtn(),
          background: withDiffs.length > 0 ? T.primary : T.borderSoft,
          color: withDiffs.length > 0 ? "#fff" : T.textFaint,
          cursor: withDiffs.length > 0 ? "pointer" : "not-allowed",
        }}>
          {withDiffs.length === 0 ? "Todo cuadra" : `Registrar ${withDiffs.length} ajuste${withDiffs.length > 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
};


// Exports adicionales: HistoryList y ConciliationForm también vivían en
// CashBox originalmente pero quedaron en este archivo tras el refactor.
// CashBox los usa directamente, así que se exportan nombrados.
// AccountPicker + HistoryEntry quedan privados (solo usados aquí).
export { HistoryList, ConciliationForm };

export default MovementForm;
