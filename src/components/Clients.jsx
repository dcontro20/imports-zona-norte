import { useState, useMemo } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Modal, Card, Btn } from "./UI.jsx";
import { PAYMENT_METHODS, MP_ACCOUNTS } from "../constants.js";
import { T, pickAvatarColor } from "../theme.js";

// ---------- helpers ----------
// Resuelve el nombre de un item de venta aunque no lo tenga guardado:
// QuickSale guarda `name`, Sales.jsx no. Buscamos el producto por productId.
const resolveItemName = (item, productsById) => {
  if (item.name) return item.name;
  if (item.productName) return item.productName;
  const p = item.productId ? productsById[item.productId] : null;
  if (p) return `${p.brand} ${p.model} - ${p.flavor}`;
  return "Producto eliminado";
};

const digitsOnly = (s) => String(s || "").replace(/\D/g, "");
const isValidPhone = (s) => digitsOnly(s).length >= 10;
const cleanIG = (s) => String(s || "").replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "").trim();
const waNumber = (phone) => {
  const d = digitsOnly(phone);
  if (!d) return "";
  // Argentinian: 9 antes del número de celular (formato WhatsApp)
  if (d.startsWith("54")) return d.startsWith("549") ? d : `549${d.slice(2)}`;
  return `549${d}`;
};
const monthKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; };
const monthLabel = (k) => {
  const [y, m] = k.split("-");
  return new Date(+y, +m - 1, 1).toLocaleDateString("es-AR", { month: "short" });
};

// ---------- mini sparkline ----------
const Sparkline = ({ data, width = 200, height = 50, color = T.primary }) => {
  if (!data || data.length < 2) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.textMuted }}>No hay datos suficientes</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  const min = 0;
  const range = max - min || 1;
  const n = data.length;
  const points = data.map((d, i) => {
    const x = (i / (n - 1)) * (width - 20) + 10;
    const y = height - 10 - ((d.value - min) / range) * (height - 20);
    return [x, y];
  });
  const path = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const area = `${path} L${points[points.length - 1][0]},${height - 10} L${points[0][0]},${height - 10} Z`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkGrad)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 3.5 : 2} fill={color} />
      ))}
      {data.map((d, i) => (
        <text key={`l-${i}`} x={points[i][0]} y={height - 2} textAnchor="middle" fontSize="9" fill={T.textMuted} fontFamily="inherit">
          {monthLabel(d.key)}
        </text>
      ))}
    </svg>
  );
};

// ---------- small UI primitives ----------
const Avatar = ({ name, id, size = 40 }) => {
  const { bg, fg } = pickAvatarColor(id || name);
  const initial = String(name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg, color: fg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: size * 0.42, flexShrink: 0,
      fontFamily: T.fontDisplay, letterSpacing: "-0.02em",
    }}>{initial}</div>
  );
};

const ContactChip = ({ icon, label, href, color = T.text }) => (
  <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer"
    onClick={e => e.stopPropagation()}
    style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px",
      background: T.surface2, borderRadius: T.radiusSm, textDecoration: "none",
      color, fontSize: 12, fontWeight: 500, border: `1px solid ${T.borderSoft}`,
      transition: "all .15s", whiteSpace: "nowrap",
    }}
    onMouseEnter={e => { e.currentTarget.style.background = T.cardHover; e.currentTarget.style.borderColor = T.border; }}
    onMouseLeave={e => { e.currentTarget.style.background = T.surface2; e.currentTarget.style.borderColor = T.borderSoft; }}>
    <span style={{ fontSize: 13 }}>{icon}</span>
    <span>{label}</span>
  </a>
);

const Pill = ({ active, onClick, children, color = T.primary }) => (
  <button onClick={onClick} style={{
    padding: "7px 14px", borderRadius: 999, border: `1px solid ${active ? color : T.border}`,
    background: active ? `${color}15` : T.card, color: active ? color : T.textSub,
    fontSize: 13, fontWeight: active ? 600 : 500, cursor: "pointer",
    transition: "all .15s", fontFamily: "inherit", whiteSpace: "nowrap",
  }}>{children}</button>
);

