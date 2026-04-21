import { useState, useMemo } from "react";
import { uid, formatMoney, formatDate } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Modal, Card, Btn, Input, Select, Table, Badge, StatCard, SearchBar } from "./UI.jsx";
import { PAYMENT_METHODS, MP_ACCOUNTS } from "../constants.js";

// -- CLIENTES --
export const Clients = ({ clients, setClients, sales, products }) => {
  const { isMobile } = useResponsive();
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
      if (balanceForm.type === "payment" || balanceForm.type === "credit") newBalance += amt;
      else newBalance -= amt; // "debit" and "settle_credit" both reduce
      newBalance = Math.round(newBalance * 100) / 100;
      const typeLabels = { payment: "Pago de deuda", credit: "Crédito agregado", debit: "Deuda agregada", settle_credit: "Crédito liquidado (le pagamos)" };
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

  // Detail panel for client purchase history
  const detailClient = detail ? clients.find(c => c.id === detail) : null;
  const detailStats = detail ? clientStats[detail] : null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#37352F", margin: 0 }}>Clientes</h2>
          <p style={{ fontSize: 13, color: "#8C8A82", margin: "4px 0 0" }}>
            Base de clientes con historial de compras
          </p>
        </div>
        <Btn onClick={openNew}>+ Nuevo Cliente</Btn>
      </div>

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 8 : 14, marginBottom: 20 }}>
        <StatCard label="Total clientes" value={globalStats.total} sub="registrados" color="#5E6AD2" />
        <StatCard label="Activos este mes" value={globalStats.activeThisMonth} sub="con compras" color="#0F7B6C" />
        <StatCard label="Facturado total" value={formatMoney(globalStats.totalRevenue)} sub="todas las ventas" color="#CB912F" />
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
                background: sortBy === opt.key ? "#5E6AD2" : "#E8E7E3",
                color: sortBy === opt.key ? "#fff" : "#8C8A82",
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
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: isMobile ? 10 : 14, marginBottom: 20 }}>
        {filtered.length === 0 ? (
          <Card>
            <div style={{ textAlign: "center", padding: 40, color: "#B1AFA7" }}>
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
                      width: 36, height: 36, borderRadius: "50%", background: "#5E6AD2",
                      color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, fontSize: 15, flexShrink: 0,
                    }}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#37352F" }}>{c.name}</div>
                      {c.instagram && (
                        <div style={{ fontSize: 12, color: "#5E6AD2" }}>@{c.instagram.replace("@", "")}</div>
                      )}
                    </div>
                  </div>
                  {c.phone && (
                    <div style={{ fontSize: 12, color: "#8C8A82", marginTop: 4 }}>Tel: {c.phone}</div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#0F7B6C" }}>
                    {formatMoney(st.totalSpent || 0)}
                  </div>
                  <div style={{ fontSize: 11, color: "#B1AFA7" }}>
                    {st.salesCount || 0} compras
                  </div>
                  {(c.balance || 0) !== 0 && (
                    <div style={{
                      marginTop: 6, padding: "6px 10px", borderRadius: 8,
                      background: (c.balance || 0) > 0 ? "#DDEDEA" : "#FBE4E4",
                      border: `1px solid ${(c.balance || 0) > 0 ? "#B6D4CC" : "#F1B8B6"}`,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#8C8A82", textTransform: "uppercase" }}>
                        {(c.balance || 0) > 0 ? "Saldo a favor" : "Deuda"}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: (c.balance || 0) > 0 ? "#0F7B6C" : "#E03E3E" }}>
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
                    <Badge key={i} color={["#5E6AD2", "#CB912F", "#0F7B6C"][i] || "#5E6AD2"}>
                      {name.length > 18 ? name.substring(0, 16) + "..." : name} x{qty}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Last purchase */}
              {st.lastPurchase && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#B1AFA7" }}>
                  Ultima compra: {formatDate(st.lastPurchase)}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "flex-end", flexWrap: "wrap" }}
                onClick={e => e.stopPropagation()}>
                <Btn onClick={() => openBalanceAdjust(c)}
                  style={{ background: (c.balance || 0) < 0 ? "#E03E3E" : (c.balance || 0) > 0 ? "#0F7B6C" : "#5E6AD2", color: "#fff", fontSize: 11, padding: "4px 10px" }}>
                  {(c.balance || 0) < 0 ? "Registrar pago" : (c.balance || 0) > 0 ? "Ajustar saldo" : "Ajustar saldo"}
                </Btn>
                <Btn onClick={() => openEdit(c)}
                  style={{ background: "#E8E7E3", color: "#8C8A82", fontSize: 11, padding: "4px 10px" }}>
                  Editar
                </Btn>
                <Btn onClick={() => handleDelete(c)}
                  style={{ background: "#FBE4E4", color: "#E03E3E", fontSize: 11, padding: "4px 10px" }}>
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
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#37352F", margin: 0 }}>
              Historial de compras - {detailClient.name}
            </h3>
            <Btn onClick={() => setDetail(null)}
              style={{ background: "#E8E7E3", color: "#8C8A82", fontSize: 11, padding: "4px 10px" }}>
              Cerrar
            </Btn>
          </div>

          {/* Summary row */}
          <div style={{ display: "flex", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: "#8C8A82" }}>Total gastado: </span>
              <span style={{ fontWeight: 700, color: "#0F7B6C" }}>{formatMoney(detailStats.totalSpent)}</span>
            </div>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: "#8C8A82" }}>Compras: </span>
              <span style={{ fontWeight: 700 }}>{detailStats.salesCount}</span>
            </div>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: "#8C8A82" }}>Unidades: </span>
              <span style={{ fontWeight: 700 }}>{detailStats.totalUnits}</span>
            </div>
            {(detailClient.balance || 0) !== 0 && (
              <div style={{ fontSize: 13 }}>
                <span style={{ color: "#8C8A82" }}>{(detailClient.balance || 0) > 0 ? "Saldo a favor: " : "Deuda: "}</span>
                <span style={{ fontWeight: 700, color: (detailClient.balance || 0) > 0 ? "#00b894" : "#E03E3E" }}>
                  {(detailClient.balance || 0) > 0 ? `+${formatMoney(detailClient.balance)}` : formatMoney(detailClient.balance)}
                </span>
              </div>
            )}
          </div>

          {/* Purchase history table */}
          {detailStats.sales.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20, color: "#B1AFA7", fontSize: 13 }}>
              Este cliente no tiene compras registradas
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #E8E7E3" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left", color: "#8C8A82", fontWeight: 600 }}>Fecha</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", color: "#8C8A82", fontWeight: 600 }}>Productos</th>
                    <th style={{ padding: "8px 12px", textAlign: "right", color: "#8C8A82", fontWeight: 600 }}>Total</th>
                    <th style={{ padding: "8px 12px", textAlign: "center", color: "#8C8A82", fontWeight: 600 }}>Items</th>
                  </tr>
                </thead>
                <tbody>
                  {detailStats.sales
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map(s => (
                      <tr key={s.id} style={{ borderBottom: "1px solid #E8E7E3" }}>
                        <td style={{ padding: "8px 12px", color: "#8C8A82", whiteSpace: "nowrap" }}>
                          {formatDate(s.date)}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#37352F" }}>
                          {(s.items || []).map(i => i.name || i.productName || "?").join(", ").substring(0, 50)}
                          {(s.items || []).map(i => i.name || i.productName || "?").join(", ").length > 50 ? "..." : ""}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#0F7B6C" }}>
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
              <div style={{ fontSize: 12, fontWeight: 600, color: "#8C8A82", marginBottom: 6 }}>
                Productos favoritos
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {detailStats.favProducts.map(([name, qty], i) => (
                  <div key={i} style={{
                    padding: "6px 12px", borderRadius: 8,
                    background: ["#EAECF9", "#FDECC8", "#DDEDEA"][i] || "#E8E7E3",
                    fontSize: 13, fontWeight: 600,
                    color: ["#5E6AD2", "#CB912F", "#0F7B6C"][i] || "#8C8A82",
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
              <div style={{ fontSize: 14, fontWeight: 700, color: "#37352F", marginBottom: 10 }}>Historial de saldo</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...(detailClient.balanceHistory || [])].reverse().slice(0, 20).map(h => {
                  const typeLabels = { payment: "Pago de deuda", credit: "Crédito agregado", debit: "Deuda agregada", settle_credit: "Crédito liquidado", sale_credit_used: "Crédito usado en venta", sale_debt: "Deuda por venta", sale_credit_given: "Vuelto como crédito", adjustment: "Ajuste manual" };
                  const isPositive = h.type === "payment" || h.type === "credit" || h.type === "sale_credit_given";
                  return (
                    <div key={h.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 12px", background: "#FAFAF9", borderRadius: 8,
                      borderLeft: `3px solid ${isPositive ? "#0F7B6C" : "#E03E3E"}`,
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#37352F" }}>
                          {typeLabels[h.type] || h.type}
                          {h.method ? ` (${h.method}${h.mpAccount ? ` - ${h.mpAccount}` : ""})` : ""}
                        </div>
                        {h.notes && <div style={{ fontSize: 11, color: "#B1AFA7" }}>{h.notes}</div>}
                        <div style={{ fontSize: 11, color: "#B1AFA7" }}>{formatDate(h.date)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: isPositive ? "#0F7B6C" : "#E03E3E" }}>
                          {isPositive ? "+" : "-"}{formatMoney(h.amount)}
                        </div>
                        <div style={{ fontSize: 10, color: "#B1AFA7" }}>Saldo: {formatMoney(h.balanceAfter)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {detailClient.notes && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "#FAFAF9", borderRadius: 8, fontSize: 12, color: "#8C8A82" }}>
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
              <div style={{ padding: "8px 12px", borderRadius: 8, background: (form.balance || 0) > 0 ? "#DDEDEA" : "#FBE4E4", fontSize: 13 }}>
                <span style={{ color: "#8C8A82" }}>Saldo actual: </span>
                <span style={{ fontWeight: 700, color: (form.balance || 0) > 0 ? "#0F7B6C" : "#E03E3E" }}>{formatMoney(form.balance || 0)}</span>
                <span style={{ color: "#B1AFA7", fontSize: 11 }}> (usá "Registrar pago" o "Ajustar saldo" para modificar)</span>
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
          <div style={{ textAlign: "center", marginBottom: 16, padding: "14px", background: balanceForm.currentBalance > 0 ? "#DDEDEA" : balanceForm.currentBalance < 0 ? "#FBE4E4" : "#FAFAF9", borderRadius: 12, border: `1px solid ${balanceForm.currentBalance > 0 ? "#B6D4CC" : balanceForm.currentBalance < 0 ? "#F1B8B6" : "#E8E7E3"}` }}>
            <div style={{ fontSize: 12, color: "#8C8A82", textTransform: "uppercase", fontWeight: 600 }}>Saldo actual</div>
            <div style={{
              fontSize: 32, fontWeight: 800,
              color: balanceForm.currentBalance > 0 ? "#0F7B6C" : balanceForm.currentBalance < 0 ? "#E03E3E" : "#8C8A82",
            }}>
              {balanceForm.currentBalance > 0 ? "+" : ""}{formatMoney(balanceForm.currentBalance)}
            </div>
            <div style={{ fontSize: 12, color: "#8C8A82", fontWeight: 600 }}>
              {balanceForm.currentBalance > 0 ? "Le debemos al cliente" : balanceForm.currentBalance < 0 ? "El cliente nos debe" : "Sin saldo pendiente"}
            </div>
          </div>

          {/* Quick action: settle everything */}
          {balanceForm.currentBalance !== 0 && (
            <button onClick={() => {
              const abs = Math.abs(balanceForm.currentBalance);
              const type = balanceForm.currentBalance < 0 ? "payment" : "settle_credit";
              setBalanceForm(f => ({ ...f, type, amount: String(abs), notes: balanceForm.currentBalance < 0 ? "Deuda saldada" : "Crédito liquidado" }));
            }} style={{
              width: "100%", padding: "12px", borderRadius: 10, cursor: "pointer", marginBottom: 14,
              border: "2px solid #0F7B6C", background: "#DDEDEA", color: "#0F7B6C",
              fontWeight: 700, fontSize: 14, textAlign: "center",
            }}>
              ✅ Saldar todo ({formatMoney(Math.abs(balanceForm.currentBalance))})
            </button>
          )}

          {/* Type selector */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { key: "payment", label: "Cliente pagó deuda", color: "#0F7B6C", icon: "💰", show: true },
              { key: "settle_credit", label: "Le pagamos al cliente", color: "#2383E2", icon: "💸", show: true },
              { key: "credit", label: "Dar crédito", color: "#5E6AD2", icon: "🏦", show: true },
              { key: "debit", label: "Agregar deuda", color: "#E03E3E", icon: "📝", show: true },
            ].filter(o => o.show).map(opt => (
              <button key={opt.key} onClick={() => setBalanceForm(f => ({ ...f, type: opt.key }))}
                style={{
                  flex: "1 1 45%", padding: "10px 6px", borderRadius: 10, cursor: "pointer",
                  border: `2px solid ${balanceForm.type === opt.key ? opt.color : "#E8E7E3"}`,
                  background: balanceForm.type === opt.key ? `${opt.color}15` : "#FAFAF9",
                  color: balanceForm.type === opt.key ? opt.color : "#8C8A82",
                  fontWeight: 700, fontSize: 11, textAlign: "center",
                }}>
                <div style={{ fontSize: 16, marginBottom: 2 }}>{opt.icon}</div>
                {opt.label}
              </button>
            ))}
          </div>

          <Input label="Monto" type="number" value={balanceForm.amount}
            onChange={e => setBalanceForm(f => ({ ...f, amount: e.target.value }))}
            placeholder={balanceForm.currentBalance !== 0 ? String(Math.abs(balanceForm.currentBalance)) : "ej: 5000"} />

          {(balanceForm.type === "payment" || balanceForm.type === "settle_credit") && (
            <>
              <Select label={balanceForm.type === "payment" ? "¿Cómo pagó?" : "¿Cómo le pagamos?"} options={PAYMENT_METHODS} value={balanceForm.method}
                onChange={e => setBalanceForm(f => ({ ...f, method: e.target.value }))} />
              {balanceForm.method === "Mercado Pago" && (
                <Select label="Cuenta MP" options={MP_ACCOUNTS} value={balanceForm.mpAccount}
                  onChange={e => setBalanceForm(f => ({ ...f, mpAccount: e.target.value }))} />
              )}
            </>
          )}

          <Input label="Notas (opcional)" value={balanceForm.notes}
            onChange={e => setBalanceForm(f => ({ ...f, notes: e.target.value }))}
            placeholder={
              balanceForm.type === "payment" ? "ej: Pagó deuda en efectivo" :
              balanceForm.type === "settle_credit" ? "ej: Le transferimos lo que le debíamos" :
              "ej: Acuerdo especial"
            } />

          {/* Preview */}
          {Number(balanceForm.amount) > 0 && (
            <div style={{ padding: "12px 14px", borderRadius: 10, marginTop: 8, background: "#FAFAF9", border: "1px solid #E8E7E3" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#8C8A82", fontSize: 13 }}>Saldo después</span>
                {(() => {
                  const amt = Number(balanceForm.amount);
                  let nb = balanceForm.currentBalance;
                  if (balanceForm.type === "payment" || balanceForm.type === "credit") nb += amt;
                  else nb -= amt; // debit and settle_credit both reduce balance
                  nb = Math.round(nb * 100) / 100;
                  return (
                    <span style={{ fontSize: 20, fontWeight: 800, color: nb > 0 ? "#0F7B6C" : nb < 0 ? "#E03E3E" : "#0F7B6C" }}>
                      {nb === 0 ? "✅ $0 — Saldado" : formatMoney(nb)}
                    </span>
                  );
                })()}
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
