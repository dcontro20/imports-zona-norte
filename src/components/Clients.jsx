import { useState, useMemo } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { Modal, Card, Btn, Input, Select, Table, Badge, StatCard, SearchBar } from "./UI.jsx";
import { PAYMENT_METHODS, MP_ACCOUNTS } from "../constants.js";

// -- CLIENTES --
export const Clients = ({ clients, setClients, sales, products }) => {
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", instagram: "", notes: "" });
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null); // client detail panel
  const [sortBy, setSortBy] = useState("name"); // name | spent | recent
  const [balanceModal, setBalanceModal] = useState(false);
  const [balanceForm, setBalanceForm] = useState({ clientId: "", clientName: "", currentBalance: 0, type: "payment", amount: "", method: "", mpAccount: "", notes: "" });

  // Compute client stats from sales
  const clientStats = useMemo(() => {
    const map = {};
    clients.forEach(c => {
      const cs = sales.filter(s => s.clientId === c.id);
      const totalSpent = cs.reduce((sum, s) => sum + (s.total || 0), 0);
      const totalUnits = cs.reduce((sum, s) => sum + (s.items || []).reduce((a, i) => a + (i.qty || 1), 0), 0);
      const lastPurchase = cs.length > 0 ? cs.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date : null;
      const prodFreq = {};
      cs.forEach(s => {
        (s.items || []).forEach(item => {
          const name = item.name || item.productName || "?";
          prodFreq[name] = (prodFreq[name] || 0) + (item.qty || 1);
        });
      });
      const favProducts = Object.entries(prodFreq).sort((a, b) => b[1] - a[1]).slice(0, 3);
      map[c.id] = { salesCount: cs.length, totalSpent, totalUnits, lastPurchase, favProducts, sales: cs };
    });
    return map;
  }, [clients, sales]);
  const globalStats = useMemo(() => {
    const now = new Date();
    const thisMonth = sales.filter(s => {
      const d = new Date(s.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const activeThisMonth = new Set(thisMonth.map(s => s.clientId)).size;
    const totalRevenue = sales.reduce((sum, s) => sum + (s.total || 0), 0);
    const topClient = clients.reduce((best, c) => {
      const st = clientStats[c.id];
      return st && st.totalSpent > (best.spent || 0) ? { name: c.name, spent: st.totalSpent } : best;
    }, { name: "-", spent: 0 });
    return { total: clients.length, activeThisMonth, totalRevenue, topClient: topClient.name };
  }, [clients, sales, clientStats]);

  // Filtered & sorted
  const filtered = useMemo(() => {
    let list = [...clients];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.instagram || "").toLowerCase().includes(q)
      );
    }
    // Sort
    list.sort((a, b) => {
      if (sortBy === "spent") return (clientStats[b.id]?.totalSpent || 0) - (clientStats[a.id]?.totalSpent || 0);
      if (sortBy === "recent") {
        const da = clientStats[a.id]?.lastPurchase ? new Date(clientStats[a.id].lastPurchase) : new Date(0);
        const db = clientStats[b.id]?.lastPurchase ? new Date(clientStats[b.id].lastPurchase) : new Date(0);
        return db - da;
      }
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [clients, search, sortBy, clientStats]);

  const openEdit = (c) => { setForm(c); setEditing(c.id); setModal(true); };
  const openNew = () => { setForm({ name: "", phone: "", instagram: "", notes: "" }); setEditing(null); setModal(true); };

  const save = () => {
    if (!form.name) return;
    if (editing) {
      setClients(prev => prev.map(c => c.id === editing ? { ...c, ...form } : c));
    } else {
      setClients(prev => [...prev, { ...form, id: uid() }]);
    }
    setModal(false);
  };

  const handleDelete = (c) => {
    if (!confirm(`Eliminar cliente "${c.name}"?`)) return;
    setClients(prev => prev.filter(x => x.id !== c.id));
  };

  // Balance adjustment
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
      if (balanceForm.type === "payment") newBalance += amt;
      else if (balanceForm.type === "credit") newBalance += amt;
      else if (balanceForm.type === "debit") newBalance -= amt;
      const history = [...(c.balanceHistory || []), {
        id: uid(), type: balanceForm.type, amount: amt,
        method: balanceForm.method || "", mpAccount: balanceForm.mpAccount || "",
        notes: balanceForm.notes || "", date: new Date().toISOString(),
        balanceBefore: balBefore, balanceAfter: Math.round(newBalance * 100) / 100,
      }];
      return { ...c, balance: Math.round(newBalance * 100) / 100, balanceHistory: history };
    }));
    setBalanceModal(false);
  };

  // Detail panel for client purchase history
  const detailClient = detail ? clients.find(c => c.id === detail) : null;
  const detailStats = detail ? clientStats[detail] : null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e", margin: 0 }}>Clientes</h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>
            Base de clientes con historial de compras
          </p>
        </div>
        <Btn onClick={openNew}>+ Nuevo Cliente</Btn>
      </div>

      {/* Stats Cards */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Total clientes" value={globalStats.total} sub="registrados" color="#6366f1" />
        <StatCard label="Activos este mes" value={globalStats.activeThisMonth} sub="con compras" color="#10b981" />
        <StatCard label="Facturado total" value={formatMoney(globalStats.totalRevenue)} sub="todas las ventas" color="#f59e0b" />
        <StatCard label="Top cliente" value={globalStats.topClient} sub="mayor gasto" color="#ec4899" />
      </div>

      {/* Search & Sort */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <Input
          placeholder="Buscar por nombre, tel, instagram..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: "1 1 200px", minWidth: 180 }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { key: "name", label: "A-Z" },
            { key: "spent", label: "Mayor gasto" },
            { key: "recent", label: "Recientes" },
          ].map(opt => (
            <Btn
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              style={{
                background: sortBy === opt.key ? "#6366f1" : "#f3f4f6",
                color: sortBy === opt.key ? "#fff" : "#6b7280",
                fontSize: 12,
                padding: "6px 12px",
              }}
            >
              {opt.label}
            </Btn>
          ))}
        </div>
      </div>

      {/* Client Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14, marginBottom: 20 }}>
        {filtered.length === 0 ? (
          <Card>
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
              {clients.length === 0 ? "No hay clientes registrados" : "No hay resultados"}
            </div>
          </Card>
        ) : filtered.map(c => {
          const st = clientStats[c.id] || {};
          return (
            <Card key={c.id} style={{ cursor: "pointer", transition: "box-shadow .15s", position: "relative" }}
              onClick={() => setDetail(detail === c.id ? null : c.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%", background: "#6366f1",
                      color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, fontSize: 15, flexShrink: 0,
                    }}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a2e" }}>{c.name}</div>
                      {c.instagram && (
                        <div style={{ fontSize: 12, color: "#6366f1" }}>@{c.instagram.replace("@", "")}</div>
                      )}
                    </div>
                  </div>
                  {c.phone && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Tel: {c.phone}</div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#10b981" }}>
                    {formatMoney(st.totalSpent || 0)}
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>
                    {st.salesCount || 0} compras
                  </div>
                  {(c.balance || 0) !== 0 && (
                    <div style={{
                      marginTop: 6, padding: "6px 10px", borderRadius: 8,
                      background: (c.balance || 0) > 0 ? "#ecfdf5" : "#fef2f2",
                      border: `1px solid ${(c.balance || 0) > 0 ? "#bbf7d0" : "#fecaca"}`,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
                        {(c.balance || 0) > 0 ? "Saldo a favor" : "Deuda"}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: (c.balance || 0) > 0 ? "#10b981" : "#dc2626" }}>
                        {formatMoney(Math.abs(c.balance))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Favorite products */}
              {st.favProducts && st.favProducts.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {st.favProducts.map(([name, qty], i) => (
                    <Badge key={i} color={["#6366f1", "#f59e0b", "#10b981"][i] || "#6366f1"}>
                      {name.length > 18 ? name.substring(0, 16) + "..." : name} x{qty}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Last purchase */}
              {st.lastPurchase && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af" }}>
                  Ultima compra: {formatDate(st.lastPurchase)}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "flex-end", flexWrap: "wrap" }}
                onClick={e => e.stopPropagation()}>
                {(c.balance || 0) !== 0 && (
                  <Btn onClick={() => openBalanceAdjust(c)}
                    style={{ background: (c.balance || 0) < 0 ? "#dc2626" : "#10b981", color: "#fff", fontSize: 11, padding: "4px 10px" }}>
                    {(c.balance || 0) < 0 ? "Registrar pago" : "Ajustar saldo"}
                  </Btn>
                )}
                <Btn onClick={() => openEdit(c)}
                  style={{ background: "#f3f4f6", color: "#6b7280", fontSize: 11, padding: "4px 10px" }}>
                  Editar
                </Btn>
                <Btn onClick={() => handleDelete(c)}
                  style={{ background: "#fef2f2", color: "#dc2626", fontSize: 11, padding: "4px 10px" }}>
                  Eliminar
                </Btn>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Detail Panel - Purchase History */}
      {detailClient && detailStats && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
              Historial de compras - {detailClient.name}
            </h3>
            <Btn onClick={() => setDetail(null)}
              style={{ background: "#f3f4f6", color: "#6b7280", fontSize: 11, padding: "4px 10px" }}>
              Cerrar
            </Btn>
          </div>

          {/* Summary row */}
          <div style={{ display: "flex", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: "#6b7280" }}>Total gastado: </span>
              <span style={{ fontWeight: 700, color: "#10b981" }}>{formatMoney(detailStats.totalSpent)}</span>
            </div>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: "#6b7280" }}>Compras: </span>
              <span style={{ fontWeight: 700 }}>{detailStats.salesCount}</span>
            </div>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: "#6b7280" }}>Unidades: </span>
              <span style={{ fontWeight: 700 }}>{detailStats.totalUnits}</span>
            </div>
            {(detailClient.balance || 0) !== 0 && (
              <div style={{ fontSize: 13 }}>
                <span style={{ color: "#6b7280" }}>{(detailClient.balance || 0) > 0 ? "Saldo a favor: " : "Deuda: "}</span>
                <span style={{ fontWeight: 700, color: (detailClient.balance || 0) > 0 ? "#00b894" : "#e74c3c" }}>
                  {(detailClient.balance || 0) > 0 ? `+${formatMoney(detailClient.balance)}` : formatMoney(detailClient.balance)}
                </span>
              </div>
            )}
          </div>

          {/* Purchase history table */}
          {detailStats.sales.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20, color: "#9ca3af", fontSize: 13 }}>
              Este cliente no tiene compras registradas
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e4e9" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left", color: "#6b7280", fontWeight: 600 }}>Fecha</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", color: "#6b7280", fontWeight: 600 }}>Productos</th>
                    <th style={{ padding: "8px 12px", textAlign: "right", color: "#6b7280", fontWeight: 600 }}>Total</th>
                    <th style={{ padding: "8px 12px", textAlign: "center", color: "#6b7280", fontWeight: 600 }}>Items</th>
                  </tr>
                </thead>
                <tbody>
                  {detailStats.sales
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map(s => (
                      <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "8px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>
                          {formatDate(s.date)}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#1a1a2e" }}>
                          {(s.items || []).map(i => i.name || i.productName || "?").join(", ").substring(0, 50)}
                          {(s.items || []).map(i => i.name || i.productName || "?").join(", ").length > 50 ? "..." : ""}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#10b981" }}>
                          {formatMoney(s.total || 0)}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          {(s.items || []).reduce((a, i) => a + (i.qty || 1), 0)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Favorite products section */}
          {detailStats.favProducts.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>
                Productos favoritos
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {detailStats.favProducts.map(([name, qty], i) => (
                  <div key={i} style={{
                    padding: "6px 12px", borderRadius: 8,
                    background: ["#eef2ff", "#fff7ed", "#ecfdf5"][i] || "#f3f4f6",
                    fontSize: 13, fontWeight: 600,
                    color: ["#6366f1", "#f59e0b", "#10b981"][i] || "#6b7280",
                  }}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"} {name} ({qty} un.)
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Balance History */}
          {(detailClient.balanceHistory || []).length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e", marginBottom: 10 }}>Historial de saldo</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...(detailClient.balanceHistory || [])].reverse().slice(0, 20).map(h => {
                  const typeLabels = { payment: "Pago de deuda", credit: "Crédito agregado", debit: "Deuda agregada", sale_credit_used: "Crédito usado en venta", sale_debt: "Deuda por venta", sale_credit_given: "Vuelto como crédito", adjustment: "Ajuste manual" };
                  const isPositive = h.type === "payment" || h.type === "credit" || h.type === "sale_credit_given";
                  return (
                    <div key={h.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 12px", background: "#f9fafb", borderRadius: 8,
                      borderLeft: `3px solid ${isPositive ? "#10b981" : "#dc2626"}`,
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>
                          {typeLabels[h.type] || h.type}
                          {h.method ? ` (${h.method}${h.mpAccount ? ` - ${h.mpAccount}` : ""})` : ""}
                        </div>
                        {h.notes && <div style={{ fontSize: 11, color: "#9ca3af" }}>{h.notes}</div>}
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>{formatDate(h.date)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: isPositive ? "#10b981" : "#dc2626" }}>
                          {isPositive ? "+" : "-"}{formatMoney(h.amount)}
                        </div>
                        <div style={{ fontSize: 10, color: "#9ca3af" }}>Saldo: {formatMoney(h.balanceAfter)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {detailClient.notes && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "#f9fafb", borderRadius: 8, fontSize: 12, color: "#6b7280" }}>
              Notas: {detailClient.notes}
            </div>
          )}
        </Card>
      )}

      {/* Modal nuevo/editar cliente */}
      {modal && (
        <Modal title={editing ? "Editar Cliente" : "Nuevo Cliente"} onClose={() => setModal(false)} open={true}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label="Nombre *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre del cliente" />
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}><Input label="Teléfono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="11 1234 5678" /></div>
              <div style={{ flex: 1 }}><Input label="Instagram" value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="@usuario" /></div>
            </div>
            <Input label="Notas" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opcional..." />
            {editing && (form.balance || 0) !== 0 && (
              <div style={{ padding: "8px 12px", borderRadius: 8, background: (form.balance || 0) > 0 ? "#ecfdf5" : "#fef2f2", fontSize: 13 }}>
                <span style={{ color: "#6b7280" }}>Saldo actual: </span>
                <span style={{ fontWeight: 700, color: (form.balance || 0) > 0 ? "#10b981" : "#dc2626" }}>{formatMoney(form.balance || 0)}</span>
                <span style={{ color: "#9ca3af", fontSize: 11 }}> (usá "Registrar pago" o "Ajustar saldo" para modificar)</span>
              </div>
            )}
            <Btn onClick={save} disabled={!form.name}>{editing ? "Guardar Cambios" : "Agregar Cliente"}</Btn>
          </div>
        </Modal>
      )}

      {/* Modal ajuste de balance */}
      {balanceModal && (
        <Modal title={`Ajustar saldo — ${balanceForm.clientName}`} onClose={() => setBalanceModal(false)} open={true}>
          {/* Current balance display */}
          <div style={{ textAlign: "center", marginBottom: 16, padding: "12px", background: "#f9fafb", borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 }}>Saldo actual</div>
            <div style={{
              fontSize: 28, fontWeight: 800,
              color: balanceForm.currentBalance > 0 ? "#10b981" : balanceForm.currentBalance < 0 ? "#dc2626" : "#6b7280",
            }}>
              {balanceForm.currentBalance > 0 ? "+" : ""}{formatMoney(balanceForm.currentBalance)}
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>
              {balanceForm.currentBalance > 0 ? "Le debemos al cliente" : balanceForm.currentBalance < 0 ? "El cliente nos debe" : "Sin saldo"}
            </div>
          </div>

          {/* Type selector */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[
              { key: "payment", label: "Pago de deuda", color: "#10b981", icon: "💰" },
              { key: "credit", label: "Dar crédito", color: "#6366f1", icon: "🏦" },
              { key: "debit", label: "Agregar deuda", color: "#dc2626", icon: "📝" },
            ].map(opt => (
              <button key={opt.key} onClick={() => setBalanceForm(f => ({ ...f, type: opt.key }))}
                style={{
                  flex: 1, padding: "10px 6px", borderRadius: 10, cursor: "pointer",
                  border: `2px solid ${balanceForm.type === opt.key ? opt.color : "#e2e4e9"}`,
                  background: balanceForm.type === opt.key ? `${opt.color}15` : "#fff",
                  color: balanceForm.type === opt.key ? opt.color : "#6b7280",
                  fontWeight: 700, fontSize: 11, textAlign: "center",
                }}>
                <div style={{ fontSize: 18, marginBottom: 2 }}>{opt.icon}</div>
                {opt.label}
              </button>
            ))}
          </div>

          <Input label="Monto" type="number" value={balanceForm.amount}
            onChange={e => setBalanceForm(f => ({ ...f, amount: e.target.value }))}
            placeholder={balanceForm.currentBalance < 0 ? String(Math.abs(balanceForm.currentBalance)) : "ej: 5000"} />

          {balanceForm.type === "payment" && (
            <>
              <Select label="Medio de pago" options={PAYMENT_METHODS} value={balanceForm.method}
                onChange={e => setBalanceForm(f => ({ ...f, method: e.target.value }))} />
              {balanceForm.method === "Mercado Pago" && (
                <Select label="Cuenta MP" options={MP_ACCOUNTS} value={balanceForm.mpAccount}
                  onChange={e => setBalanceForm(f => ({ ...f, mpAccount: e.target.value }))} />
              )}
            </>
          )}

          <Input label="Notas (opcional)" value={balanceForm.notes}
            onChange={e => setBalanceForm(f => ({ ...f, notes: e.target.value }))}
            placeholder={balanceForm.type === "payment" ? "ej: Pagó deuda en efectivo" : "ej: Acuerdo especial"} />

          {/* Preview */}
          {Number(balanceForm.amount) > 0 && (
            <div style={{ padding: "10px 14px", borderRadius: 10, marginTop: 8, background: "#f9fafb", border: "1px solid #e2e4e9" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#6b7280" }}>Saldo después</span>
                <span style={{ fontWeight: 800, color: (() => {
                  const amt = Number(balanceForm.amount);
                  let nb = balanceForm.currentBalance;
                  if (balanceForm.type === "payment" || balanceForm.type === "credit") nb += amt;
                  else nb -= amt;
                  return nb > 0 ? "#10b981" : nb < 0 ? "#dc2626" : "#6b7280";
                })() }}>
                  {(() => {
                    const amt = Number(balanceForm.amount);
                    let nb = balanceForm.currentBalance;
                    if (balanceForm.type === "payment" || balanceForm.type === "credit") nb += amt;
                    else nb -= amt;
                    return formatMoney(Math.round(nb * 100) / 100);
                  })()}
                </span>
              </div>
            </div>
          )}

          <Btn onClick={saveBalanceAdjustment} disabled={!Number(balanceForm.amount) || Number(balanceForm.amount) <= 0}
            style={{ width: "100%", marginTop: 12 }}>
            Confirmar ajuste
          </Btn>
        </Modal>
      )}
    </div>
  );
};