// ============================================
// CLIENTS — redesigned with Notion/Linear warmth
// ============================================
export const Clients = ({ clients, setClients, sales, products }) => {
  const { isMobile } = useResponsive();

  // ---- UI state ----
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("name"); // name | spent | recent | debt | credit | zone
  const [zoneFilter, setZoneFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState(""); // "" | "YYYY-MM"
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", instagram: "", zona: "", notes: "" });
  const [editing, setEditing] = useState(null);
  const [phoneError, setPhoneError] = useState("");

  const [historyClient, setHistoryClient] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const [balanceModal, setBalanceModal] = useState(false);
  const [balanceForm, setBalanceForm] = useState({ clientId: "", clientName: "", currentBalance: 0, type: "payment", amount: "", method: "", mpAccount: "", notes: "" });

  // ---- products lookup by id (used to resolve item names) ----
  const productsById = useMemo(() => {
    const map = {};
    (products || []).forEach(p => { map[p.id] = p; });
    return map;
  }, [products]);

  // ---- stats per client ----
  const clientStats = useMemo(() => {
    const map = {};
    clients.forEach(c => {
      const cs = sales.filter(s => s.clientId === c.id && !s.isDeleted);
      const totalSpent = cs.reduce((sum, s) => sum + (s.total || 0), 0);
      const totalUnits = cs.reduce((sum, s) => sum + (s.items || []).reduce((a, i) => a + (i.qty || 1), 0), 0);
      const sorted = [...cs].sort((a, b) => new Date(b.date) - new Date(a.date));
      const lastPurchase = sorted[0] || null;
      const firstPurchase = sorted[sorted.length - 1] || null;
      // Favorites: group by productId when available, else by resolved name.
      // Así dos ventas con el mismo producto (una con name, otra solo productId) cuentan juntas.
      const prodFreq = {};
      cs.forEach(s => (s.items || []).forEach(item => {
        const key = item.productId || item.name || "unknown";
        const name = resolveItemName(item, productsById);
        if (!prodFreq[key]) prodFreq[key] = { name, qty: 0 };
        prodFreq[key].qty += item.qty || 1;
      }));
      const favProducts = Object.values(prodFreq).sort((a, b) => b.qty - a.qty).slice(0, 3);
      // monthly spending
      const byMonth = {};
      cs.forEach(s => { const k = monthKey(s.date); byMonth[k] = (byMonth[k] || 0) + (s.total || 0); });
      // frequency (days between first and last / (count - 1))
      let avgDays = null;
      if (cs.length >= 2) {
        const days = (new Date(lastPurchase.date) - new Date(firstPurchase.date)) / 86400000;
        avgDays = Math.round(days / (cs.length - 1));
      }
      map[c.id] = { salesCount: cs.length, totalSpent, totalUnits, lastPurchase, firstPurchase, favProducts, byMonth, avgDays, sales: cs };
    });
    return map;
  }, [clients, sales, productsById]);

  // ---- global stats for metric cards ----
  const now = new Date();
  const globalStats = useMemo(() => {
    const thisMonth = sales.filter(s => { const d = new Date(s.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && !s.isDeleted; });
    const thisMonthClientIds = new Set(thisMonth.map(s => s.clientId).filter(Boolean));
    // top client of the month
    const monthSpend = {};
    thisMonth.forEach(s => { if (s.clientId) monthSpend[s.clientId] = (monthSpend[s.clientId] || 0) + (s.total || 0); });
    const topMonthEntry = Object.entries(monthSpend).sort((a, b) => b[1] - a[1])[0];
    const topMonthClient = topMonthEntry ? { name: clients.find(c => c.id === topMonthEntry[0])?.name || "?", spent: topMonthEntry[1] } : { name: "-", spent: 0 };
    // newest client (by id as pseudo-timestamp or by creation order — use last element as fallback)
    const newest = [...clients].sort((a, b) => (b.createdAt || b.id || "").localeCompare(a.createdAt || a.id || "")).filter(c => c.name)[0];
    // total revenue
    const totalRevenue = sales.filter(s => !s.isDeleted).reduce((sum, s) => sum + (s.total || 0), 0);
    // avg spend per client
    const withPurchases = clients.filter(c => clientStats[c.id]?.salesCount > 0);
    const avgSpend = withPurchases.length > 0 ? withPurchases.reduce((s, c) => s + clientStats[c.id].totalSpent, 0) / withPurchases.length : 0;
    // zones
    const zoneCounts = {};
    clients.forEach(c => { const z = (c.zona || "").trim(); if (z) zoneCounts[z] = (zoneCounts[z] || 0) + 1; });
    const topZones = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1]);
    return {
      total: clients.length,
      activeThisMonth: thisMonthClientIds.size,
      totalRevenue,
      topMonthClient,
      newest,
      avgSpend,
      topZones,
    };
  }, [clients, sales, clientStats]);

  // ---- zone suggestions for form ----
  const knownZones = useMemo(() => {
    const set = new Set();
    clients.forEach(c => { const z = (c.zona || "").trim(); if (z) set.add(z); });
    return [...set].sort();
  }, [clients]);

  // ---- filters ----
  const filtered = useMemo(() => {
    let list = [...clients];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.instagram || "").toLowerCase().includes(q) ||
        (c.zona || "").toLowerCase().includes(q)
      );
    }
    if (zoneFilter) list = list.filter(c => (c.zona || "").trim().toLowerCase() === zoneFilter.toLowerCase());
    if (monthFilter) {
      list = list.filter(c => {
        const cs = clientStats[c.id]?.sales || [];
        return cs.some(s => monthKey(s.date) === monthFilter);
      });
    }
    if (filter === "debt") list = list.filter(c => (c.balance || 0) < 0);
    if (filter === "credit") list = list.filter(c => (c.balance || 0) > 0);
    // sort
    list.sort((a, b) => {
      if (filter === "spent") return (clientStats[b.id]?.totalSpent || 0) - (clientStats[a.id]?.totalSpent || 0);
      if (filter === "recent") {
        const da = clientStats[a.id]?.lastPurchase ? new Date(clientStats[a.id].lastPurchase.date) : new Date(0);
        const db = clientStats[b.id]?.lastPurchase ? new Date(clientStats[b.id].lastPurchase.date) : new Date(0);
        return db - da;
      }
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [clients, search, filter, zoneFilter, monthFilter, clientStats]);

  // ---- month options for filter ----
  const availableMonths = useMemo(() => {
    const set = new Set();
    sales.forEach(s => { if (!s.isDeleted) set.add(monthKey(s.date)); });
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [sales]);

  // ---- actions ----
  const openNew = () => { setForm({ name: "", phone: "", instagram: "", zona: "", notes: "" }); setEditing(null); setPhoneError(""); setModal(true); };
  const openEdit = (c) => { setForm({ name: c.name || "", phone: c.phone || "", instagram: c.instagram || "", zona: c.zona || "", notes: c.notes || "" }); setEditing(c.id); setPhoneError(""); setModal(true); };

  const save = () => {
    if (!form.name.trim()) return;
    if (form.phone && !isValidPhone(form.phone)) { setPhoneError("Teléfono debe tener al menos 10 dígitos"); return; }
    if (editing) {
      setClients(prev => prev.map(c => c.id === editing ? { ...c, ...form, name: form.name.trim(), zona: form.zona.trim(), instagram: cleanIG(form.instagram) } : c));
    } else {
      setClients(prev => [...prev, { ...form, name: form.name.trim(), zona: form.zona.trim(), instagram: cleanIG(form.instagram), id: uid(), createdAt: new Date().toISOString() }]);
    }
    setModal(false);
  };

  const handleDelete = (c) => {
    if (confirmDel !== c.id) { setConfirmDel(c.id); setTimeout(() => setConfirmDel(null), 3000); return; }
    setClients(prev => prev.filter(x => x.id !== c.id));
    setConfirmDel(null);
  };

  const openBalanceAdjust = (c) => {
    setBalanceForm({
      clientId: c.id, clientName: c.name, currentBalance: c.balance || 0,
      type: (c.balance || 0) < 0 ? "payment" : "adjustment",
      amount: "", method: "", mpAccount: "", notes: "",
    });
    setBalanceModal(true);
  };

  const saveBalanceAdjustment = () => {
    const amt = Number(balanceForm.amount);
    if (!amt || amt <= 0) return;
    setClients(prev => prev.map(c => {
      if (c.id !== balanceForm.clientId) return c;
      const balBefore = c.balance || 0;
      let newBalance = balBefore;
      if (balanceForm.type === "payment" || balanceForm.type === "credit") newBalance += amt;
      else newBalance -= amt;
      newBalance = Math.round(newBalance * 100) / 100;
      const typeLabels = { payment: "Pago de deuda", credit: "Crédito agregado", debit: "Deuda agregada", settle_credit: "Crédito liquidado" };
      const history = [...(c.balanceHistory || []), {
        id: uid(), type: balanceForm.type, amount: amt,
        method: balanceForm.method || "", mpAccount: balanceForm.mpAccount || "",
        notes: balanceForm.notes || (typeLabels[balanceForm.type] || "Ajuste"), date: new Date().toISOString(),
        balanceBefore: balBefore, balanceAfter: newBalance,
      }];
      return { ...c, balance: newBalance, balanceHistory: history };
    }));
    setBalanceModal(false);
  };

  // ---- render ----
  return (
    <div style={{ fontFamily: T.font }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.02em", fontFamily: T.fontDisplay }}>
            Clientes
          </h1>
          <p style={{ fontSize: 14, color: T.textMuted, margin: "6px 0 0" }}>
            {globalStats.total} registrados · {globalStats.activeThisMonth} activos este mes
          </p>
        </div>
        <Btn onClick={openNew} style={{ background: T.primary, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600, boxShadow: T.shadowSm }}>
          + Nuevo cliente
        </Btn>
      </div>

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(160px, 1fr))", gap: isMobile ? 8 : 14, marginBottom: 24 }}>
        <MetricCard label="Total clientes" value={globalStats.total} sub="en la base" accent={T.primary} />
        <MetricCard label="Activos este mes" value={globalStats.activeThisMonth} sub="con compras" accent={T.green} />
        <MetricCard label="Facturado total" value={formatMoney(globalStats.totalRevenue)} sub="histórico" accent={T.amber} />
        <MetricCard label="Top cliente del mes" value={globalStats.topMonthClient.name} sub={globalStats.topMonthClient.spent > 0 ? formatMoney(globalStats.topMonthClient.spent) : "—"} accent={T.pink} isText />
        <MetricCard label="Nuevo más reciente" value={globalStats.newest?.name || "—"} sub={globalStats.newest?.createdAt ? formatDate(globalStats.newest.createdAt) : ""} accent={T.blue} isText />
        <MetricCard label="Gasto promedio" value={formatMoney(Math.round(globalStats.avgSpend))} sub="por cliente" accent={T.purple} />
        <ZoneMapCard zones={globalStats.topZones} onSelect={(z) => setZoneFilter(zoneFilter === z ? "" : z)} selected={zoneFilter} />
      </div>

      {/* Search + Filters */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusLg, padding: isMobile ? 12 : 16,
        marginBottom: 18, boxShadow: T.shadowXs,
      }}>
        <div style={{ position: "relative", marginBottom: 12 }}>
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: T.textMuted, pointerEvents: "none" }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono, Instagram o zona..."
            style={{
              width: "100%", padding: "12px 14px 12px 40px", background: T.surface2,
              border: `1px solid ${T.borderSoft}`, borderRadius: 10, color: T.text,
              fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              transition: "border-color .15s",
            }}
            onFocus={e => e.currentTarget.style.borderColor = T.primary}
            onBlur={e => e.currentTarget.style.borderColor = T.borderSoft}
          />
        </div>
        {/* Filter pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", overflowX: isMobile ? "auto" : "visible", paddingBottom: isMobile ? 4 : 0 }}>
          <Pill active={filter === "name"} onClick={() => setFilter("name")}>A – Z</Pill>
          <Pill active={filter === "spent"} onClick={() => setFilter("spent")} color={T.amber}>Mayor gasto</Pill>
          <Pill active={filter === "recent"} onClick={() => setFilter("recent")} color={T.blue}>Recientes</Pill>
          <Pill active={filter === "debt"} onClick={() => setFilter("debt")} color={T.red}>Con deuda</Pill>
          <Pill active={filter === "credit"} onClick={() => setFilter("credit")} color={T.green}>Saldo a favor</Pill>
          {availableMonths.length > 0 && (
            <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={{
              padding: "7px 14px", borderRadius: 999, border: `1px solid ${monthFilter ? T.primary : T.border}`,
              background: monthFilter ? `${T.primary}15` : T.card, color: monthFilter ? T.primary : T.textSub,
              fontSize: 13, fontFamily: "inherit", cursor: "pointer", outline: "none",
            }}>
              <option value="">Filtrar por mes…</option>
              {availableMonths.map(k => <option key={k} value={k}>{new Date(k + "-02").toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</option>)}
            </select>
          )}
          {knownZones.length > 0 && (
            <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)} style={{
              padding: "7px 14px", borderRadius: 999, border: `1px solid ${zoneFilter ? T.primary : T.border}`,
              background: zoneFilter ? `${T.primary}15` : T.card, color: zoneFilter ? T.primary : T.textSub,
              fontSize: 13, fontFamily: "inherit", cursor: "pointer", outline: "none",
            }}>
              <option value="">Todas las zonas</option>
              {knownZones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          )}
          {(zoneFilter || monthFilter || filter !== "name") && (
            <button onClick={() => { setFilter("name"); setZoneFilter(""); setMonthFilter(""); }} style={{
              padding: "7px 14px", borderRadius: 999, border: "none", background: "transparent",
              color: T.textMuted, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            }}>✕ Limpiar filtros</button>
          )}
        </div>
      </div>

      {/* Results count */}
      <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 14px 2px" }}>
        {filtered.length === clients.length ? `${filtered.length} clientes` : `${filtered.length} de ${clients.length} clientes`}
      </p>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <Card style={{ textAlign: "center", padding: isMobile ? "32px 16px" : 60 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
          <p style={{ color: T.textMuted, fontSize: 14, margin: 0 }}>
            {clients.length === 0 ? "Todavía no hay clientes registrados" : "No hay clientes con esos filtros"}
          </p>
        </Card>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))",
          gap: isMobile ? 12 : 16,
        }}>
          {filtered.map(c => (
            <ClientCard
              key={c.id}
              client={c}
              stats={clientStats[c.id]}
              productsById={productsById}
              onEdit={() => openEdit(c)}
              onHistory={() => setHistoryClient(c.id)}
              onBalance={() => openBalanceAdjust(c)}
              onDelete={() => handleDelete(c)}
              confirmDelete={confirmDel === c.id}
            />
          ))}
        </div>
      )}

      {/* History Modal */}
      {historyClient && (
        <HistoryModal
          client={clients.find(c => c.id === historyClient)}
          stats={clientStats[historyClient]}
          productsById={productsById}
          onClose={() => setHistoryClient(null)}
        />
      )}

      {/* New / Edit Modal */}
      {modal && (
        <Modal title={editing ? "Editar cliente" : "Nuevo cliente"} onClose={() => setModal(false)} open={true}>
          <ClientForm
            form={form} setForm={setForm}
            phoneError={phoneError} setPhoneError={setPhoneError}
            knownZones={knownZones}
            editing={editing}
            onSave={save}
            onCancel={() => setModal(false)}
          />
        </Modal>
      )}

      {/* Balance adjustment Modal */}
      {balanceModal && (
        <Modal title={`Ajustar saldo · ${balanceForm.clientName}`} onClose={() => setBalanceModal(false)} open={true}>
          <BalanceForm
            balanceForm={balanceForm} setBalanceForm={setBalanceForm}
            onSave={saveBalanceAdjustment}
          />
        </Modal>
      )}
    </div>
  );
};

