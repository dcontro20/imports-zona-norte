import { useMemo, useState } from "react";
import { useResponsive } from "../../App.jsx";
import { Card, Btn, Badge, Modal, MiniBtn } from "../UI.jsx";
import { T } from "../../theme.js";
import { useAppContext } from "../../AppContext.js";
import { formatMoney, formatDate } from "../../helpers.js";
import { productosParaMotor } from "../../lib/pricingAdapter.js";
import {
  listaVigente, construirSnapshot, siguienteVersion, puedePublicar, driftContraVigente,
  compararSnapshots, alertasDeHoy,
} from "../../lib/priceLists.js";
import { listaEscalonesText, listaEscalonesItems } from "../../lib/wholesaleMessage.js";

// 🏷️ Lista de precios (Pricing Engine F4). La pantalla muestra la lista
// PUBLICADA (snapshot inmutable, RN-12) — no un cálculo en vivo: lo que se ve
// es exactamente lo que se compartió y lo que cotizará el cotizador.
//
//  - Publicar corre el motor sobre los costos de HOY: versionado automático
//    (v<año-mes>[.n]), RN-05 como puerta (piso violado ⇒ no publica, con
//    motivos), estabilidad §5.17 contra la vigente.
//  - El aviso de drift (RN-13) dice cuándo la vigente quedó desfasada.
//  - "Copiar para WhatsApp" manda TODOS los escalones + mezcla libre escrita
//    (definición comercial de Gustavo) con versión, fecha y disclaimer del
//    dólar (reglas de Diego). Sin tiers, sin datos internos.
//  - DOS listas con los MISMOS precios (2026-08-14): 🗂️ catálogo completo (lo
//    que se manda siempre, con la promesa de reposición) y ⚡ stock inmediato.
//    La pantalla muestra siempre todo: los modelos sin stock quedan atenuados
//    y marcados "a pedido", nunca ocultos — lo que no está hoy igual se vende.
//  - 👁 "Ver costos" (apagado por default) agrega costo proveedor, costo real y
//    margen del primer escalón. Es una vista INTERNA: esos números no viajan
//    nunca en el mensaje (hay test que lo fija).

// Grupo de chips segmentado (mismo aspecto que el selector de moneda original).
function Pills({ value, onChange, options }) {
  return (
    <div style={{ display: "flex", border: `1px solid ${T.border}`, borderRadius: 20, overflow: "hidden" }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          padding: "8px 14px", minHeight: 38, border: "none", cursor: "pointer",
          background: value === o.value ? T.primary : "transparent",
          color: value === o.value ? "#fff" : T.textMuted,
          fontSize: 12, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap",
        }}>{o.label}</button>
      ))}
    </div>
  );
}

