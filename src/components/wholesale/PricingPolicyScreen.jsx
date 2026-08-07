// PricingPolicyScreen.jsx — ⚙️ Política comercial del Pricing Engine.
//
// Acá el operador CONFIGURA (RN-19: ningún número de la política vive en el
// código); el motor CALCULA (src/lib/pricingEngine.js). Nadie escribe precios.
// Cambiar la política NO modifica listas publicadas: habilita republicar
// (las listas son snapshots inmutables — RN-12, llega en F2).
import { useEffect, useMemo, useState } from "react";
import { Card, Btn, MiniBtn, Input, Select, FormRow, useToast, Toast } from "../UI.jsx";
import { useResponsive } from "../../App.jsx";
import { normalizarPolitica, validarPolitica, DEFAULT_PRICING_POLICY } from "../../lib/pricingPolicy.js";
import { calcularProducto } from "../../lib/pricingEngine.js";

const T_NAVY = "#1E2B4A", T_MUTED = "#6B7794", T_RED = "#B83232", T_GREEN = "#0F6B5C", T_AMBER = "#B07A1F";

// Input de porcentaje: muestra 13 para 0.13, guarda la fracción.
const pctVer = (v) => (v == null || v === "" ? "" : Math.round(Number(v) * 10000) / 100);
const pctGuardar = (s) => (s === "" ? "" : Number(s) / 100);

