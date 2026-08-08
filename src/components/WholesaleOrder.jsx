import { useState, useMemo, useEffect } from "react";
import { uid, formatMoney } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Card, Btn, Select, Modal, Input } from "./UI.jsx";
import { T } from "../theme.js";
import { useAppContext } from "../AppContext.js";
import { orderMargin } from "../wholesale.js";
import { creditStatus } from "../lib/creditAccount.js";
import { listaVigente, precioEnLista } from "../lib/priceLists.js";
import { marcarGanado, presupuestoVencido } from "../lib/cotizador.js";

// Pedido MAYORISTA (F5: conectado al motor): elegís un cliente → los precios
// salen de la LISTA PUBLICADA al escalón del total de unidades (RN-06/07,
// RN-12 — jamás se recalcula en vivo ni se edita un precio: RN-16). Las
// unidades cuentan a nivel SABOR hacia el total (mezcla libre, RN-07).
// Valida los mínimos de la política (RN-08, bloqueantes) y genera un `sale`
// saleType=mayorista / channel=Mayorista. Descuenta stock por sabor.
// Cobranza/entrega = rutas/CC (el pedido nace fulfillmentStatus="pendiente").

const prodLabel = (p) => `${p.brand} ${p.model} - ${p.flavor}`;
const costOf = (p) => (Number(p?.avgCostUSDT) > 0 ? Number(p.avgCostUSDT) : Number(p?.costUSDT) > 0 ? Number(p.costUSDT) : 0);