export function PriceListScreen({
  products = [], priceLists = [], setPriceLists, pricingPolicy = null, logAudit,
}) {
  const { isMobile } = useResponsive();
  const { exchangeRate, currentUser } = useAppContext();
  const [copied, setCopied] = useState(false);
  const [motivosBloqueo, setMotivosBloqueo] = useState(null);
  // Moneda del texto compartible: ARS convierte al dólar de hoy + buffer;
  // USD manda la lista en dólares (no necesita cotización, y la conversión
  // se explica). Dos versiones porque el cliente pide una u otra.
  const [moneda, setMoneda] = useState("ARS");
  // Qué lista se copia: 🗂️ catálogo completo (default — es el que se manda
  // siempre) o ⚡ solo stock inmediato. Se combina con la moneda.
  const [modo, setModo] = useState("catalogo");
  // Vista interna de costos. Arranca SIEMPRE apagada y no se persiste: la
  // pantalla se muestra con el cliente al lado, y un toggle recordado entre
  // sesiones es exactamente el que se olvida prendido.
  const [verCostos, setVerCostos] = useState(false);
  // Publicar deja de ser a ciegas: primero se ve QUÉ cambia (preview), recién
  // después se confirma. { snapshot, cmp } mientras está abierto.
  const [preview, setPreview] = useState(null);

  const vigente = useMemo(() => listaVigente(priceLists), [priceLists]);

  // Estado de los datos de HOY contra la vigente (drift RN-13 + publicables).
  const { productosMotor, inconsistencias } = useMemo(
    () => productosParaMotor(products, { fx: exchangeRate }),
    [products, exchangeRate]
  );
  const drift = useMemo(
    () => driftContraVigente({ vigente, productosMotor, politica: pricingPolicy }),
    [vigente, productosMotor, pricingPolicy]
  );
  const sinCosto = productosMotor.filter(p => !(Number(p.costo) > 0));

  // Paso 1 de publicar: construir el candidato y mostrar qué cambia. No
  // persiste nada — la versión se genera recién al confirmar, y solo si hay
  // algo que publicar (una lista idéntica con número nuevo es ruido).
  const prepararPublicacion = () => {
    setMotivosBloqueo(null);
    const snapshot = construirSnapshot({
      productosMotor,
      politica: pricingPolicy,
      version: siguienteVersion(priceLists, new Date().toISOString()),
      fecha: new Date().toISOString(),
      autor: currentUser?.name || "",
      base: vigente,
      fx: exchangeRate, // referencia para la divergencia del cotizador (regla d)
    });
    const gate = puedePublicar(snapshot);
    if (!gate.ok) { setMotivosBloqueo(gate.motivos); return; } // RN-05: exige decisión humana
    setPreview({ snapshot, cmp: compararSnapshots(vigente, snapshot) });
  };

  const confirmarPublicacion = () => {
    const { snapshot } = preview;
    setPriceLists(prev => [...(prev || []), snapshot]);
    if (logAudit) logAudit("create", "priceList", snapshot.id, `Publicó lista mayorista ${snapshot.version} (${snapshot.filas.length} modelos)`);
    setPreview(null);
  };

  // Atajo a los costos y vuelta: el costo es el único dato de entrada del
  // motor, así que corregirlo no puede costar navegar a Stock y buscar.
  const editarCostos = () => {
    try { localStorage.setItem("izn:abrirCostos", "priceList"); } catch {}
    window.dispatchEvent(new CustomEvent("izn:navigate", { detail: { page: "products" } }));
  };

  const copy = () => {
    const txt = listaEscalonesText(vigente, { products, exchangeRate, moneda, modo });
    if (!txt) return;
    navigator.clipboard?.writeText(txt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }).catch(() => {});
  };

  // Grilla en pesos al FX del día + buffer de la política congelada en la
  // lista (la MISMA conversión del texto compartido y del cotizador).
  const rate = (Number(exchangeRate) || 0) * (1 + (Number(vigente?.politica?.bufferFxPct) || 0));
  const stockPorModelo = useMemo(() => {
    const m = new Map();
    for (const p of products) {
      if (!p || p.isDeleted) continue;
      const clave = `${p.brand}|${p.model}`;
      m.set(clave, (m.get(clave) || 0) + (Number(p.stock) || 0));
    }
    return m;
  }, [products]);

  // Cuántos modelos lleva cada mensaje. El número al lado del chip evita la
  // sorpresa de mandar una lista con la mitad de los renglones.
  const cuentaCatalogo = vigente?.filas.length || 0;
  const cuentaStock = useMemo(
    () => listaEscalonesItems(vigente, products, { modo: "stock" }).reduce((n, g) => n + g.items.length, 0),
    [vigente, products]
  );
  const puedeCopiar = !!vigente
    && (moneda === "USD" || rate > 0)
    && (modo === "catalogo" ? cuentaCatalogo > 0 : cuentaStock > 0);

  const grupos = useMemo(() => {
    if (!vigente) return [];
    const porMarca = {};
    for (const fila of vigente.filas) (porMarca[fila.marca] = porMarca[fila.marca] || []).push(fila);
    return Object.keys(porMarca).sort((a, b) => a.localeCompare(b)).map(marca => ({
      marca, items: porMarca[marca].slice().sort((a, b) => a.modelo.localeCompare(b.modelo)),
    }));
  }, [vigente]);

  const escalones = vigente?.filas[0]?.precios || [];
  const rango = (e) => (e.hasta == null ? `${e.desde}+` : `${e.desde}–${e.hasta}`);

  // Los PRECIOS de la lista son inmutables (RN-12); las alertas son una lente
  // sobre ellos, evaluada con la política y los datos de HOY — si no, una
  // alerta desafinada sobreviviría hasta la próxima publicación.
  const alertasHoy = useMemo(
    () => (vigente ? alertasDeHoy(vigente, productosMotor, pricingPolicy) : new Map()),
    [vigente, productosMotor, pricingPolicy]
  );

  const badgeAlerta = (fila) => {
    const reglas = new Set((alertasHoy.get(fila.id)?.alertas || []).map(a => a.regla));
    const out = [];
    if (reglas.has("margenAlerta")) out.push(<Badge key="m" color={T.amber}>margen bajo</Badge>);
    if (reglas.has("conflictoCanal")) out.push(<Badge key="c" color={T.red}>canal</Badge>);
    if (reglas.has("margenCliente")) out.push(<Badge key="k" color={T.purple}>margen kiosco</Badge>);
    return out;
  };

  // ---- Vista interna de costos (toggle 👁) -------------------------------
  // Los números que se muestran son los del SNAPSHOT: son los que explican el
  // precio publicado. El costo de HOY se anota al lado solo cuando difiere —
  // ese delta es justamente lo que decide republicar.
  const colCosto = { flex: "0 0 74px", textAlign: "right", fontSize: 11, fontWeight: 700 };
  const anchoTabla = verCostos ? 700 : (isMobile ? 470 : 0);
  const costoHoyPorId = useMemo(
    () => new Map(productosMotor.map(p => [p.id, Number(p.costo) || 0])),
    [productosMotor]
  );
  const usd = (v) => (Number(v) > 0 ? Number(v).toFixed(2) : "—");

  const costosDeFila = (fila) => {
    const hoy = costoHoyPorId.get(fila.id) || 0;
    const movido = hoy > 0 && Math.abs(hoy - Number(fila.costo)) > 1e-9;
    const margen = fila.precios?.[0]?.margenReal;
    const objetivo = fila.precios?.[0]?.margen;
    // Rojo si el margen quedó debajo del objetivo del escalón (la misma lente
    // que el badge "margen bajo", acá con el número a la vista).
    const colorMargen = margen == null ? T.textFaint
      : margen < (Number(objetivo) || 0) - 1e-9 ? T.amber : T.green;
    return (
      <>
        <span style={{ ...colCosto, color: T.textSub }}>
          {usd(fila.costo)}
          {movido && (
            <span style={{ display: "block", fontSize: 9, color: T.amber, fontWeight: 700 }}>
              hoy {usd(hoy)}
            </span>
          )}
        </span>
        <span style={{ ...colCosto, color: T.textSub }}>{usd(fila.costoReal)}</span>
        <span style={{ ...colCosto, color: colorMargen }}>
          {margen == null ? "—" : `${(margen * 100).toFixed(1)}%`}
        </span>
      </>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: T.text, margin: 0, fontSize: isMobile ? 20 : 22 }}>🏷️ Lista de precios</h2>
          {vigente && (
            <span style={{ fontSize: 12, color: T.textMuted }}>
              {vigente.version} · publicada {formatDate(vigente.publishedAt)}{vigente.publishedBy ? ` por ${vigente.publishedBy}` : ""}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Qué lista se copia. Los dos mensajes llevan los MISMOS precios: lo
              que cambia es qué se ofrece y qué se promete. */}
          <Pills
            value={modo}
            onChange={(v) => { setModo(v); setCopied(false); }}
            options={[
              { value: "catalogo", label: `🗂️ Catálogo (${cuentaCatalogo})` },
              { value: "stock", label: `⚡ Stock (${cuentaStock})` },
            ]}
          />
          {/* Selector de moneda del mensaje: el cliente pide una u otra. */}
          <Pills
            value={moneda}
            onChange={(v) => { setMoneda(v); setCopied(false); }}
            options={[{ value: "ARS", label: "$ pesos" }, { value: "USD", label: "USD" }]}
          />
          <Btn onClick={copy} disabled={!puedeCopiar}>
            {copied ? "✅ Copiado" : "📋 Copiar para WhatsApp"}
          </Btn>
        </div>
      </div>

      {/* El único caso en que el botón no puede: pediste stock inmediato y hoy
          no hay nada. Se dice, no se deja un botón muerto sin explicación. */}
      {vigente && modo === "stock" && cuentaStock === 0 && (
        <Card style={{ marginBottom: 12, border: `1px solid ${T.amber}66`, background: `${T.amber}0D` }}>
          <div style={{ fontSize: 13, color: T.text }}>
            Hoy no hay stock inmediato de ningún modelo de la lista — el mensaje de
            entrega inmediata quedaría vacío. Mandá el <b>🗂️ catálogo</b>.
          </div>
        </Card>
      )}

      {/* Sin FX válido NO se convierte ni se comparte: se muestra USD y se
          avisa — un número inventado no lo detecta nadie hasta que un cliente
          lo acepta (cierre pre-F5). */}
      {!(Number(exchangeRate) > 0) && (
        <Card style={{ marginBottom: 12, border: `1px solid ${T.red}66`, background: `${T.red}0D` }}>
          <div style={{ fontSize: 13, color: T.red, fontWeight: 600 }}>
            ⛔ Sin cotización del dólar válida — la lista se muestra en USD y no se puede copiar en pesos.
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
            Esperá la cotización automática o cargala a mano en 💰 Caja. La versión
            <b> USD</b> del mensaje sí se puede compartir: no depende del dólar del día.
          </div>
        </Card>
      )}

      {/* Estado de publicación */}
      <Card style={{
        marginBottom: 12,
        border: `1px solid ${!vigente || drift.necesitaRepublicar ? T.amber + "66" : T.greenBorder || "#B6D4CC"}`,
        background: !vigente || drift.necesitaRepublicar ? `${T.amber}0D` : `${T.green}0D`,
      }}>
        {!vigente ? (
          <div style={{ fontSize: 13, color: T.text }}>
            Todavía no hay lista publicada. El motor deriva los precios de los costos
            cargados en <b>📦 Stock</b> según la <b>🎛️ Política comercial</b>.
          </div>
        ) : drift.necesitaRepublicar ? (
          <div style={{ fontSize: 13, color: T.text }}>
            <b style={{ color: T.amber }}>⚠️ La lista vigente quedó desfasada:</b>{" "}
            {[
              drift.costosMovidos.length > 0 && `${drift.costosMovidos.length} costo${drift.costosMovidos.length !== 1 ? "s" : ""} movido${drift.costosMovidos.length !== 1 ? "s" : ""} más del umbral`,
              drift.nuevos.length > 0 && `${drift.nuevos.length} modelo${drift.nuevos.length !== 1 ? "s" : ""} nuevo${drift.nuevos.length !== 1 ? "s" : ""} con costo`,
              drift.retirados.length > 0 && `${drift.retirados.length} retirado${drift.retirados.length !== 1 ? "s" : ""}`,
              drift.politicaCambio && "la política cambió",
            ].filter(Boolean).join(" · ")}.
          </div>
        ) : (
          <div style={{ fontSize: 13, color: T.green, fontWeight: 600 }}>
            ✓ Lista al día — los costos no se movieron más que el umbral y la política es la misma.
          </div>
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <Btn onClick={prepararPublicacion} variant={!vigente || drift.necesitaRepublicar ? "primary" : "secondary"}>
            {vigente ? "Ver cambios y publicar" : "Publicar lista"}
          </Btn>
          <Btn variant="secondary" onClick={editarCostos}>💲 Editar costos</Btn>
        </div>
        {/* RN-18: los que quedan afuera, POR NOMBRE — saber cuántos son no
            sirve para corregirlos. */}
        {sinCosto.length > 0 && (
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8 }}>
            Sin costo, quedan afuera de la lista (RN-18):{" "}
            {sinCosto.map(p => `${p.marca} ${p.modelo}`).join(" · ")} —{" "}
            <span onClick={editarCostos} style={{ color: T.blue, cursor: "pointer", fontWeight: 700 }}>cargar costo</span>
          </div>
        )}
        {inconsistencias.filter(i => i.tipo === "costo").length > 0 && (
          <div style={{ fontSize: 11, color: T.amber, marginTop: 6 }}>
            ⚠️ Costos mezclados entre sabores (la lista publica el más alto):{" "}
            {inconsistencias.filter(i => i.tipo === "costo").map(i => i.id.replace("|", " ")).join(" · ")} —{" "}
            <span onClick={editarCostos} style={{ textDecoration: "underline", cursor: "pointer", fontWeight: 700 }}>corregir</span>
          </div>
        )}
        {motivosBloqueo && (
          <div style={{
            marginTop: 10, padding: "8px 12px", borderRadius: 8,
            background: `${T.red}12`, border: `1px solid ${T.red}55`, fontSize: 12, color: T.red,
          }}>
            <b>⛔ No se publicó — el piso de margen es bloqueante (RN-05):</b>
            {motivosBloqueo.map((m, i) => <div key={i}>• {m}</div>)}
            <div style={{ marginTop: 4, color: T.textMuted }}>
              Corregí el costo, ajustá la política o discontinuá el producto — decisión humana.
            </div>
          </div>
        )}
      </Card>

      {/* Vista INTERNA. Apagada por default: la lista se muestra en pantalla con
          el cliente al lado y el costo no puede aparecer por descuido. */}
      {vigente && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          {verCostos && (
            <span style={{ fontSize: 11, color: T.amber, alignSelf: "center", marginRight: 10 }}>
              Vista interna — el costo nunca sale en el mensaje al cliente.
            </span>
          )}
          <MiniBtn color={verCostos ? T.amber : T.textMuted} onClick={() => setVerCostos(v => !v)}>
            {verCostos ? "🙈 Ocultar costos" : "👁 Ver costos"}
          </MiniBtn>
        </div>
      )}

      {!vigente ? null : grupos.map(g => (
        <Card key={g.marca} style={{ marginBottom: 12, overflowX: "auto" }}>
          <div style={{ fontWeight: 800, color: T.text, fontSize: isMobile ? 16 : 15, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {g.marca}
          </div>
          <div style={{ minWidth: anchoTabla }}>
            {/* Header de escalones — derivado del snapshot (arreglo, cantidad libre) */}
            <div style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: `2px solid ${T.border}` }}>
              <span style={{ flex: "1 1 130px", minWidth: 110, fontSize: 11, color: T.textMuted, fontWeight: 700 }}>MODELO · unidades →</span>
              {verCostos && (
                <>
                  <span style={{ ...colCosto, color: T.amber }}>COSTO PROV.</span>
                  <span style={{ ...colCosto, color: T.amber }}>COSTO REAL</span>
                  <span style={{ ...colCosto, color: T.amber }}>MARGEN {escalones[0] ? rango(escalones[0]) : ""}</span>
                </>
              )}
              {escalones.map(e => (
                <span key={e.desde} style={{ flex: "0 0 84px", textAlign: "right", fontSize: 11, color: T.textMuted, fontWeight: 700 }}>{rango(e)}</span>
              ))}
            </div>
            {g.items.map((fila, i) => {
              const stock = stockPorModelo.get(fila.id) || 0;
              return (
                <div key={fila.id} style={{
                  display: "flex", gap: 8, alignItems: "center", padding: "10px 0",
                  borderBottom: i < g.items.length - 1 ? `1px solid ${T.borderSoft}` : "none",
                  opacity: stock > 0 ? 1 : 0.55,
                }}>
                  <span style={{ flex: "1 1 130px", minWidth: 110, fontSize: isMobile ? 14 : 13, color: T.text, overflowWrap: "anywhere" }}>
                    {fila.modelo}
                    {/* "a pedido", no "sin stock": el modelo se vende igual — se
                        consigue. La lista dejó de ser el inventario. */}
                    {stock <= 0 && <span style={{ fontSize: 10, color: T.textFaint }}> · a pedido</span>}
                    <span style={{ display: "inline-flex", gap: 4, marginLeft: 6 }}>{badgeAlerta(fila)}</span>
                  </span>
                  {verCostos && costosDeFila(fila)}
                  {fila.precios.map(e => (
                    <span key={e.desde} style={{ flex: "0 0 84px", textAlign: "right" }}>
                      <span style={{ display: "block", fontWeight: 800, fontSize: isMobile ? 14 : 13, color: T.green }}>
                        {rate > 0 ? formatMoney(e.precio * rate) : "—"}
                      </span>
                      <span style={{ display: "block", fontSize: 10, color: T.textFaint }}>USD {e.precio}</span>
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {/* Preview de publicación: qué cambia respecto de la vigente. Si no
          cambia nada, se dice y NO se genera versión. */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={
        preview?.cmp?.hayCambios ? `Publicar ${preview.snapshot.version}` : "No hay cambios para publicar"
      }>
        {preview && !preview.cmp.hayCambios && (
          <div style={{ fontSize: 13, color: T.textSub }}>
            Los costos, el catálogo y la política son los mismos que los de{" "}
            <b>{vigente?.version}</b>. Publicar generaría una lista idéntica con número
            distinto — no se hace: el cliente ya tiene la vigente y el historial queda limpio.
          </div>
        )}
        {preview?.cmp?.hayCambios && (
          <div>
            {preview.cmp.cambios.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: T.text, fontSize: 13, marginBottom: 6 }}>
                  Cambian de precio ({preview.cmp.cambios.length})
                </div>
                {preview.cmp.cambios.map(c => (
                  <div key={c.id} style={{ padding: "6px 0", borderBottom: `1px solid ${T.borderSoft}` }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1, minWidth: 120 }}>
                        {c.marca} {c.modelo}
                      </span>
                      {c.deltaPct != null && (
                        <span style={{ fontSize: 12, fontWeight: 800, color: c.deltaPct > 0 ? T.red : T.green, flexShrink: 0 }}>
                          {c.deltaPct > 0 ? "▲" : "▼"} {Math.abs(c.deltaPct * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: T.textMuted, overflowWrap: "anywhere" }}>
                      USD {c.antes.join(" / ")} → <b style={{ color: T.text }}>{c.ahora.join(" / ")}</b>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {preview.cmp.entran.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: T.green, fontSize: 13, marginBottom: 4 }}>
                  Entran a la lista ({preview.cmp.entran.length})
                </div>
                {preview.cmp.entran.map(f => (
                  <div key={f.id} style={{ fontSize: 12, color: T.textSub }}>
                    • {f.marca} {f.modelo} — USD {f.precios.join(" / ")}
                  </div>
                ))}
              </div>
            )}
            {preview.cmp.salen.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: T.red, fontSize: 13, marginBottom: 4 }}>
                  Salen de la lista ({preview.cmp.salen.length})
                </div>
                {preview.cmp.salen.map(f => (
                  <div key={f.id} style={{ fontSize: 12, color: T.textSub }}>• {f.marca} {f.modelo}</div>
                ))}
              </div>
            )}
            {preview.cmp.politicaCambio && (
              <div style={{ fontSize: 12, color: T.blue, marginBottom: 12 }}>
                🎛️ La política comercial cambió — la lista nueva la congela (mínimos,
                vigencia y márgenes que declara el mensaje).
              </div>
            )}
            {preview.cmp.cambios.length === 0 && preview.cmp.entran.length === 0 && preview.cmp.salen.length === 0 && (
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 12 }}>
                Ningún precio se mueve.
              </div>
            )}
            <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 12 }}>
              Al publicar, {vigente ? <>la <b>{vigente.version}</b> queda archivada (las cotizaciones
              viejas siguen apuntando a ella) y</> : null} la nueva pasa a ser la que cotiza el
              🧮 Cotizador y la que se comparte por WhatsApp.
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn variant="secondary" onClick={() => setPreview(null)}>
            {preview?.cmp?.hayCambios ? "Cancelar" : "Cerrar"}
          </Btn>
          {preview?.cmp?.hayCambios && (
            <Btn onClick={confirmarPublicacion}>Publicar {preview.snapshot.version}</Btn>
          )}
        </div>
      </Modal>

      {vigente && (
        <p style={{ fontSize: 12, color: T.textFaint, marginTop: 4 }}>
          {vigente.filas.length} modelos ({cuentaStock} con stock hoy) · dólar ${exchangeRate}{Number(vigente.politica?.bufferFxPct) > 0 ? ` +${Math.round(vigente.politica.bufferFxPct * 100)}% buffer` : ""} ·
          el texto copiado va {moneda === "USD" ? "en dólares (sirve aunque el dólar se mueva)" : "en pesos al dólar de hoy"},
          {modo === "stock"
            ? " solo con los modelos disponibles hoy,"
            : ` con el catálogo completo (lo que no está se consigue en ${Number(vigente.politica?.plazoPedidoDias) || 5} días),`}
          {" "}con todos los escalones y la mezcla libre explicada.
        </p>
      )}
    </div>
  );
}
