import { useState } from "react";
import { formatMoney, formatDate } from "../../helpers.js";
import { T, pickAvatarColor } from "../../theme.js";
import { Modal } from "../UI.jsx";
import { useResponsive } from "../../App.jsx";
import { isGarantia } from "../../constants.js";
import { cleanIG, resolveItemName } from "./helpers.js";
import { Sparkline, Avatar, SummaryStat } from "./primitives.jsx";

// HistoryModal — modal de historial completo del cliente con tabs (Resumen,
// Compras, Regalos, Saldo). Extraído de Clients.jsx.

const HistoryModal = ({ client, stats, productsById, withdrawals = [], onClose }) => {
  const { isMobile, isTablet } = useResponsive();
  const [activeTab, setActiveTab] = useState("resumen");
  if (!client || !stats) return null;

  // Withdrawals (regalos / garantías) vinculados a este cliente
  const clientGestures = withdrawals
    .filter(w => !w.isDeleted && w.linkedClientId === client.id)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const totalGesturesUSD = clientGestures.reduce((s, w) => s + (Number(w.costRealUSD || w.costEstimateUSD) || 0), 0);
  const hasBalanceHistory = (client.balanceHistory || []).length > 0;

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
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
        <SummaryStat label="Gastado" value={formatMoney(stats.totalSpent)} color={T.green} />
        <SummaryStat label="Compras" value={stats.salesCount} />
        <SummaryStat label="Unidades" value={stats.totalUnits} />
        <SummaryStat label="Frecuencia" value={stats.avgDays ? `${stats.avgDays}d` : "—"} sub={stats.avgDays ? "entre compras" : ""} />
      </div>

      {/* Tabs — segmentan secciones pesadas para no scrollear 15+ veces en mobile */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, borderBottom: `1px solid ${T.borderSoft}`, paddingBottom: 10 }}>
        {[
          { key: "resumen", label: "📊 Resumen" },
          { key: "compras", label: `🛒 Compras (${sortedSales.length})` },
          ...(clientGestures.length > 0 ? [{ key: "regalos", label: `🎁 Regalos (${clientGestures.length})` }] : []),
          ...(hasBalanceHistory ? [{ key: "saldo", label: "💳 Saldo" }] : []),
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: "7px 14px", minHeight: 36,
            border: `1px solid ${activeTab === tab.key ? T.primary : T.borderSoft}`,
            borderRadius: 20, fontSize: 12,
            fontWeight: activeTab === tab.key ? 700 : 500,
            background: activeTab === tab.key ? "#E8EBF2" : T.surface2,
            color: activeTab === tab.key ? T.primary : T.textMuted,
            cursor: "pointer", fontFamily: "inherit",
          }}>{tab.label}</button>
        ))}
      </div>

      {/* Monthly sparkline */}
      {activeTab === "resumen" && peak > 0 && (
        <div style={{ background: T.surface2, borderRadius: 12, padding: 14, marginBottom: 18, border: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Evolución últimos 6 meses
          </div>
          <Sparkline data={sparkData} width={isMobile ? 280 : 440} height={70} color={T.primary} />
        </div>
      )}

      {/* Favorite products */}
      {activeTab === "resumen" && stats.favProducts.length > 0 && (
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

      {/* Regalos y garantías (gestos comerciales) */}
      {activeTab === "regalos" && clientGestures.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span>🎁 Regalos y garantías ({clientGestures.length})</span>
            <span style={{ color: T.amber, fontWeight: 700, fontFamily: T.fontDisplay }}>
              {formatMoney(totalGesturesUSD, "USD")} en gestos
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {clientGestures.map(w => {
              const entregado = productsById[w.productId];
              const entregadoName = entregado ? `${entregado.brand} ${entregado.model} - ${entregado.flavor}` : "Producto eliminado";
              const failed = w.failedProductId ? productsById[w.failedProductId] : entregado;
              const failedName = failed ? `${failed.brand} ${failed.model} - ${failed.flavor}` : entregadoName;
              const sameModel = !w.failedProductId || w.failedProductId === w.productId;
              const cost = Number(w.costRealUSD || w.costEstimateUSD) || 0;
              const isRegalo = w.withdrawType === "Regalo / Canje";
              const isGar = isGarantia(w.withdrawType);
              const borderColor = isGar && w.reclamableProveedor ? T.red : T.amber;
              return (
                <div key={w.id} style={{
                  background: T.amberBg, border: `1px solid ${T.amberBorder}`,
                  borderLeft: `3px solid ${borderColor}`,
                  borderRadius: 8, padding: "10px 12px",
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: borderColor, marginBottom: 2 }}>
                      {isRegalo ? "🎁 Regalo" : "🛡️ Garantía"} · {formatDate(w.date)}
                      {w.reclamableProveedor && (
                        <span style={{
                          marginLeft: 6, fontSize: 9, padding: "1px 5px", borderRadius: 3,
                          background: T.redBg, color: T.red, fontWeight: 700, textTransform: "uppercase",
                        }}>📦 reclamable</span>
                      )}
                    </div>
                    {isGar ? (
                      <>
                        <div style={{ fontSize: 13, color: T.text, fontWeight: 600, lineHeight: 1.4 }}>
                          {w.qty}× {failedName} fallido{sameModel ? "" : ""}
                          {w.failureReason && (
                            <span style={{ color: T.textMuted, fontWeight: 400 }}> ({w.failureReason.toLowerCase()})</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: T.textSub, marginTop: 2, lineHeight: 1.4 }}>
                          Reemplazado por <strong>{sameModel ? "mismo modelo" : entregadoName}</strong> nuevo
                          {w.createdBy && <span style={{ color: T.textMuted }}> — por {w.createdBy}</span>}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 13, color: T.text, fontWeight: 600, lineHeight: 1.4 }}>
                        {w.qty}× {entregadoName}
                      </div>
                    )}
                    {w.failureNotes && (
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, fontStyle: "italic" }}>
                        "{w.failureNotes}"
                      </div>
                    )}
                    {w.notes && !w.failureNotes && (
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, fontStyle: "italic" }}>
                        "{w.notes}"
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.amber, fontFamily: T.fontDisplay }}>
                      {formatMoney(cost, "USD")}
                    </div>
                    {!isGar && w.createdBy && <div style={{ fontSize: 10, color: T.textMuted }}>por {w.createdBy}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sales list */}
      {activeTab === "compras" && (
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
      )}

      {/* Balance history */}
      {activeTab === "saldo" && (client.balanceHistory || []).length > 0 && (
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


export default HistoryModal;
