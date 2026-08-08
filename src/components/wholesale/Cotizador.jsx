// Cotizador.jsx — 🧮 presupuestos mayoristas (Pricing Engine F5).
//
// El flujo real: la lista completa ya está en el teléfono del cliente → el
// cliente contesta qué quiere, texto libre → el VENDEDOR lo carga acá → sale
// el presupuesto. No hay autoservicio.
//
// CARGA RÁPIDA (spec g de Gustavo — criterio de aceptación: 5 líneas en <30
// segundos, sin mouse):
//   · UN input, siempre enfocado. "10 ice king" o "ice king 10" → Enter →
//     línea agregada, foco de vuelta al input vacío. Ese es el ciclo.
//   · Autocompletado por MODELO (se cotiza a nivel modelo, punto h);
//     3 caracteres filtran; prioriza empieza-con sobre contiene.
//   · Mismo modelo dos veces ⇒ SUMA (no duplica líneas).
//   · Sabores del cliente = NOTA libre de la línea (detalle de preparación).
//   · Total SIEMPRE visible: unidades, escalón, nudge PARA EL VENDEDOR (f),
//     USD, ARS, y margen interno (k).
// Parseo de mensajes pegados: DESCARTADO para v1 (anotado v1.1: si se hace,
// produce borrador para revisar, nunca commitea solo).
import { useMemo, useRef, useState } from "react";
import { useResponsive } from "../../App.jsx";
import { Card, Btn, MiniBtn, Select, Badge, useToast, Toast } from "../UI.jsx";
import { T } from "../../theme.js";
import { useAppContext } from "../../AppContext.js";
import { uid, formatMoney, formatDate } from "../../helpers.js";
import { listaVigente } from "../../lib/priceLists.js";
import {
  parseLineaRapida, buscarModelos, agregarLinea, cotizar,
  resolverFx, divergenciaFxConLista, emitirPresupuesto, presupuestoTexto,
  presupuestoVencido, marcarGanado, marcarPerdido, MOTIVOS_NO_CIERRE,
} from "../../lib/cotizador.js";

const MAX_SUGERENCIAS = 6;

