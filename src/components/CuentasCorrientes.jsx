import { useState, useMemo } from "react";
import { formatMoney } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Card, Btn, Modal, Input, Select, StatCard } from "./UI.jsx";
import { T } from "../theme.js";
import { PAYMENT_METHODS, MP_ACCOUNTS } from "../constants.js";
import { useAppContext } from "../AppContext.js";
import {
  creditStatus, clientOutstanding, isOverdue, oldestUnpaidDays,
  allocatePayment, DEFAULT_CREDIT_TERM_DAYS,
} from "../lib/creditAccount.js";
import { cobranzaMessage } from "../lib/wholesaleMessage.js";

// Cuentas corrientes B2B: clientes mayoristas que deben plata (fiado o pedido
// entregado sin cobrar). Registrar pago = puente con la caja (payment real en las
// ventas → acredita la cuenta). Mensaje de cobranza copiable.

export function CuentasCorrientes({ clients = [], sales = [], setSales }) {
  const { isMobile } = useResponsive();
  const { logAudit } = useAppContext();

  const [pay, setPay] = useState(null); // { client, owed }
  const [payForm, setPayForm] = useState({ method: "Mercado Pago", mpAccount: "MP Diego", amount: "" });
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  // Mayoristas que deben algo (owed > 0).
  const rows = useMemo(() => {
    return clients
      .filter(c => c && !c.isDeleted && c.type === "mayorista")
      .map(c => {
        const st = creditStatus(c, sales);
        return { client: c, owed: st.owedARS, st, overdue: isOverdue(c, sales, DEFAULT_CREDIT_TERM_DAYS), days: oldestUnpaidDays(c, sales) };
      })
      .filter(r => r.owed > 0)
      .sort((a, b) => b.owed - a.owed);
  }, [clients, sales]);

  const totalPorCobrar = rows.reduce((s, r) => s + r.owed, 0);
  const enMora = rows.filter(r => r.overdue).length;

  const openPay = (row) => { setPayForm({ method: "Mercado Pago", mpAccount: "MP Diego", amount: String(row.owed) }); setPay({ client: row.client, owed: row.owed }); };

  const confirmPay = () => {
    const amount = Math.round(Number(payForm.amount) || 0);
    if (amount <= 0) { flash("Ingresá el monto"); return; }
    const { updates } = allocatePayment(pay.client, sales, amount);
    if (updates.length === 0) { flash("No hay pedidos impagos"); return; }
    const now = new Date().toISOString();
    const byId = Object.fromEntries(updates.map(u => [u.saleId, u]));
    // Registrar el pago repartido en las ventas → alimenta el ledger de caja.
    setSales(prev => prev.map(s => {
      const u = byId[s.id];
      if (!u) return s;
      const payment = { method: payForm.method, ...(payForm.method === "Mercado Pago" ? { mpAccount: payForm.mpAccount } : {}), amount: u.amount, date: now };
      return { ...s, payments: [...(s.payments || []), payment], fulfillmentStatus: u.fullyPaid ? "cobrado" : (s.fulfillmentStatus || "entregado") };
    }));
    logAudit?.("cobro", "client", pay.client.id, `Pago a cuenta ${pay.client.businessName || pay.client.name}: ${formatMoney(amount)} (${payForm.method})`);
    setPay(null);
    flash(`💵 Registrado ${formatMoney(amount)} → ${payForm.method}`);
  };

  const copyCobranza = (client) => {
    const msg = cobranzaMessage(client, sales);
    navigator.clipboard?.writeText(msg).then(() => flash("Mensaje de cobranza copiado")).catch(() => flash("No se pudo copiar"));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: T.text, margin: 0, fontSize: 22 }}>💳 Cuentas corrientes</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="Por cobrar" value={formatMoney(totalPorCobrar)} icon="💵" color={T.green} />
        <StatCard label="Con deuda" value={rows.length} icon="🧾" color={T.blue} />
        <StatCard label="En mora (+30d)" value={enMora} icon="⏰" color={enMora > 0 ? T.red : T.textMuted} />
      </div>

      {rows.length === 0 ? (
        <Card><div style={{ textAlign: "center", color: T.textMuted, padding: isMobile ? "32px 16px" : 48 }}>
          Ningún mayorista con saldo pendiente. Los pedidos cobrados contra entrega no aparecen acá.
        </div></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {rows.map(({ client, owed, st, overdue, days }) => (
            <Card key={client.id} style={{ borderLeft: `4px solid ${overdue ? T.red : st.enabled ? T.amber : T.blue}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: T.text, fontSize: 15 }}>{client.businessName || client.name}</div>
                  <div style={{ fontSize: 12, color: T.textMuted }}>{client.zone || "sin zona"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: overdue ? T.red : T.text }}>{formatMoney(owed)}</div>
                  {days != null && <div style={{ fontSize: 11, color: T.textFaint }}>hace {days}d</div>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0" }}>
                {st.enabled
                  ? <span style={{ background: T.amberBg, color: T.amber, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>Fiado · límite {formatMoney(st.limitARS)} · disp. {formatMoney(st.availableARS)}</span>
                  : <span style={{ background: T.blueBg, color: T.blue, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>Contra entrega (sin cobrar)</span>}
                {overdue && <span style={{ background: T.redBg, color: T.red, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>⏰ En mora</span>}
                {st.overLimit && <span style={{ background: T.redBg, color: T.red, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>Sobre el límite</span>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={() => openPay({ client, owed })} style={{ flex: 1, minHeight: 40 }}>💵 Registrar pago</Btn>
                <Btn variant="secondary" onClick={() => copyCobranza(client)} style={{ minHeight: 40 }}>💬</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal registrar pago — puente con la caja */}
      <Modal open={!!pay} onClose={() => setPay(null)} title={`Registrar pago — ${pay?.client?.businessName || pay?.client?.name || ""}`}>
        <div style={{ fontSize: 13, color: T.textSub, marginBottom: 12 }}>Adeudado: <b>{formatMoney(pay?.owed || 0)}</b></div>
        <Select label="Método / cuenta" options={PAYMENT_METHODS} value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))} />
        {payForm.method === "Mercado Pago" && (
          <Select label="Cuenta MP" options={MP_ACCOUNTS} value={payForm.mpAccount} onChange={e => setPayForm(f => ({ ...f, mpAccount: e.target.value }))} />
        )}
        <Input label="Monto (ARS)" type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>Se reparte en los pedidos impagos (más viejos primero) y acredita la cuenta de caja elegida.</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={() => setPay(null)}>Cancelar</Btn>
          <Btn onClick={confirmPay}>Registrar</Btn>
        </div>
      </Modal>

      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: T.primary, color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 300, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>{toast}</div>}
    </div>
  );
}