export const PricingPolicyScreen = ({ pricingPolicy, setPricingPolicy, logAudit }) => {
  const { isMobile } = useResponsive();
  const [draft, setDraft] = useState(() => normalizarPolitica(pricingPolicy));
  const [dirty, setDirty] = useState(false);
  const [costoEjemplo, setCostoEjemplo] = useState(8.5);
  const [toast, showToast] = useToast();

  // Si llega una política nueva de Firestore y NO hay edición en curso, refrescar.
  useEffect(() => {
    if (!dirty) setDraft(normalizarPolitica(pricingPolicy));
  }, [pricingPolicy]); // eslint-disable-line

  const mutar = (fn) => { setDirty(true); setDraft((prev) => fn(structuredClone(prev))); };
  const errores = useMemo(() => validarPolitica(draft), [draft]);

  // Ejemplo en vivo: el motor corriendo sobre el borrador con un costo de muestra.
  const ejemplo = useMemo(() => {
    if (errores.length > 0 || !(Number(costoEjemplo) > 0)) return null;
    try { return calcularProducto({ id: "ejemplo", costo: Number(costoEjemplo) }, draft); }
    catch { return null; }
  }, [draft, costoEjemplo, errores.length]);

  const guardar = () => {
    if (errores.length > 0) return;
    setPricingPolicy(normalizarPolitica(draft));
    setDirty(false);
    if (logAudit) logAudit("update", "pricingPolicy", "politica", "Actualizó la política comercial del Pricing Engine");
    showToast("✓ Política guardada");
  };

  const escalones = draft.escalones;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 24, color: T_NAVY }}>🎛️ Política comercial</h2>
        <div style={{ fontSize: 13, color: T_MUTED, marginTop: 4 }}>
          El motor calcula; acá se configura. Los cambios no tocan listas ya publicadas —
          habilitan publicar una versión nueva.
        </div>
      </div>

      {/* ---- Escalones por volumen ---- */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, color: T_NAVY, marginBottom: 4 }}>Escalones por volumen</div>
        <div style={{ fontSize: 12, color: T_MUTED, marginBottom: 12 }}>
          El escalón se determina por el total de {draft.metricaEscalon} del pedido, mezcla libre.
          El margen es sobre precio de venta. El último escalón sin "hasta" queda sin techo.
        </div>
        {escalones.map((esc, i) => (
          <div key={i} style={{
            display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap",
            padding: "8px 0", borderTop: i > 0 ? "1px solid #EFE5CE" : "none",
          }}>
            <div style={{ flex: 1, minWidth: 78 }}>
              <Input label="Desde" type="number" min="1" value={esc.desde}
                onChange={(e) => mutar((d) => { d.escalones[i].desde = Number(e.target.value); return d; })}
                style={{ marginBottom: 0 }} />
            </div>
            <div style={{ flex: 1, minWidth: 78 }}>
              <Input label="Hasta" type="number" min="1" placeholder="Sin techo"
                value={esc.hasta ?? ""}
                onChange={(e) => mutar((d) => { d.escalones[i].hasta = e.target.value === "" ? null : Number(e.target.value); return d; })}
                style={{ marginBottom: 0 }} />
            </div>
            <div style={{ flex: 1, minWidth: 78 }}>
              <Input label="Margen %" type="number" step="0.5" min="0" max="99"
                value={pctVer(esc.margen)}
                onChange={(e) => mutar((d) => { d.escalones[i].margen = pctGuardar(e.target.value); return d; })}
                style={{ marginBottom: 0 }} />
            </div>
            <MiniBtn color={T_RED} disabled={escalones.length <= 1}
              onClick={() => mutar((d) => { d.escalones.splice(i, 1); return d; })}
              style={{ marginBottom: 2 }}>🗑</MiniBtn>
          </div>
        ))}
        <div style={{ marginTop: 10 }}>
          <MiniBtn color={T_GREEN} onClick={() => mutar((d) => {
            const ultimo = d.escalones[d.escalones.length - 1];
            const desde = ultimo ? (Number(ultimo.hasta) || Number(ultimo.desde) * 2) + 1 : 20;
            if (ultimo && ultimo.hasta == null) ultimo.hasta = desde - 1;
            d.escalones.push({ desde, hasta: null, margen: Math.max(0.01, (Number(ultimo?.margen) || 0.2) - 0.03) });
            return d;
          })}>+ Agregar escalón</MiniBtn>
        </div>
      </Card>

      {/* ---- Motor ---- */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, color: T_NAVY, marginBottom: 12 }}>Motor de precios</div>
        <FormRow>
          <Input label="Envío del proveedor %" type="number" step="0.5" min="0"
            value={pctVer(draft.costoAdicionalPct)}
            onChange={(e) => mutar((d) => { d.costoAdicionalPct = pctGuardar(e.target.value); return d; })} />
          <Input label="Múltiplo de redondeo" type="number" step="0.5" min="0"
            value={draft.redondeo.multiplo}
            onChange={(e) => mutar((d) => { d.redondeo.multiplo = Number(e.target.value); return d; })} />
        </FormRow>
        <FormRow>
          <Select label="Dirección de redondeo" value={draft.redondeo.direccion}
            options={[{ value: "arriba", label: "Hacia arriba (protege el margen)" }, { value: "abajo", label: "Hacia abajo" }]}
            onChange={(e) => mutar((d) => { d.redondeo.direccion = e.target.value || "arriba"; return d; })} />
          <Input label="Margen mínimo % (piso duro)" type="number" step="0.5" min="0" max="99"
            value={pctVer(draft.margenMinimo)}
            onChange={(e) => mutar((d) => { d.margenMinimo = pctGuardar(e.target.value); return d; })} />
        </FormRow>
        <div style={{ fontSize: 11, color: T_MUTED }}>
          El piso de margen es BLOQUEANTE: un producto que lo viola no se publica ni se cotiza.
        </div>
      </Card>

      {/* ---- Validaciones ---- */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, color: T_NAVY, marginBottom: 12 }}>Validaciones de mercado (alertas)</div>
        {[
          { key: "conflictoCanal", nombre: "Conflicto de canal", detalle: "alerta si el primer escalón supera este % del precio minorista propio" },
          { key: "margenCliente", nombre: "Margen del kiosco", detalle: "alerta si el margen del cliente contra su precio de calle queda debajo de este %" },
        ].map(({ key, nombre, detalle }) => (
          <div key={key} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1, minWidth: 200 }}>
              <input type="checkbox" checked={!!draft.validaciones[key].activa}
                onChange={(e) => mutar((d) => { d.validaciones[key].activa = e.target.checked; return d; })}
                style={{ width: 18, height: 18 }} />
              <span style={{ fontSize: 13, color: T_NAVY, fontWeight: 600 }}>{nombre}</span>
            </label>
            <div style={{ width: 110 }}>
              <Input type="number" step="1" min="0" value={pctVer(draft.validaciones[key].umbral)}
                onChange={(e) => mutar((d) => { d.validaciones[key].umbral = pctGuardar(e.target.value); return d; })}
                style={{ marginBottom: 0 }} />
            </div>
            <div style={{ flexBasis: "100%", fontSize: 11, color: T_MUTED, marginTop: -4 }}>{detalle}</div>
          </div>
        ))}
      </Card>

      {/* ---- Cotización / presupuesto ---- */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, color: T_NAVY, marginBottom: 12 }}>Cotización y presupuesto</div>
        <FormRow>
          <Input label="Mínimo de unidades" type="number" min="0" value={draft.pedidoMinimo.unidades}
            onChange={(e) => mutar((d) => { d.pedidoMinimo.unidades = Number(e.target.value); return d; })} />
          <Input label="Mínimo de ticket (USD)" type="number" min="0" value={draft.pedidoMinimo.ticketUSD}
            onChange={(e) => mutar((d) => { d.pedidoMinimo.ticketUSD = Number(e.target.value); return d; })} />
        </FormRow>
        <FormRow>
          <Input label="Aviso de frontera % (nudge)" type="number" step="1" min="0" value={pctVer(draft.nudgeUmbralPct)}
            onChange={(e) => mutar((d) => { d.nudgeUmbralPct = pctGuardar(e.target.value); return d; })} />
          <Input label="Buffer de tipo de cambio %" type="number" step="0.5" min="0" value={pctVer(draft.bufferFxPct)}
            onChange={(e) => mutar((d) => { d.bufferFxPct = pctGuardar(e.target.value); return d; })} />
        </FormRow>
        <FormRow>
          <Input label="Vigencia del presupuesto (horas)" type="number" min="1" value={draft.vigenciaHoras}
            onChange={(e) => mutar((d) => { d.vigenciaHoras = Number(e.target.value); return d; })} />
          <Input label="Recargo por plazo %" type="number" step="0.5" min="0" value={pctVer(draft.recargoPlazo.pct)}
            onChange={(e) => mutar((d) => { d.recargoPlazo.pct = pctGuardar(e.target.value); return d; })} />
        </FormRow>
        <FormRow>
          <Input label="Días del plazo" type="number" min="1" value={draft.recargoPlazo.dias}
            onChange={(e) => mutar((d) => { d.recargoPlazo.dias = Number(e.target.value); return d; })} />
          <Input label="Umbral de recálculo %" type="number" step="0.5" min="0" value={pctVer(draft.umbralRecalculoPct)}
            onChange={(e) => mutar((d) => { d.umbralRecalculoPct = pctGuardar(e.target.value); return d; })} />
        </FormRow>
        <FormRow>
          <Input label="Banda de sanidad del dólar %" type="number" step="1" min="0" value={pctVer(draft.fxSanidadPct)}
            onChange={(e) => mutar((d) => { d.fxSanidadPct = pctGuardar(e.target.value); return d; })} />
          <div />
        </FormRow>
        <div style={{ fontSize: 11, color: T_MUTED }}>
          El precio de lista es contado (RN-17). Un salto del dólar automático mayor a la banda
          de sanidad no se aplica solo: pide confirmación.
        </div>
      </Card>

      {/* ---- Ejemplo en vivo ---- */}
      <Card style={{ marginBottom: 14, background: "#FBF7EE" }}>
        <div style={{ fontWeight: 700, color: T_NAVY, marginBottom: 10 }}>Ejemplo en vivo</div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ width: 140 }}>
            <Input label="Costo proveedor (USD)" type="number" step="0.25" min="0" value={costoEjemplo}
              onChange={(e) => setCostoEjemplo(e.target.value)} style={{ marginBottom: 0 }} />
          </div>
          {ejemplo && !ejemplo.sinCosto && (
            <div style={{ flex: 1, minWidth: 0, overflowX: "auto" }}>
              <div style={{ display: "flex", gap: 10 }}>
                {ejemplo.precios.map((p) => (
                  <div key={p.desde} style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: T_MUTED, fontWeight: 700 }}>
                      {p.desde}{p.hasta != null ? `–${p.hasta}` : "+"}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T_NAVY }}>
                      {p.precio.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: 10, color: p.margenReal < draft.margenMinimo ? T_RED : T_GREEN }}>
                      {(p.margenReal * 100).toFixed(1)}%{p.ajustadoAnticolapso ? " ⚖" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {ejemplo && ejemplo.bloqueantes?.length > 0 && (
          <div style={{ fontSize: 12, color: T_RED, fontWeight: 600, marginTop: 8 }}>
            ⛔ Con este costo, el piso de margen bloquea la publicación.
          </div>
        )}
        <div style={{ fontSize: 11, color: T_MUTED, marginTop: 8 }}>
          Costo real = costo × (1 + envío). ⚖ = ajustado por la regla anti-colapso.
        </div>
      </Card>

      {/* ---- Errores + acciones ---- */}
      {errores.length > 0 && (
        <Card style={{ marginBottom: 14, border: `1px solid ${T_RED}`, background: "#FBE4E4" }}>
          <div style={{ fontWeight: 700, color: T_RED, marginBottom: 6 }}>La política tiene problemas:</div>
          {errores.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: T_RED }}>• {e}</div>
          ))}
        </Card>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 30 }}>
        <Btn onClick={guardar} disabled={errores.length > 0 || !dirty}
          style={{ opacity: errores.length > 0 || !dirty ? 0.5 : 1 }}>
          Guardar política
        </Btn>
        {dirty && (
          <Btn variant="secondary" onClick={() => { setDraft(normalizarPolitica(pricingPolicy)); setDirty(false); }}>
            Deshacer cambios
          </Btn>
        )}
        <Btn variant="secondary" onClick={() => { setDirty(true); setDraft(structuredClone(DEFAULT_PRICING_POLICY)); }}
          style={{ color: T_AMBER }}>
          Valores v2026-08
        </Btn>
      </div>

      <Toast message={toast} />
    </div>
  );
};