export function Cotizador({
  clients = [], products = [], quotes = [], setQuotes,
  priceLists = [], pricingPolicy = null, logAudit,
}) {
  const { isMobile } = useResponsive();
  const { exchangeRate, currentUser } = useAppContext();
  const inputRef = useRef(null);
  const [texto, setTexto] = useState("");
  const [selIdx, setSelIdx] = useState(0);
  const [lineas, setLineas] = useState([]);
  const [clienteId, setClienteId] = useState("");
  const [fxFuente, setFxFuente] = useState("sistema");
  const [fxManual, setFxManual] = useState("");
  const [fxMep, setFxMep] = useState(0);
  const [fxError, setFxError] = useState("");
  const [motivoAbierto, setMotivoAbierto] = useState(null); // quoteId con selector de motivo
  const [toast, showToast] = useToast(3200);

  const lista = useMemo(() => listaVigente(priceLists), [priceLists]);
  const mayoristas = useMemo(
    () => clients.filter(c => c && !c.isDeleted && c.type === "mayorista"),
    [clients]
  );
  // Stock por modelo (aviso "no alcanza" — insumo del motivo de no-cierre stock)
  const stockPorModelo = useMemo(() => {
    const m = new Map();
    for (const p of products) {
      if (!p || p.isDeleted) continue;
      const clave = `${p.brand}|${p.model}`;
      m.set(clave, (m.get(clave) || 0) + (Number(p.stock) || 0));
    }
    return m;
  }, [products]);

  const cotizacion = useMemo(
    () => cotizar({ lineas, lista, politica: pricingPolicy }),
    [lineas, lista, pricingPolicy]
  );

  // ---- FX ----
  const fxResuelto = useMemo(() => resolverFx({
    fuenteId: fxFuente,
    valorFuente: fxFuente === "mep" ? fxMep : 0,
    valorManual: Number(fxManual) || 0,
    sistemaValor: Number(exchangeRate) || 0,
    politica: pricingPolicy,
    elegidoPor: currentUser?.name || "",
  }), [fxFuente, fxMep, fxManual, exchangeRate, pricingPolicy, currentUser]);

  const divergencia = useMemo(
    () => (fxResuelto.ok
      ? divergenciaFxConLista(fxResuelto.fx.valor, lista, pricingPolicy?.umbralRecalculoPct ?? 0.03)
      : null),
    [fxResuelto, lista, pricingPolicy]
  );

  const elegirFuente = (id) => {
    setFxFuente(id);
    setFxError("");
    if (id === "mep" && !(fxMep > 0)) {
      fetch("https://dolarapi.com/v1/dolares/bolsa")
        .then(r => r.json())
        .then(d => { if (d?.venta) setFxMep(Number(d.venta)); })
        .catch(() => setFxError("No se pudo traer el MEP — probá de nuevo o usá el del sistema."));
    }
  };

  // ---- Carga rápida ----
  const { qty: qtyParse, consulta } = parseLineaRapida(texto);
  const sugerencias = useMemo(
    () => (consulta.length >= 1 ? buscarModelos(consulta, lista).slice(0, MAX_SUGERENCIAS) : []),
    [consulta, lista]
  );

  const agregar = (fila) => {
    if (!fila || !(qtyParse > 0)) return;
    setLineas(prev => agregarLinea(prev, { modeloId: fila.id, qty: qtyParse }));
    setTexto("");
    setSelIdx(0);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelIdx(i => Math.min(i + 1, sugerencias.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); agregar(sugerencias[selIdx] || sugerencias[0]); }
    else if (e.key === "Escape") { setTexto(""); setSelIdx(0); }
  };

  const mutarLinea = (modeloId, cambios) =>
    setLineas(prev => prev.map(l => (l.modeloId === modeloId ? { ...l, ...cambios } : l)));
  const quitarLinea = (modeloId) => {
    setLineas(prev => prev.filter(l => l.modeloId !== modeloId));
    inputRef.current?.focus();
  };

  // ---- Emitir ----
  const emitir = () => {
    setFxError("");
    if (!cotizacion.ok) return;
    if (!fxResuelto.ok) { setFxError(fxResuelto.motivo); return; }
    const cliente = mayoristas.find(c => c.id === clienteId) || null;
    const quote = emitirPresupuesto({
      id: uid(),
      cotizacion, lista, politica: pricingPolicy,
      fx: fxResuelto.fx,
      cliente,
      fecha: new Date().toISOString(),
      autor: currentUser?.name || "",
    });
    setQuotes(prev => [quote, ...(prev || [])]);
    const txt = presupuestoTexto(quote, { nudge: cotizacion.nudge });
    navigator.clipboard?.writeText(txt).catch(() => {});
    if (logAudit) logAudit("create", "quote", quote.id, `Emitió presupuesto ${quote.totalUnidades}u · ${formatMoney(quote.totalARS)} · lista ${quote.listVersion}`);
    setLineas([]);
    setTexto("");
    inputRef.current?.focus();
    showToast("✅ Presupuesto emitido y copiado — pegalo en WhatsApp");
  };

  const copiarQuote = (q) => {
    navigator.clipboard?.writeText(presupuestoTexto(q)).then(() => showToast("📋 Copiado")).catch(() => {});
  };
  const ganar = (q) => {
    setQuotes(prev => prev.map(x => (x.id === q.id ? marcarGanado(x, { fecha: new Date().toISOString() }) : x)));
    if (logAudit) logAudit("update", "quote", q.id, "Presupuesto GANADO");
    showToast("✅ Ganado — cargá el pedido real en Pedido mayorista al armarlo");
  };
  const perder = (q, motivo) => {
    setQuotes(prev => prev.map(x => (x.id === q.id ? marcarPerdido(x, { motivo, fecha: new Date().toISOString() }) : x)));
    setMotivoAbierto(null);
    if (logAudit) logAudit("update", "quote", q.id, `Presupuesto PERDIDO (${motivo})`);
    showToast("Registrado — eso alimenta la tasa de cierre");
  };

  const recientes = useMemo(() => (quotes || []).slice(0, 10), [quotes]);
  const rate = fxResuelto.ok ? fxResuelto.fx.valor * (1 + (Number(pricingPolicy?.bufferFxPct) || 0)) : 0;

  const estadoChip = (q) => {
    if (q.estado === "ganado") return <Badge color={T.green}>ganado</Badge>;
    if (q.estado === "perdido") return <Badge color={T.red}>perdido · {MOTIVOS_NO_CIERRE.find(m => m.id === q.motivoNoCierre)?.label || q.motivoNoCierre}</Badge>;
    if (presupuestoVencido(q)) return <Badge color={T.amber}>vencido</Badge>;
    return <Badge color={T.blue || "#1F5DB8"}>emitido</Badge>;
  };

  if (!lista) {
    return (
      <div>
        <h2 style={{ color: T.text, margin: "0 0 12px", fontSize: isMobile ? 20 : 22 }}>🧮 Cotizador</h2>
        <Card>
          <div style={{ textAlign: "center", color: T.textMuted, padding: isMobile ? "32px 16px" : 48 }}>
            No hay lista de precios publicada — el cotizador cotiza SIEMPRE contra
            la lista vigente (RN-12).<br />Publicala desde <b>🏷️ Lista de precios</b>.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ color: T.text, margin: 0, fontSize: isMobile ? 20 : 22 }}>🧮 Cotizador</h2>
          <span style={{ fontSize: 12, color: T.textMuted }}>Lista {lista.version} · tipeá "10 ice king" y Enter</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexDirection: isMobile ? "column" : "row", alignItems: "flex-start" }}>
        {/* ---- Columna de carga ---- */}
        <div style={{ flex: "1 1 60%", minWidth: 0, width: isMobile ? "100%" : "auto" }}>
          <Card style={{ marginBottom: 12 }}>
            <input
              ref={inputRef}
              autoFocus
              value={texto}
              onChange={e => { setTexto(e.target.value); setSelIdx(0); }}
              onKeyDown={onKeyDown}
              placeholder='Cantidad y modelo: "10 ice king" o "ice king 10" · Enter agrega'
              style={{
                width: "100%", boxSizing: "border-box",
                padding: isMobile ? "13px 14px" : "12px 14px",
                minHeight: isMobile ? 48 : 44,
                background: T.bg, border: `2px solid ${T.primary}`, borderRadius: 10,
                color: T.text, fontSize: 16, outline: "none", fontFamily: "inherit",
              }}
            />
            {sugerencias.length > 0 && (
              <div style={{ marginTop: 6 }}>
                {sugerencias.map((f, i) => (
                  <div
                    key={f.id}
                    onMouseDown={(e) => { e.preventDefault(); agregar(f); }}
                    style={{
                      padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                      background: i === selIdx ? `${T.primary}15` : "transparent",
                      border: `1px solid ${i === selIdx ? T.primary : "transparent"}`,
                      display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 14, color: T.text }}>
                      <b>{qtyParse}×</b> {f.marca} <b>{f.modelo}</b>
                    </span>
                    <span style={{ fontSize: 11, color: T.textFaint, flexShrink: 0 }}>
                      stock {stockPorModelo.get(f.id) || 0} · Enter ↵
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Líneas cargadas */}
          {cotizacion.lineas.length > 0 && (
            <Card style={{ marginBottom: 12 }}>
              {cotizacion.lineas.map((l, i) => {
                const stock = stockPorModelo.get(l.modeloId) || 0;
                const sinStock = l.qty > stock;
                return (
                  <div key={l.modeloId} style={{
                    display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                    padding: "9px 0", borderBottom: i < cotizacion.lineas.length - 1 ? `1px solid ${T.borderSoft}` : "none",
                  }}>
                    <input
                      type="number" min="1" value={l.qty}
                      onChange={e => mutarLinea(l.modeloId, { qty: Number(e.target.value) || 0 })}
                      style={{
                        width: 64, padding: "8px 6px", textAlign: "center", borderRadius: 8,
                        border: `1px solid ${T.border}`, fontSize: 15, fontFamily: "inherit",
                        minHeight: isMobile ? 44 : 36, boxSizing: "border-box",
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
                        {l.enLista ? `${l.marca} ${l.modelo}` : l.modeloId}
                        {sinStock && <span style={{ fontSize: 10, color: T.amber, fontWeight: 700 }}> · stock {stock} ⚠</span>}
                      </div>
                      <input
                        value={l.nota || ""}
                        onChange={e => mutarLinea(l.modeloId, { nota: e.target.value })}
                        placeholder="sabores / nota (texto libre, va al presupuesto)"
                        style={{
                          width: "100%", boxSizing: "border-box", marginTop: 3,
                          padding: "5px 8px", borderRadius: 6, border: `1px dashed ${T.borderSoft}`,
                          fontSize: isMobile ? 16 : 12, color: T.textSub, background: "transparent", fontFamily: "inherit",
                        }}
                      />
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: T.green, fontSize: 14 }}>
                        {rate > 0 ? formatMoney(l.precioUSD * rate) : `USD ${l.precioUSD}`}
                      </div>
                      <div style={{ fontSize: 10, color: T.textFaint }}>c/u · USD {l.precioUSD}</div>
                    </div>
                    <MiniBtn color={T.red} onClick={() => quitarLinea(l.modeloId)}>✕</MiniBtn>
                  </div>
                );
              })}
            </Card>
          )}

          {/* FX — fuentes configuradas; manual registrado con banda (reglas a-c) */}
          <Card style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, marginBottom: 8 }}>DÓLAR DEL PRESUPUESTO</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {[
                { id: "sistema", label: `Blue sistema ${Number(exchangeRate) > 0 ? `$${exchangeRate}` : "—"}` },
                { id: "mep", label: `MEP ${fxMep > 0 ? `$${fxMep}` : ""}` },
                { id: "manual", label: "Manual" },
              ].map(f => (
                <button key={f.id} onClick={() => elegirFuente(f.id)} style={{
                  padding: "8px 14px", borderRadius: 18, minHeight: 38,
                  border: `1px solid ${fxFuente === f.id ? T.primary : T.border}`,
                  background: fxFuente === f.id ? `${T.primary}15` : "transparent",
                  color: fxFuente === f.id ? T.primary : T.textMuted,
                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>{f.label}</button>
              ))}
              {fxFuente === "manual" && (
                <input
                  type="number" value={fxManual} onChange={e => setFxManual(e.target.value)}
                  placeholder="valor"
                  style={{
                    width: 100, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`,
                    fontSize: isMobile ? 16 : 14, fontFamily: "inherit", minHeight: 38, boxSizing: "border-box",
                  }}
                />
              )}
            </div>
            {fxFuente === "manual" && (
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>
                El valor manual queda REGISTRADO en el presupuesto (valor, fuente y quién) y
                pasa la banda de sanidad del {Math.round((pricingPolicy?.fxSanidadPct ?? 0.1) * 100)}%.
              </div>
            )}
            {(fxError || (!fxResuelto.ok && fxResuelto.motivo)) && (
              <div style={{ fontSize: 12, color: T.red, fontWeight: 600, marginTop: 6 }}>⛔ {fxError || fxResuelto.motivo}</div>
            )}
            {divergencia && (
              <div style={{
                marginTop: 8, padding: "7px 10px", borderRadius: 8, fontSize: 12,
                background: `${T.amber}12`, border: `1px solid ${T.amber}55`, color: T.amber, fontWeight: 600,
              }}>
                ⚠️ El cliente vio la lista a ${divergencia.fxLista} — este presupuesto usa
                ${fxResuelto.fx.valor} ({(divergencia.pct * 100).toFixed(1)}% de diferencia): los números no le van a cerrar.
              </div>
            )}
          </Card>

          {/* Cliente (opcional) */}
          <Card style={{ marginBottom: 12 }}>
            <Select
              label="Cliente (opcional — puede ser un prospecto todavía)"
              value={clienteId}
              onChange={e => setClienteId(e.target.value)}
              options={mayoristas.map(c => ({ value: c.id, label: c.businessName || c.name }))}
            />
          </Card>
        </div>

        {/* ---- Panel TOTAL SIEMPRE VISIBLE (g) ---- */}
        <div style={{
          flex: "1 1 34%", minWidth: isMobile ? 0 : 270, width: isMobile ? "100%" : "auto",
          position: isMobile ? "static" : "sticky", top: 12,
        }}>
          <Card style={{ border: `2px solid ${T.primary}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 13, color: T.textMuted, fontWeight: 700 }}>
                {cotizacion.totalUnidades} unidades
              </span>
              <span style={{ fontSize: 12, color: T.textMuted }}>
                {cotizacion.escalon
                  ? `escalón ${cotizacion.escalon.desde}${cotizacion.escalon.hasta != null ? `–${cotizacion.escalon.hasta}` : "+"}`
                  : cotizacion.bajoMinimo ? "bajo el mínimo" : "—"}
              </span>
            </div>
            <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 800, color: T.text, margin: "6px 0 2px" }}>
              {rate > 0 && cotizacion.totalUSD > 0 ? formatMoney(cotizacion.totalUSD * rate) : "—"}
            </div>
            <div style={{ fontSize: 12, color: T.textMuted }}>
              USD {cotizacion.totalUSD}{rate > 0 ? ` · dólar $${fxResuelto.fx?.valor} +${Math.round((pricingPolicy?.bufferFxPct || 0) * 100)}%` : ""}
            </div>

            {/* Nudge — PARA EL VENDEDOR, mientras carga (f) */}
            {cotizacion.nudge && (
              <div style={{
                marginTop: 10, padding: "8px 10px", borderRadius: 8,
                background: `${T.green}12`, border: `1px solid ${T.green}55`,
                fontSize: 12, color: T.green, fontWeight: 700,
              }}>
                🎯 A {cotizacion.nudge.faltan} unidad{cotizacion.nudge.faltan !== 1 ? "es" : ""} del escalón {cotizacion.nudge.desde}
                {cotizacion.nudge.hasta != null ? `–${cotizacion.nudge.hasta}` : "+"} — el cliente ahorra{" "}
                {rate > 0 ? formatMoney(cotizacion.nudge.ahorroUSD * rate) : `USD ${cotizacion.nudge.ahorroUSD}`} sobre lo ya cargado.
              </div>
            )}

            {/* (k) — interno, jamás viaja en el texto */}
            {cotizacion.totalUSD > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: T.textFaint }}>
                utilidad USD {cotizacion.utilidadUSD} · margen {(cotizacion.margenPct * 100).toFixed(1)}% (interno)
              </div>
            )}

            {cotizacion.motivosBloqueo.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: T.red, fontWeight: 600 }}>
                {cotizacion.motivosBloqueo.map((m, i) => <div key={i}>⛔ {m}</div>)}
              </div>
            )}

            <Btn
              onClick={emitir}
              disabled={!cotizacion.ok || !fxResuelto.ok}
              style={{ width: "100%", marginTop: 12, opacity: !cotizacion.ok || !fxResuelto.ok ? 0.5 : 1 }}
            >
              🧾 Emitir presupuesto (copia el texto)
            </Btn>
            <div style={{ fontSize: 10, color: T.textFaint, marginTop: 6, textAlign: "center" }}>
              FX congelado por {pricingPolicy?.vigenciaHoras ?? 48} hs al emitir · lista {lista.version}
            </div>
          </Card>
        </div>
      </div>

      {/* ---- Presupuestos recientes + no-cierre (§9) ---- */}
      {recientes.length > 0 && (
        <Card style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, color: T.text, marginBottom: 8 }}>Presupuestos recientes</div>
          {recientes.map((q, i) => (
            <div key={q.id} style={{
              display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
              padding: "9px 0", borderBottom: i < recientes.length - 1 ? `1px solid ${T.borderSoft}` : "none",
            }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                  {q.clienteNombre || "Sin cliente"} · {q.totalUnidades}u · {formatMoney(q.totalARS)}
                </div>
                <div style={{ fontSize: 11, color: T.textMuted }}>
                  {formatDate(q.emitidoAt)} · lista {q.listVersion} · dólar ${q.fx?.valor} ({q.fx?.fuente}{q.fx?.elegidoPor ? ` — ${q.fx.elegidoPor}` : ""})
                </div>
              </div>
              {estadoChip(q)}
              {q.estado === "emitido" && (
                <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
                  <MiniBtn color={T.textMuted} onClick={() => copiarQuote(q)}>📋</MiniBtn>
                  <MiniBtn color={T.green} onClick={() => ganar(q)}>✅ Ganado</MiniBtn>
                  {motivoAbierto === q.id ? (
                    MOTIVOS_NO_CIERRE.map(m => (
                      <MiniBtn key={m.id} color={T.red} onClick={() => perder(q, m.id)}>{m.label}</MiniBtn>
                    ))
                  ) : (
                    <MiniBtn color={T.red} onClick={() => setMotivoAbierto(q.id)}>❌ Perdido</MiniBtn>
                  )}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      <Toast message={toast} />
    </div>
  );
}