export function WholesaleOrder({ clients = [], products = [], setProducts, sales = [], setSales, logStock, priceLists = [], pricingPolicy = null, quotes = [], setQuotes }) {
  const { isMobile } = useResponsive();
  const { exchangeRate, logAudit, currentUser } = useAppContext();
  // FX del día + buffer de la política de la LISTA (la misma conversión de la
  // lista compartida y del presupuesto — nada diverge). Sin FX válido: 0 y el
  // registro se bloquea (nunca un número inventado).
  const lista = useMemo(() => listaVigente(priceLists), [priceLists]);
  const buffer = Number(lista?.politica?.bufferFxPct) || 0;
  const rate = Number(exchangeRate) > 0 ? Number(exchangeRate) * (1 + buffer) : 0;

  const [clientId, setClientId] = useState("");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState([]); // [{ productId, qty }] — el precio se DERIVA de la lista, jamás se guarda ni edita
  // "Armar pedido" desde el Cotizador (ajuste 1 del gate F5): el presupuesto
  // llega por handoff (localStorage) — checklist de modelos pre-cargada, el
  // vendedor solo elige sabores, y el saleId se linkea solo al registrar.
  const [armandoQuote, setArmandoQuote] = useState(() => {
    try {
      const id = localStorage.getItem("izn:armarQuote");
      if (id) localStorage.removeItem("izn:armarQuote");
      return id ? (quotes.find(q => q.id === id) || null) : null;
    } catch { return null; }
  });
  const [toast, setToast] = useState("");
  const [orderNote, setOrderNote] = useState(""); // Tanda F: nota libre del pedido (viaja a la hoja de ruta)
  const [historyOpen, setHistoryOpen] = useState(false); // Tanda F: duplicar pedido histórico

  const mayoristas = useMemo(
    () => clients.filter(c => c && !c.isDeleted && c.type === "mayorista"),
    [clients]
  );
  const client = mayoristas.find(c => c.id === clientId) || null;

  // Al llegar armando un presupuesto: preseleccionar su cliente (si tiene).
  useEffect(() => {
    if (armandoQuote?.clienteId) setClientId(armandoQuote.clienteId);
  }, []); // eslint-disable-line

  // Progreso del armado: unidades ya cargadas por modelo del presupuesto.
  const cargadoPorModelo = useMemo(() => {
    const m = new Map();
    for (const l of lines) {
      const p = products.find(x => x.id === l.productId);
      if (!p) continue;
      const clave = `${p.brand}|${p.model}`;
      m.set(clave, (m.get(clave) || 0) + (Number(l.qty) || 0));
    }
    return m;
  }, [lines, products]);

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

  // Escalón por TOTAL de unidades (RN-06), desde la propia lista. Debajo del
  // mínimo se precia provisional al primer escalón (marcado — el registro
  // igual se bloquea por RN-08).
  const escalones = lista?.filas[0]?.precios || [];
  const escalon = escalones.find(e => totalUnits >= e.desde && (e.hasta == null || totalUnits <= e.hasta)) || null;
  const unidadesParaPrecio = Math.max(totalUnits, escalones[0]?.desde || 1);

  // Precio unitario del sabor = precio de su MODELO en la lista publicada al
  // escalón vigente (RN-07: todas las líneas al mismo escalón).
  const priceOf = (product) => {
    if (!lista || !product) return null;
    return precioEnLista(lista, `${product.brand}|${product.model}`, unidadesParaPrecio);
  };

  const resolvedLines = useMemo(() => lines.map(l => {
    const product = products.find(p => p.id === l.productId);
    const p = priceOf(product);
    return { ...l, product, enLista: !!p, unitPriceUSD: p?.precio || 0 };
  }), [lines, products, lista, unidadesParaPrecio]); // eslint-disable-line

  const margin = useMemo(() => orderMargin({ lines: resolvedLines }), [resolvedLines]);
  const totalUSD = resolvedLines.reduce((s, l) => s + l.unitPriceUSD * (Number(l.qty) || 0), 0);
  const totalARS = Math.round(totalUSD * rate);

  // RN-08 + RN-18 + RN-12 — bloqueos del registro.
  const minimo = pricingPolicy?.pedidoMinimo || {};
  const motivosBloqueo = [];
  if (!lista) motivosBloqueo.push("No hay lista de precios publicada (publicala en 🏷️ Lista de precios).");
  if (!(rate > 0)) motivosBloqueo.push("Sin cotización del dólar válida — esperá dolarapi o cargala en Caja.");
  if (totalUnits > 0 && Number(minimo.unidades) > 0 && totalUnits < Number(minimo.unidades)) {
    motivosBloqueo.push(`No llega al mínimo de ${minimo.unidades} unidades (tiene ${totalUnits}).`);
  }
  if (totalUSD > 0 && Number(minimo.ticketUSD) > 0 && totalUSD < Number(minimo.ticketUSD)) {
    motivosBloqueo.push(`No llega al ticket mínimo de USD ${minimo.ticketUSD} (tiene USD ${Math.round(totalUSD)}).`);
  }
  resolvedLines.filter(l => !l.enLista).forEach(l => {
    motivosBloqueo.push(`"${l.product ? prodLabel(l.product) : l.productId}" no está en la lista vigente (¿sin costo? RN-18).`);
  });
  const minCheck = { ok: motivosBloqueo.length === 0, reasons: motivosBloqueo };

  // Nudge de frontera PARA EL VENDEDOR (RN-09 / regla f): ahorro concreto
  // sobre las unidades ya cargadas si alcanza el siguiente escalón.
  const nudge = useMemo(() => {
    if (!lista || totalUnits <= 0) return null;
    const umbral = Number(pricingPolicy?.nudgeUmbralPct) || 0.1;
    const siguiente = escalones.find(e => e.desde > totalUnits);
    if (!siguiente || (siguiente.desde - totalUnits) / siguiente.desde >= umbral) return null;
    const ahorroUSD = resolvedLines.reduce((s, l) => {
      if (!l.enLista || !l.product) return s;
      const pSig = precioEnLista(lista, `${l.product.brand}|${l.product.model}`, siguiente.desde);
      return s + (pSig ? (l.unitPriceUSD - pSig.precio) * (Number(l.qty) || 0) : 0);
    }, 0);
    return { faltan: siguiente.desde - totalUnits, desde: siguiente.desde, ahorroUSD };
  }, [lista, totalUnits, resolvedLines, escalones, pricingPolicy]);

  const credit = client ? creditStatus(client, sales) : null;
  const excedeCredito = credit?.enabled && totalARS > credit.availableARS;

  const addProduct = (p) => {
    setSearch("");
    if (!priceOf(p)) {
      setToast(`⛔ ${prodLabel(p)} no está en la lista vigente (sin costo — RN-18)`);
      setTimeout(() => setToast(""), 3500);
      return;
    }
    setLines(prev => {
      const existing = prev.find(l => l.productId === p.id);
      if (existing) return prev.map(l => l.productId === p.id ? { ...l, qty: (Number(l.qty) || 0) + 1 } : l);
      return [...prev, { productId: p.id, qty: 1 }];
    });
  };
  const setQty = (id, qty) => setLines(prev => prev.map(l => l.productId === id ? { ...l, qty: Math.max(0, Number(qty) || 0) } : l).filter(l => l.qty > 0));
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

  // Clona las cantidades de un pedido; los precios se DERIVAN de la lista
  // vigente al escalón de HOY (jamás se copian precios viejos). Productos
  // borrados se omiten. Base de "repetir último" y "duplicar histórico".
  const loadFromSale = (sale, label) => {
    if (!sale) return;
    const newLines = (sale.items || [])
      .map(it => {
        const p = products.find(pr => pr.id === it.productId && !pr.isDeleted);
        if (!p) return null;
        return { productId: p.id, qty: Number(it.qty) || 1 };
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
      exchangeRate: rate, // FX efectivo (día + buffer) con el que se registró
      listVersion: lista?.version || "", // trazabilidad RN-11/12
      ...(escalon ? { escalonDesde: escalon.desde } : {}),
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

    // Cierre del lazo con la tasa de cierre (§9, ajuste 1 del gate F5):
    if (armandoQuote && setQuotes) {
      // Armado desde el presupuesto → GANADO con saleId linkeado, solo.
      setQuotes(prev => prev.map(x => x.id === armandoQuote.id ? marcarGanado(x, { saleId, fecha: saleData.date }) : x));
      logAudit?.("update", "quote", armandoQuote.id, "Presupuesto GANADO (pedido armado desde el Cotizador)");
      setArmandoQuote(null);
    } else if (setQuotes) {
      // Red inversa: el vendedor entró por acá pero el cliente tiene un
      // presupuesto abierto con totales parecidos — preguntar antes de dejar
      // el dato huérfano (vencidos incluidos: compró tarde también es ganado).
      const candidato = (quotes || []).find(q =>
        q.estado === "emitido" && q.clienteId === client.id && q.totalUnidades > 0 &&
        Math.abs(q.totalUnidades - totalUnits) / q.totalUnidades <= 0.2);
      if (candidato && window.confirm(
        `Este cliente tiene un presupuesto abierto de ${candidato.totalUnidades}u (${formatMoney(candidato.totalARS)}${presupuestoVencido(candidato) ? ", vencido" : ""}). ¿Este pedido lo cierra? Aceptar lo marca GANADO y lo linkea.`
      )) {
        setQuotes(prev => prev.map(x => x.id === candidato.id ? marcarGanado(x, { saleId, fecha: saleData.date }) : x));
        logAudit?.("update", "quote", candidato.id, "Presupuesto GANADO (linkeado desde pedido mayorista)");
      }
    }

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
          {/* Cliente (F5: sin tiers — el precio lo determina el volumen del pedido) */}
          <Card style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <Select label="Cliente mayorista" value={clientId}
                  options={mayoristas.map(c => ({ value: c.id, label: c.businessName || c.name }))}
                  onChange={e => { setClientId(e.target.value); setLines([]); }} />
              </div>
              {client && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                  <span style={{ background: T.primarySoft, color: T.primary, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>
                    Lista {lista?.version || "—"}{escalon ? ` · escalón ${escalon.desde}${escalon.hasta != null ? `–${escalon.hasta}` : "+"}` : ""}
                  </span>
                  {lastOrder && <Btn variant="secondary" onClick={repeatLast}>🔁 Repetir último pedido</Btn>}
                  {clientOrders.length > 1 && <Btn variant="secondary" onClick={() => setHistoryOpen(true)}>🗂 Duplicar un pedido…</Btn>}
                </div>
              )}
            </div>
            {!lista && (
              <div style={{ color: T.red, fontSize: 13 }}>⛔ No hay lista de precios publicada — publicala en <b>🏷️ Lista de precios</b> para poder registrar pedidos.</div>
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

          {/* Checklist del presupuesto en armado (ajuste 1 gate F5) */}
          {armandoQuote && (
            <Card style={{ marginBottom: 14, border: `1px solid ${T.primary}66`, background: `${T.primary}08` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, color: T.primary, fontSize: 13 }}>
                  🧾 Armando presupuesto: {armandoQuote.clienteNombre || "sin cliente"} · {armandoQuote.totalUnidades}u · {formatMoney(armandoQuote.totalARS)}
                </div>
                <button onClick={() => setArmandoQuote(null)} style={{
                  border: "none", background: "transparent", color: T.textMuted, cursor: "pointer", fontSize: 14,
                }}>✕ cancelar armado</button>
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>
                Elegí los sabores de cada modelo con el buscador — al registrar, el presupuesto queda GANADO y linkeado solo.
              </div>
              {armandoQuote.lineas.map(l => {
                const cargado = cargadoPorModelo.get(l.modeloId) || 0;
                const completo = cargado >= l.qty;
                return (
                  <div key={l.modeloId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: completo ? T.green : T.text, fontWeight: 600, flex: 1, minWidth: 140 }}>
                      {completo ? "✅" : "⬜"} {l.qty}× {l.modelo}
                      {l.nota && <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 400 }}> ({l.nota})</span>}
                    </span>
                    <span style={{ fontSize: 11, color: completo ? T.green : T.textMuted, flexShrink: 0 }}>
                      {cargado}/{l.qty}
                    </span>
                    <button onClick={() => setSearch(l.modelo)} style={{
                      border: `1px solid ${T.border}`, background: T.card, color: T.textSub,
                      borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700,
                      padding: "4px 10px", minHeight: isMobile ? 36 : 26, fontFamily: "inherit", flexShrink: 0,
                    }}>🔍 sabores</button>
                  </div>
                );
              })}
            </Card>
          )}

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
                          {(() => { const pr = priceOf(p); return pr ? `USD ${pr.precio} al escalón` : "⛔ fuera de lista"; })()} · stock {p.stock}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </Card>

              {/* Líneas del pedido */}
              {resolvedLines.length > 0 && (
                <Card style={{ marginBottom: 14 }}>
                  {/* F5: sin descuento por volumen aparte — el volumen ES el
                      escalón de la lista (5.2/5.3). Sin precio editable (RN-16). */}
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
                            <div style={{ flex: "0 0 90px", textAlign: "right", fontSize: 13, color: T.textMuted }}>USD {l.unitPriceUSD}</div>
                            <div style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 14, fontWeight: 700, color: T.textSub, overflowWrap: "anywhere" }}>{rate > 0 ? formatMoney(Math.round(l.unitPriceUSD * l.qty * rate)) : "—"}</div>
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
                          <div style={{ width: 84, textAlign: "right", fontSize: 13, color: T.textMuted }}>USD {l.unitPriceUSD}</div>
                          <div style={{ width: 90, textAlign: "right", fontSize: 13, color: T.textSub }}>{rate > 0 ? formatMoney(Math.round(l.unitPriceUSD * l.qty * rate)) : "—"}</div>
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
                  {nudge && (
                    <div style={{
                      marginBottom: 10, padding: "8px 10px", borderRadius: 8,
                      background: `${T.green}12`, border: `1px solid ${T.green}55`,
                      fontSize: 12, color: T.green, fontWeight: 700,
                    }}>
                      🎯 A {nudge.faltan} unidad{nudge.faltan !== 1 ? "es" : ""} del escalón {nudge.desde} — el cliente ahorra {rate > 0 ? formatMoney(Math.round(nudge.ahorroUSD * rate)) : `USD ${nudge.ahorroUSD}`} sobre lo ya cargado.
                    </div>
                  )}
                  {!minCheck.ok && minCheck.reasons.map((r, i) => (
                    <div key={i} style={{ color: T.red, fontSize: 13, marginBottom: 6 }}>⛔ {r}</div>
                  ))}
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
          Se cargan las mismas cantidades con los precios de la lista vigente de HOY (no los de aquel día).
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