// ============================================
// ClientCard — una tarjeta por cliente
// ============================================
const ClientCard = ({ client: c, stats, productsById, onEdit, onHistory, onBalance, onDelete, confirmDelete }) => {
  const [hover, setHover] = useState(false);
  const st = stats || {};
  const bal = c.balance || 0;
  const hasBalance = bal !== 0;
  const lastItems = st.lastPurchase?.items || [];
  const lastName = lastItems[0] ? resolveItemName(lastItems[0], productsById) : "";
  const lastShort = lastName.length > 34 ? lastName.slice(0, 32) + "…" : lastName;

  return (
    <div
      onClick={onHistory}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: T.card, borderRadius: T.radiusLg,
        border: `1px solid ${hover ? T.border : T.borderSoft}`,
        padding: 18, cursor: "pointer",
        boxShadow: hover ? T.shadow : T.shadowXs,
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        transition: "all .18s ease",
        display: "flex", flexDirection: "column", gap: 14,
        animation: "fadeIn 0.25s ease",
      }}
    >
      {/* Top: avatar + name + zona + balance badge */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Avatar name={c.name} id={c.id} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.text, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.name || "Sin nombre"}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
            {c.zona && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 11, color: T.textSub, background: T.surface2, padding: "3px 8px", borderRadius: 999,
                border: `1px solid ${T.borderSoft}`, fontWeight: 500,
              }}>📍 {c.zona}</span>
            )}
            {!c.zona && !c.phone && !c.instagram && (
              <span style={{ fontSize: 11, color: T.textFaint }}>Sin datos de contacto</span>
            )}
          </div>
        </div>
        {hasBalance && (
          <div style={{
            padding: "6px 10px", borderRadius: 8,
            background: bal > 0 ? T.greenBg : T.redBg,
            border: `1px solid ${bal > 0 ? T.greenBorder : T.redBorder}`,
            textAlign: "right", flexShrink: 0,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: bal > 0 ? T.green : T.red, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {bal > 0 ? "Saldo +" : "Debe"}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: bal > 0 ? T.green : T.red, fontFamily: T.fontDisplay }}>
              {formatMoney(Math.abs(bal))}
            </div>
          </div>
        )}
      </div>

      {/* Contact chips */}
      {(c.phone || c.instagram) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
          {c.phone && (
            <ContactChip icon="📞" label={c.phone} href={`tel:${digitsOnly(c.phone)}`} />
          )}
          {c.phone && (
            <ContactChip icon="💬" label="WhatsApp" href={`https://wa.me/${waNumber(c.phone)}`} color={T.green} />
          )}
          {c.instagram && (
            <ContactChip icon="📷" label={`@${cleanIG(c.instagram)}`} href={`https://instagram.com/${cleanIG(c.instagram)}`} color={T.pink} />
          )}
        </div>
      )}

      {/* Spending stats row */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        background: T.surface2, borderRadius: 10, padding: "12px 14px",
        border: `1px solid ${T.borderSoft}`,
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Total gastado</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.green, fontFamily: T.fontDisplay, lineHeight: 1.1, marginTop: 2 }}>
            {formatMoney(st.totalSpent || 0)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Compras</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, lineHeight: 1.1, marginTop: 2 }}>
            {st.salesCount || 0}
            {st.avgDays && <span style={{ fontSize: 11, fontWeight: 500, color: T.textMuted, marginLeft: 6 }}>· cada {st.avgDays}d</span>}
          </div>
        </div>
      </div>

      {/* Last purchase */}
      {st.lastPurchase && (
        <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.5 }}>
          <span style={{ color: T.textMuted }}>Última compra</span> {formatDate(st.lastPurchase.date)}
          {lastShort && <div style={{ color: T.textMuted, fontSize: 11 }}>{lastShort}{(st.lastPurchase.items || []).length > 1 ? ` + ${st.lastPurchase.items.length - 1} más` : ""}</div>}
        </div>
      )}

      {/* Favorite products */}
      {st.favProducts && st.favProducts.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {st.favProducts.slice(0, 3).map((fav, i) => {
            const { bg, fg } = pickAvatarColor(fav.name);
            const short = fav.name.length > 22 ? fav.name.slice(0, 20) + "…" : fav.name;
            return (
              <span key={i} style={{
                fontSize: 11, padding: "3px 8px", borderRadius: 999,
                background: bg, color: fg, fontWeight: 600,
              }}>{short} ×{fav.qty}</span>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, marginTop: "auto", paddingTop: 4, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
        <ActionBtn onClick={onHistory} color={T.primary}>Ver historial</ActionBtn>
        <ActionBtn onClick={onBalance} color={bal < 0 ? T.red : bal > 0 ? T.green : T.textSub}>
          {bal < 0 ? "Cobrar" : bal > 0 ? "Liquidar" : "Saldo"}
        </ActionBtn>
        {c.phone && (
          <ActionBtn href={`https://wa.me/${waNumber(c.phone)}`} color={T.green}>WhatsApp</ActionBtn>
        )}
        <ActionBtn onClick={onEdit} color={T.textSub}>Editar</ActionBtn>
        <ActionBtn onClick={onDelete} color={T.red} ghost>
          {confirmDelete ? "¿Seguro?" : "Eliminar"}
        </ActionBtn>
      </div>
    </div>
  );
};

const ActionBtn = ({ children, onClick, href, color = T.textSub, ghost = false }) => {
  const [hover, setHover] = useState(false);
  const Tag = href ? "a" : "button";
  return (
    <Tag
      onClick={onClick}
      href={href}
      target={href ? "_blank" : undefined}
      rel={href ? "noreferrer" : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "6px 12px", borderRadius: 8,
        border: `1px solid ${hover ? color : T.borderSoft}`,
        background: hover ? `${color}12` : (ghost ? "transparent" : T.card),
        color: hover ? color : T.textSub,
        fontSize: 12, fontWeight: 600, cursor: "pointer",
        textDecoration: "none", fontFamily: "inherit",
        transition: "all .15s",
      }}
    >{children}</Tag>
  );
};

// ============================================
// MetricCard — small KPI card
// ============================================
const MetricCard = ({ label, value, sub, accent = T.primary, isText = false }) => (
  <div style={{
    background: T.card, borderRadius: T.radiusLg, padding: 16,
    border: `1px solid ${T.borderSoft}`, boxShadow: T.shadowXs,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
      <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
    </div>
    <div style={{
      fontSize: isText ? 18 : 22, fontWeight: 800, color: T.text,
      fontFamily: T.fontDisplay, lineHeight: 1.1, letterSpacing: "-0.01em",
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>{sub}</div>}
  </div>
);

// ============================================
// ZoneMapCard — metric card with zone breakdown
// ============================================
const ZoneMapCard = ({ zones, onSelect, selected }) => {
  const total = zones.reduce((s, [, n]) => s + n, 0);
  return (
    <div style={{
      background: T.card, borderRadius: T.radiusLg, padding: 16,
      border: `1px solid ${T.borderSoft}`, boxShadow: T.shadowXs,
      gridColumn: "span 2",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.blue }} />
        <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Clientes por zona
        </div>
      </div>
      {zones.length === 0 ? (
        <div style={{ fontSize: 13, color: T.textMuted, padding: "8px 0" }}>
          Agregá la zona al editar un cliente para ver el mapa
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {zones.slice(0, 10).map(([zone, count]) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const active = selected === zone;
            return (
              <button key={zone} onClick={() => onSelect(zone)} style={{
                padding: "6px 10px", borderRadius: 999, cursor: "pointer",
                border: `1px solid ${active ? T.primary : T.borderSoft}`,
                background: active ? `${T.primary}15` : T.surface2,
                fontSize: 12, fontWeight: 500, color: active ? T.primary : T.textSub,
                display: "inline-flex", alignItems: "center", gap: 6,
                fontFamily: "inherit",
              }}>
                <span>📍 {zone}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: active ? T.primary : T.textMuted, background: active ? T.card : T.card, padding: "1px 6px", borderRadius: 8 }}>{count}</span>
                <span style={{ fontSize: 10, color: T.textFaint }}>{pct}%</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================
// ClientForm — new/edit client form
// ============================================
const ClientForm = ({ form, setForm, phoneError, setPhoneError, knownZones, editing, onSave, onCancel }) => {
  const phoneOk = !form.phone || isValidPhone(form.phone);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "block" }}>
          Nombre *
        </label>
        <input autoFocus value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="Ej: Juan Pérez"
          style={fieldStyle()} />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Teléfono</label>
          <input value={form.phone}
            onChange={e => { setForm(f => ({ ...f, phone: e.target.value })); if (phoneError) setPhoneError(""); }}
            onBlur={() => { if (form.phone && !isValidPhone(form.phone)) setPhoneError("Al menos 10 dígitos"); }}
            placeholder="11 2345 6789"
            style={fieldStyle(phoneError || !phoneOk)} />
          {phoneError && <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>{phoneError}</div>}
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Instagram</label>
          <input value={form.instagram}
            onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))}
            placeholder="@usuario"
            style={fieldStyle()} />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Zona / Localidad</label>
        <input value={form.zona}
          onChange={e => setForm(f => ({ ...f, zona: e.target.value }))}
          placeholder="Ej: San Isidro, Martínez, Vicente López…"
          list="zone-suggestions"
          style={fieldStyle()} />
        <datalist id="zone-suggestions">
          {knownZones.map(z => <option key={z} value={z} />)}
        </datalist>
        {knownZones.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
            {knownZones.slice(0, 8).map(z => (
              <button key={z} type="button"
                onClick={() => setForm(f => ({ ...f, zona: z }))}
                style={{
                  padding: "4px 10px", borderRadius: 999, border: `1px solid ${form.zona === z ? T.primary : T.borderSoft}`,
                  background: form.zona === z ? `${T.primary}15` : T.card,
                  color: form.zona === z ? T.primary : T.textSub,
                  fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                }}>📍 {z}</button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label style={labelStyle}>Notas</label>
        <textarea value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          placeholder="Opcional — preferencias, recordatorios, etc."
          rows={3}
          style={{ ...fieldStyle(), resize: "vertical", minHeight: 64 }} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 6, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{
          padding: "10px 18px", borderRadius: 10, border: `1px solid ${T.border}`,
          background: T.card, color: T.textSub, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>Cancelar</button>
        <button onClick={onSave} disabled={!form.name.trim() || !!phoneError}
          style={{
            padding: "10px 20px", borderRadius: 10, border: "none",
            background: (!form.name.trim() || phoneError) ? T.borderSoft : T.primary,
            color: (!form.name.trim() || phoneError) ? T.textFaint : "#fff",
            fontSize: 14, fontWeight: 700,
            cursor: (!form.name.trim() || phoneError) ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}>
          {editing ? "Guardar cambios" : "Agregar cliente"}
        </button>
      </div>
    </div>
  );
};

const labelStyle = {
  fontSize: 11, fontWeight: 600, color: T.textMuted,
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "block",
};

const fieldStyle = (error) => ({
  width: "100%", padding: "11px 14px",
  background: T.surface2, border: `1px solid ${error ? T.red : T.borderSoft}`,
  borderRadius: 10, color: T.text, fontSize: 14, outline: "none",
  boxSizing: "border-box", fontFamily: "inherit", transition: "border-color .15s",
});

// ============================================
// HistoryModal — full client purchase history
// ============================================
const HistoryModal = ({ client, stats, productsById, onClose }) => {
  const { isMobile } = useResponsive();
  if (!client || !stats) return null;

  // Build last 6 months sparkline data
  const now = new Date();
  const sparkData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    sparkData.push({ key: k, value: stats.byMonth[k] || 0 });
  }
  const peak = Math.max(...sparkData.map(d => d.value));

  const sortedSales = [...stats.sales].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <Modal title={`Historial — ${client.name}`} onClose={onClose} open={true}>
      {/* Header with avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${T.borderSoft}` }}>
        <Avatar name={client.name} id={client.id} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{client.name}</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {client.zona && <span>📍 {client.zona}</span>}
            {client.phone && <span>📞 {client.phone}</span>}
            {client.instagram && <span>📷 @{cleanIG(client.instagram)}</span>}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
        <SummaryStat label="Gastado" value={formatMoney(stats.totalSpent)} color={T.green} />
        <SummaryStat label="Compras" value={stats.salesCount} />
        <SummaryStat label="Unidades" value={stats.totalUnits} />
        <SummaryStat label="Frecuencia" value={stats.avgDays ? `${stats.avgDays}d` : "—"} sub={stats.avgDays ? "entre compras" : ""} />
      </div>

      {/* Monthly sparkline */}
      {peak > 0 && (
        <div style={{ background: T.surface2, borderRadius: 12, padding: 14, marginBottom: 18, border: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Evolución últimos 6 meses
          </div>
          <Sparkline data={sparkData} width={isMobile ? 280 : 440} height={70} color={T.primary} />
        </div>
      )}

      {/* Favorite products */}
      {stats.favProducts.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Productos favoritos
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {stats.favProducts.map((fav, i) => {
              const { bg, fg } = pickAvatarColor(fav.name);
              return (
                <div key={i} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 999,
                  background: bg, color: fg, fontSize: 13, fontWeight: 600,
                }}>
                  <span>{["🥇", "🥈", "🥉"][i]}</span> {fav.name} · ×{fav.qty}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sales list */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
          Compras ({sortedSales.length})
        </div>
        {sortedSales.length === 0 ? (
          <p style={{ fontSize: 14, color: T.textMuted, padding: "20px 0", textAlign: "center" }}>
            Este cliente no tiene compras registradas.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sortedSales.map(s => (
              <div key={s.id} style={{
                background: T.card, border: `1px solid ${T.borderSoft}`, borderRadius: 10,
                padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 500 }}>{formatDate(s.date)}</div>
                  <div style={{ fontSize: 13, color: T.text, marginTop: 3, lineHeight: 1.45 }}>
                    {(s.items || []).map(i => `${i.qty || 1}× ${resolveItemName(i, productsById)}`).join(" · ") || "—"}
                  </div>
                  {(s.paymentMethod || (s.payments || [])[0]?.method) && (
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>
                      {s.paymentMethod || (s.payments || []).map(p => p.method).filter(Boolean).join(" + ")}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.green, fontFamily: T.fontDisplay }}>
                    {formatMoney(s.total || 0, s.currency || "ARS")}
                  </div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                    {(s.items || []).reduce((a, i) => a + (i.qty || 1), 0)} u.
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Balance history */}
      {(client.balanceHistory || []).length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            Movimientos de saldo
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...(client.balanceHistory || [])].reverse().slice(0, 12).map(h => {
              const typeLabels = { payment: "Pago de deuda", credit: "Crédito agregado", debit: "Deuda agregada", settle_credit: "Crédito liquidado", sale_credit_used: "Crédito usado", sale_debt: "Deuda por venta", sale_credit_given: "Vuelto como crédito", adjustment: "Ajuste" };
              const positive = h.type === "payment" || h.type === "credit" || h.type === "sale_credit_given";
              return (
                <div key={h.id} style={{
                  background: T.surface2, border: `1px solid ${T.borderSoft}`, borderLeft: `3px solid ${positive ? T.green : T.red}`,
                  borderRadius: 8, padding: "8px 12px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
                      {typeLabels[h.type] || h.type}
                    </div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>{formatDate(h.date)}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: positive ? T.green : T.red, fontFamily: T.fontDisplay }}>
                    {positive ? "+" : "−"}{formatMoney(h.amount)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {client.notes && (
        <div style={{ marginTop: 18, padding: "10px 14px", background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 10, fontSize: 13, color: T.text }}>
          <strong style={{ color: T.amber }}>Notas:</strong> {client.notes}
        </div>
      )}
    </Modal>
  );
};

const SummaryStat = ({ label, value, sub, color = T.text }) => (
  <div style={{
    background: T.surface2, border: `1px solid ${T.borderSoft}`, borderRadius: 10,
    padding: "12px 14px",
  }}>
    <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: T.fontDisplay, marginTop: 3, letterSpacing: "-0.01em" }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{sub}</div>}
  </div>
);

// ============================================
// BalanceForm — saldo adjustment (preserves legacy behavior)
// ============================================
const BalanceForm = ({ balanceForm, setBalanceForm, onSave }) => {
  const amt = Number(balanceForm.amount) || 0;
  const preview = (() => {
    let nb = balanceForm.currentBalance;
    if (balanceForm.type === "payment" || balanceForm.type === "credit") nb += amt;
    else nb -= amt;
    return Math.round(nb * 100) / 100;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Current balance display */}
      <div style={{
        textAlign: "center", padding: 16, borderRadius: 12,
        background: balanceForm.currentBalance > 0 ? T.greenBg : balanceForm.currentBalance < 0 ? T.redBg : T.surface2,
        border: `1px solid ${balanceForm.currentBalance > 0 ? T.greenBorder : balanceForm.currentBalance < 0 ? T.redBorder : T.borderSoft}`,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Saldo actual</div>
        <div style={{
          fontSize: 30, fontWeight: 800, fontFamily: T.fontDisplay, marginTop: 4, letterSpacing: "-0.01em",
          color: balanceForm.currentBalance > 0 ? T.green : balanceForm.currentBalance < 0 ? T.red : T.text,
        }}>
          {balanceForm.currentBalance > 0 ? "+" : ""}{formatMoney(balanceForm.currentBalance)}
        </div>
        <div style={{ fontSize: 12, color: T.textSub, marginTop: 3 }}>
          {balanceForm.currentBalance > 0 ? "Le debemos al cliente" : balanceForm.currentBalance < 0 ? "El cliente nos debe" : "Sin saldo pendiente"}
        </div>
      </div>

      {balanceForm.currentBalance !== 0 && (
        <button onClick={() => {
          const abs = Math.abs(balanceForm.currentBalance);
          const type = balanceForm.currentBalance < 0 ? "payment" : "settle_credit";
          setBalanceForm(f => ({ ...f, type, amount: String(abs), notes: balanceForm.currentBalance < 0 ? "Deuda saldada" : "Crédito liquidado" }));
        }} style={{
          width: "100%", padding: "11px", borderRadius: 10, cursor: "pointer",
          border: `1px solid ${T.green}`, background: T.greenBg, color: T.green,
          fontWeight: 700, fontSize: 14, fontFamily: "inherit",
        }}>
          Saldar todo · {formatMoney(Math.abs(balanceForm.currentBalance))}
        </button>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {[
          { key: "payment", label: "Cliente pagó", color: T.green, icon: "💰" },
          { key: "settle_credit", label: "Le pagamos", color: T.blue, icon: "💸" },
          { key: "credit", label: "Dar crédito", color: T.primary, icon: "🏦" },
          { key: "debit", label: "Cargar deuda", color: T.red, icon: "📝" },
        ].map(opt => (
          <button key={opt.key} onClick={() => setBalanceForm(f => ({ ...f, type: opt.key }))}
            style={{
              padding: "10px 8px", borderRadius: 10, cursor: "pointer",
              border: `1px solid ${balanceForm.type === opt.key ? opt.color : T.borderSoft}`,
              background: balanceForm.type === opt.key ? `${opt.color}15` : T.card,
              color: balanceForm.type === opt.key ? opt.color : T.textSub,
              fontWeight: 600, fontSize: 12, textAlign: "center", fontFamily: "inherit",
            }}>
            <div style={{ fontSize: 16, marginBottom: 2 }}>{opt.icon}</div>
            {opt.label}
          </button>
        ))}
      </div>

      <div>
        <label style={labelStyle}>Monto</label>
        <input type="number" value={balanceForm.amount}
          onChange={e => setBalanceForm(f => ({ ...f, amount: e.target.value }))}
          placeholder={balanceForm.currentBalance !== 0 ? String(Math.abs(balanceForm.currentBalance)) : "0"}
          style={fieldStyle()} />
      </div>

      {(balanceForm.type === "payment" || balanceForm.type === "settle_credit") && (
        <>
          <div>
            <label style={labelStyle}>{balanceForm.type === "payment" ? "¿Cómo pagó?" : "¿Cómo le pagamos?"}</label>
            <select value={balanceForm.method} onChange={e => setBalanceForm(f => ({ ...f, method: e.target.value }))} style={fieldStyle()}>
              <option value="">Seleccionar…</option>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {balanceForm.method === "Mercado Pago" && (
            <div>
              <label style={labelStyle}>Cuenta MP</label>
              <select value={balanceForm.mpAccount} onChange={e => setBalanceForm(f => ({ ...f, mpAccount: e.target.value }))} style={fieldStyle()}>
                <option value="">Seleccionar…</option>
                {MP_ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
        </>
      )}

      <div>
        <label style={labelStyle}>Notas (opcional)</label>
        <input value={balanceForm.notes}
          onChange={e => setBalanceForm(f => ({ ...f, notes: e.target.value }))}
          placeholder="Referencia, motivo, recordatorio…"
          style={fieldStyle()} />
      </div>

      {amt > 0 && (
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: T.surface2, border: `1px solid ${T.borderSoft}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Saldo después</span>
          <span style={{
            fontSize: 20, fontWeight: 800, fontFamily: T.fontDisplay,
            color: preview > 0 ? T.green : preview < 0 ? T.red : T.text,
          }}>
            {preview === 0 ? "✓ Saldado" : formatMoney(preview)}
          </span>
        </div>
      )}

      <button onClick={onSave} disabled={amt <= 0} style={{
        padding: "12px", borderRadius: 10, border: "none",
        background: amt <= 0 ? T.borderSoft : T.primary,
        color: amt <= 0 ? T.textFaint : "#fff",
        fontSize: 14, fontWeight: 700, cursor: amt <= 0 ? "not-allowed" : "pointer",
        marginTop: 4, fontFamily: "inherit",
      }}>
        Confirmar ajuste
      </button>
    </div>
  );
};
