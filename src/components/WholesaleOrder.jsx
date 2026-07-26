import { useState, useMemo } from "react";
import { uid, formatMoney } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Card, Btn, Select, Modal, Input } from "./UI.jsx";
import { T } from "../theme.js";
import { useAppContext } from "../AppContext.js";
import { resolveTierPrice, hasTierPrice, volumeDiscount, applyPct, orderMargin, validateOrderMinimum } from "../wholesale.js";
import { creditStatus } from "../lib/creditAccount.js";

// Pedido MAYORISTA: elegís un cliente mayorista → precios de su tier + margen en
// vivo por línea + total, valida mínimo, y genera un `sale` con saleType=mayorista
// y channel=Mayorista. Descuenta stock. Cobranza/entrega = fases 3/4
// (el pedido nace con fulfillmentStatus="pendiente").

const prodLabel = (p) => `${p.brand} ${p.model} - ${p.flavor}`;
const costOf = (p) => (Number(p?.avgCostUSDT) > 0 ? Number(p.avgCostUSDT) : Number(p?.costUSDT) > 0 ? Number(p.costUSDT) : 0);

export function WholesaleOrder({ clients = [], products = [], setProducts, sales = [], setSales, logStock }) {
  const { isMobile } = useResponsive();
  const { exchangeRate, logAudit, currentUser } = useAppContext();
  const rate = Number(exchangeRate) || 1;

  const [clientId, setClientId] = useState("");
  const [applyVolume, setApplyVolume] = useState(false);
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState([]); // [{ productId, qty, unitPriceUSD }]
  const [toast, setToast] = useState("");
  const [orderNote, setOrderNote] = useState(""); // Tanda F: nota libre del pedido (viaja a la hoja de ruta)
  const [historyOpen, setHistoryOpen] = useState(false); // Tanda F: duplicar pedido histórico

  const mayoristas = useMemo(
    () => clients.filter(c => c && !c.isDeleted && c.type === "mayorista"),
    [clients]
  );
  const client = mayoristas.find(c => c.id === clientId) || null;
  const tier = client?.wholesaleTier || null;

  const inStock = useMemo(
    () => products.filter(p => p && !p.isDeleted && (Number(p.stock) || 0) > 0),
    [products]
  );
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return inStock.filter(p => prodLabel(p).toLowerCase().includes(q)).slice(0, 8);
  }, [inStock, search]);

  const totalUnits = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const vol = applyVolume ? volumeDiscount(totalUnits) : { pct: 0, label: "—" };

  // Líneas resueltas con producto + precio final (tier + volumen opcional).
  const resolvedLines = useMemo(() => lines.map(l => {
    const product = products.find(p => p.id === l.productId);
    const baseUSD = Number(l.unitPriceUSD) || 0;
    const finalUSD = vol.pct > 0 ? applyPct(baseUSD, vol.pct) : baseUSD;
    return { ...l, product, unitPriceUSD: finalUSD, baseUSD };
  }), [lines, products, vol.pct]);

  const margin = useMemo(() => orderMargin({ lines: resolvedLines }), [resolvedLines]);
  const totalARS = Math.round(margin.totalRevenueUSD * rate);
  const minCheck = tier ? validateOrderMinimum({ tier, totalUnits, totalARS }) : { ok: true, reasons: [] };
  const credit = client ? creditStatus(client, sales) : null;
  const excedeCredito = credit?.enabled && totalARS > credit.availableARS;

  const addProduct = (p) => {
    setSearch("");
    setLines(prev => {
      const existing = prev.find(l => l.productId === p.id);
      if (existing) return prev.map(l => l.productId === p.id ? { ...l, qty: (Number(l.qty) || 0) + 1 } : l);
      const unit = resolveTierPrice(p, tier); // precio USD del tier
      return [...prev, { productId: p.id, qty: 1, unitPriceUSD: unit }];
    });
  };
  const setQty = (id, qty) => setLines(prev => prev.map(l => l.productId === id ? { ...l, qty: Math.max(0, Number(qty) || 0) } : l).filter(l => l.qty > 0));
  const setPrice = (id, val) => setLines(prev => prev.map(l => l.productId === id ? { ...l, unitPriceUSD: val === "" ? 0 : Number(val) } : l));
  const removeLine = (id) => setLines(prev => prev.filter(l => l.productId !== id));

  // 1.6 — repetir último pedido mayorista del cliente.
  const lastOrder = useMemo(() => {
    if (!client) return null;
    return sales
      .filter(s => !s.isDeleted && s.clientId === client.id && s.saleType === "mayorista")
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
  }, [sales, client]);

  // Todos los pedidos mayoristas del cliente (para duplicar cualquiera).
  const clientOrders = useMemo(() => {
    if (!client) return [];
    return sales
      .filter(s => !s.isDeleted && s.clientId === client.id && s.saleType === "mayorista")
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [sales, client]);

  // Clona las líneas de un pedido con los precios de tier DE HOY (no copia
  // precios viejos). Productos borrados se omiten. Base de "repetir último"
  // y de "duplicar histórico" (Tanda F).
  const loadFromSale = (sale, label) => {
    if (!sale) return;
    const newLines = (sale.items || [])
      .map(it => {
        const p = products.find(pr => pr.id === it.productId && !pr.isDeleted);
        if (!p) return null;
        return { productId: p.id, qty: Number(it.qty) || 1, unitPriceUSD: resolveTierPrice(p, tier) };
      })
      .filter(Boolean);
    setLines(newLines);
    setHistoryOpen(false);
    setToast(`${label} (${newLines.length} productos)`);
    setTimeout(() => setToast(""), 3000);
  };

  const repeatLast = () => loadFromSale(lastOrder, "Precargado el último pedido");

  const confirm = () => {
    if (!client) { setToast("Elegí un cliente mayorista"); return; }
    if (resolvedLines.length === 0) { setToast("Agregá al menos un producto"); return; }
    if (!minCheck.ok) { setToast(minCheck.reasons[0]); return; }

    const saleId = uid();
    const items = resolvedLines.map(l => {
      const cost = costOf(l.product);
      return {
        productId: l.productId,
        qty: Number(l.qty) || 1,
        priceUSD: l.unitPriceUSD,
        priceARS: Math.round(l.unitPriceUSD * rate),
        name: l.product ? prodLabel(l.product) : "",
        ...(cost > 0 ? { costUSDTAtSale: cost } : {}),
      };
    });
    const saleData = {
      id: saleId,
      date: new Date().toISOString(),
      items,
      clientId: client.id,
      clientName: client.businessName || client.name,
      channel: "Mayorista",
      saleType: "mayorista",
      fulfillmentStatus: "pendiente", // armado/en_ruta/entregado/cobrado → fases 3/4
      currency: "ARS",
      total: totalARS,
      subtotal: totalARS,
      payments: [], // contra entrega / crédito → fases 3/4
      volumeDiscountPct: vol.pct || 0,
      exchangeRate: rate,
      createdBy: currentUser?.name || "",
      ...(orderNote.trim() ? { orderNote: orderNote.trim() } : {}),
    };

    // Descontar stock + log (igual que una venta normal).
    items.forEach(item => {
      setProducts(prev => prev.map(p => p.id === item.productId ? { ...p, stock: Math.max(0, (p.stock || 0) - (Number(item.qty) || 1)) } : p));
      logStock?.({ productId: item.productId, type: "venta", qty: -(Number(item.qty) || 1), reason: `Pedido mayorista ${client.businessName || client.name}`, refId: saleId, date: saleData.date });
    });
    setSales(prev => [saleData, ...prev]);
    logAudit?.("create", "sale", saleId, `Pedido mayorista: ${client.businessName || client.name} · ${totalUnits}u · ${formatMoney(totalARS)}`);

    setLines([]);
    setOrderNote("");
    setToast(`✅ Pedido registrado: ${totalUnits}u · ${formatMoney(totalARS)}`);
    setTimeout(() => setToast(""), 4000);
  };

  const marginColor = margin.marginPct >= 30 ? T.green : margin.marginPct >= 20 ? T.amber : T.red;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: T.text, margin: 0, fontSize: 22 }}>🧾 Pedido mayorista</h2>
      </div>

      {mayoristas.length === 0 ? (
        <Card><div style={{ textAlign: "center", color: T.textMuted, padding: isMobile ? "32px 16px" : 48 }}>
          Primero cargá un cliente mayorista en la pantalla <b>Kioscos</b>.
        </div></Card>
      ) : (
        <>
          {/* Cliente + tier */}
          <Card style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <Select label="Cliente mayorista" value={clientId}
                  options={mayoristas.map(c => ({ value: c.id, label: `${c.businessName || c.name}${c.wholesaleTier ? ` (Tier ${c.wholesaleTier})` : ""}` }))}
                  onChange={e => { setClientId(e.target.value); setLines([]); }} />
              </div>
              {client && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                  <span style={{ background: T.primarySoft, color: T.primary, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>
                    Tier {tier || "—"}
                  </span>
                  {lastOrder && <Btn variant="secondary" onClick={repeatLast}>🔁 Repetir último pedido</Btn>}
                  {clientOrders.length > 1 && <Btn variant="secondary" onClick={() => setHistoryOpen(true)}>🗂 Duplicar un pedido…</Btn>}
                </div>
              )}
            </div>
            {client && !tier && (
              <div style={{ color: T.red, fontSize: 13 }}>⚠️ Este cliente no tiene tier asignado — los precios caen al minorista. Asignale un tier en Kioscos.</div>
            )}
            {client && credit && (
              <div style={{ marginTop: 10, fontSize: 12 }}>
                {credit.enabled ? (
                  <span>
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      <span style={{ color: T.textSub }}>💳 Cuenta corriente:</span>
                      <span style={{ background: T.borderSoft, borderRadius: 6, padding: "2px 8px", color: T.textSub }}>debe {formatMoney(credit.owedARS)}</span>
                      <span style={{ background: T.borderSoft, borderRadius: 6, padding: "2px 8px", color: T.textSub }}>límite {formatMoney(credit.limitARS)}</span>
                      <span style={{ background: excedeCredito ? T.redBg : T.greenBg, borderRadius: 6, padding: "2px 8px", fontWeight: 700, color: excedeCredito ? T.red : T.green }}>disp. {formatMoney(credit.availableARS)}</span>
                    </span>
                    {excedeCredito && <span style={{ display: "block", marginTop: 6, color: T.red }}>⚠️ Este pedido ({formatMoney(totalARS)}) supera el disponible</span>}
                  </span>
                ) : (
                  <span style={{ color: T.textMuted }}>💵 Paga contra entrega (sin cuenta corriente). Se cobra en la entrega/ruta.</span>
                )}
              </div>
            )}
          </Card>

          {client && (
            <>
              {/* Buscador de productos */}
              <Card style={{ marginBottom: 14 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto para agregar..."
                  style={{ width: "100%", padding: isMobile ? "12px 14px" : "10px 12px", minHeight: isMobile ? 44 : 38, fontSize: isMobile ? 16 : 14,
                    background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, outline: "none", boxSizing: "border-box" }} />
                {searchResults.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {searchResults.map(p => (
                      <button key={p.id} onClick={() => addProduct(p)} style={{
                        textAlign: "left", border: `1px solid ${T.borderSoft}`, background: T.card, color: T.text,
                        borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 13,
                        minHeight: isMobile ? 44 : undefined,
                        // Mobile: apilado — el nombre del producto es lo que se lee
                        // para elegir, no puede ceder ante el metadato de precio.
                        display: "flex", flexDirection: isMobile ? "column" : "row",
                        justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 2 : 8,
                      }}>
                        <span style={{ minWidth: 0, fontWeight: 600 }}>{prodLabel(p)}</span>
                        <span style={{ color: T.textMuted, flexShrink: 0, fontSize: isMobile ? 11 : 13 }}>
                          {hasTierPrice(p, tier) ? `Tier ${tier}: ${resolveTierPrice(p, tier)} USD` : `base ${p.priceUSD} USD`} · stock {p.stock}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </Card>

              {/* Líneas del pedido */}
              {resolvedLines.length > 0 && (
                <Card style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: T.textSub, cursor: "pointer" }}>
                      <input type="checkbox" checked={applyVolume} onChange={e => setApplyVolume(e.target.checked)} />
                      Aplicar descuento por volumen {vol.pct > 0 ? `(${vol.label} → -${vol.pct}%)` : "(opcional)"}
                    </label>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {resolvedLines.map(l => {
                      const line = margin.perLine.find(x => x.product?.id === l.productId);
                      const mc = !line ? T.textMuted : line.marginPct >= 30 ? T.green : line.marginPct >= 20 ? T.amber : T.red;
                      // Mobile: card de 2 filas (nombre+✕ / qty+precio+subtotal)
                      // en vez de la fila-tabla de 5 elementos que wrapeaba feo.
                      if (isMobile) return (
                        <div key={l.productId} style={{ borderBottom: `1px solid ${T.borderSoft}`, paddingBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: T.text, fontWeight: 600 }}>
                              {l.product ? prodLabel(l.product) : "?"}
                              <div style={{ fontSize: 11, fontWeight: 700, color: mc }}>margen {line ? line.marginPct : 0}%</div>
                            </div>
                            <button onClick={() => removeLine(l.productId)} aria-label="Quitar producto" style={{
                              border: `1px solid ${T.borderSoft}`, background: T.bg, color: T.red, cursor: "pointer",
                              fontSize: 16, width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>✕</button>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input type="number" min="0" value={l.qty} onChange={e => setQty(l.productId, e.target.value)}
                              aria-label="Cantidad"
                              style={{ flex: "0 0 72px", minWidth: 0, padding: "8px", minHeight: 44, borderRadius: 8, border: `1px solid ${T.border}`, textAlign: "center", fontSize: 16, background: T.card, color: T.text, boxSizing: "border-box" }} />
                            <input type="number" step="0.01" value={l.baseUSD} onChange={e => setPrice(l.productId, e.target.value)}
                              title="Precio unitario USD (editable)" aria-label="Precio unitario USD"
                              style={{ flex: "0 0 90px", minWidth: 0, padding: "8px", minHeight: 44, borderRadius: 8, border: `1px solid ${T.border}`, textAlign: "right", fontSize: 16, background: T.card, color: T.text, boxSizing: "border-box" }} />
                            <div style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 14, fontWeight: 700, color: T.textSub, overflowWrap: "anywhere" }}>{formatMoney(Math.round(l.unitPriceUSD * l.qty * rate))}</div>
                          </div>
                        </div>
                      );
                      return (
                        <div key={l.productId} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${T.borderSoft}`, paddingBottom: 8 }}>
                          <div style={{ flex: "1 1 160px", minWidth: 0, fontSize: 13, color: T.text, fontWeight: 600 }}>
                            {l.product ? prodLabel(l.product) : "?"}
                            <div style={{ fontSize: 11, fontWeight: 700, color: mc }}>margen {line ? line.marginPct : 0}%</div>
                          </div>
                          <input type="number" min="0" value={l.qty} onChange={e => setQty(l.productId, e.target.value)}
                            style={{ width: 64, padding: "8px", borderRadius: 8, border: `1px solid ${T.border}`, textAlign: "center", fontSize: 14, background: T.card, color: T.text }} />
                          <input type="number" step="0.01" value={l.baseUSD} onChange={e => setPrice(l.productId, e.target.value)}
                            title="Precio unitario USD (editable)"
                            style={{ width: 84, padding: "8px", borderRadius: 8, border: `1px solid ${T.border}`, textAlign: "right", fontSize: 14, background: T.card, color: T.text }} />
                          <div style={{ width: 90, textAlign: "right", fontSize: 13, color: T.textSub }}>{formatMoney(Math.round(l.unitPriceUSD * l.qty * rate))}</div>
                          <button onClick={() => removeLine(l.productId)} aria-label="Quitar producto" style={{ border: "none", background: "transparent", color: T.red, cursor: "pointer", fontSize: 16, width: 32, height: 32, borderRadius: 6 }}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Totales + confirmar */}
              {resolvedLines.length > 0 && (
                <Card>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
                    <Totals label="Unidades" value={totalUnits} />
                    <Totals label="Total" value={formatMoney(totalARS)} />
                    <Totals label="Margen" value={`${margin.marginPct}%`} color={marginColor} />
                    <Totals label="Ganancia" value={`${Math.round(margin.totalMarginUSD * rate).toLocaleString("es-AR")} ARS`} color={marginColor} />
                  </div>
                  {!minCheck.ok && <div style={{ color: T.red, fontSize: 13, marginBottom: 10 }}>⚠️ {minCheck.reasons[0]}</div>}
                  {/* Tanda F: nota libre — aparece en la hoja de ruta, que es
                      donde sirve (ej: "entregar después de las 18h"). */}
                  <Input label="Nota para la entrega (opcional)" value={orderNote}
                    onChange={e => setOrderNote(e.target.value)}
                    placeholder='Ej: "entregar después de las 18h", "preguntar por Marcelo"' />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Btn onClick={confirm} disabled={!minCheck.ok}>Registrar pedido</Btn>
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* Tanda F: duplicar cualquier pedido histórico del cliente */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={`Duplicar pedido — ${client?.businessName || client?.name || ""}`}>
        <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>
          Se cargan las mismas cantidades con los precios de tier de HOY (no los de aquel día).
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {clientOrders.map(o => {
            const units = (o.items || []).reduce((s2, it) => s2 + (Number(it.qty) || 0), 0);
            return (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${T.borderSoft}`, paddingBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>{new Date(o.date).toLocaleDateString("es-AR")} · {units}u · {formatMoney(o.total)}</div>
                  <div style={{ fontSize: 11, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(o.items || []).slice(0, 3).map(it => `${it.qty}x ${it.name || ""}`).join(" · ")}{(o.items || []).length > 3 ? " …" : ""}
                  </div>
                </div>
                <Btn variant="secondary" onClick={() => loadFromSale(o, "Pedido duplicado")} style={{ flexShrink: 0 }}>Usar</Btn>
              </div>
            );
          })}
        </div>
      </Modal>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: T.primary, color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 300, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", textAlign: "center" }}>{toast}</div>
      )}
    </div>
  );
}

function Totals({ label, value, color = T.text }) {
  return (
    <div style={{ textAlign: "center", minWidth: 0 }}>
      {/* El total que estás por confirmar se ve ENTERO (envuelve, no corta) */}
      <div style={{ fontSize: 16, fontWeight: 800, color, overflowWrap: "anywhere", lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.textMuted }}>{label}</div>
    </div>
  );
}
