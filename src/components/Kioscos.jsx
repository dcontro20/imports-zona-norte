import { useState, useMemo } from "react";
import { uid, formatMoney } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Card, Btn, Modal, Input, Select, StatCard } from "./UI.jsx";
import { T } from "../theme.js";
import { BUSINESS_TYPES, WHOLESALE_TIERS, PIPELINE_STAGES } from "../constants.js";
import { buildClientStats, classifyClient, predictNextPurchase } from "../clientIntelligence.js";
import { kioscosToCSV } from "../lib/wholesaleExport.js";
import { clientOutstanding } from "../lib/creditAccount.js";
import { useAppContext } from "../AppContext.js";

// Descarga un CSV en el browser (helper local — la generación del string es pura).
function downloadCSV(filename, csv) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// Pantalla de clientes MAYORISTAS (type="mayorista"). El label "Kioscos" se
// mantiene porque la mayoría lo son, pero el modelo/filtro es por type + businessType.
// Reusa la inteligencia de cliente (churn/cadencia/predicción) sin reescribir nada.

const SEG_STYLE = {
  activo: { label: "Activo", color: T.green, bg: T.greenBg },
  en_riesgo: { label: "En riesgo", color: T.amber, bg: T.amberBg },
  dormido: { label: "Dormido", color: T.red, bg: T.redBg },
  nuevo: { label: "Nuevo", color: T.blue, bg: T.blueBg },
  sin_compras: { label: "Sin compras", color: T.textMuted, bg: T.borderSoft },
};

const TIER_STYLE = {
  A: { color: T.green, bg: T.greenBg },
  B: { color: T.blue, bg: T.blueBg },
  C: { color: T.amber, bg: T.amberBg },
};

const emptyForm = {
  name: "", businessName: "", businessType: "", wholesaleTier: "",
  zone: "", address: "", phone: "", contactName: "", contactPhone: "",
  cuit: "", openingHours: "", pipelineStage: "activo", notes: "",
  creditEnabled: false, creditLimitARS: "",
};

export function Kioscos({ clients = [], setClients, sales = [], products = [] }) {
  const { isMobile } = useResponsive();
  const { exchangeRate, logAudit, currentUser } = useAppContext();

  const [search, setSearch] = useState("");
  const [fBusiness, setFBusiness] = useState("");
  const [fTier, setFTier] = useState("");
  const [fStage, setFStage] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);   // client.id | null
  const [converting, setConverting] = useState(false); // true = viene de un candidato
  const [form, setForm] = useState(emptyForm);
  const [err, setErr] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState({}); // { id: true }
  const [bulkTier, setBulkTier] = useState("");
  const [bulkZone, setBulkZone] = useState("");

  // Clientes mayoristas y candidatos (mayoristas viejos por tier="mayorista").
  const mayoristas = useMemo(
    () => clients.filter(c => c && !c.isDeleted && c.type === "mayorista"),
    [clients]
  );
  const candidatos = useMemo(
    () => clients.filter(c => c && !c.isDeleted && c.type !== "mayorista" && c.tier === "mayorista"),
    [clients]
  );

  // Stats de cliente (churn/cadencia) sobre los mayoristas.
  const statsById = useMemo(() => {
    const list = buildClientStats(mayoristas, sales, exchangeRate || 1);
    const map = {};
    list.forEach(st => { map[st.id] = st; });
    return map;
  }, [mayoristas, sales, exchangeRate]);

  // KPIs de la cabecera.
  const kpis = useMemo(() => {
    const activos = mayoristas.filter(c => !c.inactive).length;
    const withSales = Object.values(statsById).filter(s => s.salesCount > 0);
    const totalSpent = withSales.reduce((s, x) => s + x.totalSpentARS, 0);
    const totalOrders = withSales.reduce((s, x) => s + x.salesCount, 0);
    const ticket = totalOrders > 0 ? Math.round(totalSpent / totalOrders) : 0;
    const recompraMes = Object.values(statsById).filter(s => (s.daysSinceLast ?? 999) <= 30).length;
    return { activos, ticket, recompraMes };
  }, [mayoristas, statsById]);

  // Lista filtrada.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mayoristas.filter(c => {
      if (fBusiness && c.businessType !== fBusiness) return false;
      if (fTier && c.wholesaleTier !== fTier) return false;
      if (fStage && c.pipelineStage !== fStage) return false;
      if (q) {
        const hay = `${c.name || ""} ${c.businessName || ""} ${c.zone || ""} ${c.phone || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.businessName || b.name || "").localeCompare(a.businessName || a.name || "") * -1);
  }, [mayoristas, search, fBusiness, fTier, fStage]);

  const openNew = () => { setForm(emptyForm); setEditing(null); setConverting(false); setErr(""); setModal(true); };
  const openEdit = (c) => {
    setForm({ ...emptyForm, ...c, businessType: c.businessType || "", wholesaleTier: c.wholesaleTier || "", pipelineStage: c.pipelineStage || "activo", creditEnabled: !!c.creditEnabled, creditLimitARS: c.creditLimitARS || "" });
    setEditing(c.id); setConverting(false); setErr(""); setModal(true);
  };
  const openConvert = (c) => {
    setForm({ ...emptyForm, ...c, businessName: c.businessName || c.name || "", businessType: c.businessType || "", wholesaleTier: "", pipelineStage: "activo" });
    setEditing(c.id); setConverting(true); setErr(""); setModal(true);
  };

  const save = () => {
    if (!form.name.trim()) { setErr("El nombre es obligatorio"); return; }
    if (!form.wholesaleTier) { setErr("Elegí el tier mayorista (A/B/C)"); return; }
    const now = new Date().toISOString();
    const base = {
      name: form.name.trim(),
      businessName: form.businessName.trim(),
      businessType: form.businessType || null,
      wholesaleTier: form.wholesaleTier,
      zone: form.zone.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      contactName: form.contactName.trim(),
      contactPhone: form.contactPhone.trim(),
      cuit: form.cuit.trim(),
      openingHours: form.openingHours.trim(),
      pipelineStage: form.pipelineStage || "activo",
      notes: form.notes.trim(),
      type: "mayorista",
      creditEnabled: !!form.creditEnabled,
      creditLimitARS: form.creditEnabled ? (Number(form.creditLimitARS) || 0) : 0,
    };
    if (editing) {
      setClients(prev => prev.map(c => {
        if (c.id !== editing) return c;
        // Al convertir un candidato, normalizamos el tier retail a "regular".
        const next = { ...c, ...base };
        if (converting) next.tier = "regular";
        return next;
      }));
      logAudit?.(converting ? "convert" : "update", "client", editing,
        converting ? `Convertido a mayorista: ${base.name} (tier ${base.wholesaleTier})` : `Mayorista editado: ${base.name}`);
    } else {
      const id = uid();
      setClients(prev => [{ id, tier: "regular", balance: 0, createdAt: now, createdBy: currentUser?.name || "Sistema", ...base }, ...prev]);
      logAudit?.("create", "client", id, `Mayorista nuevo: ${base.name} (tier ${base.wholesaleTier})`);
    }
    setModal(false);
  };

  const selectedIds = Object.keys(selected).filter(id => selected[id]);
  const toggleSelect = (id) => setSelected(s => ({ ...s, [id]: !s[id] }));
  const exitSelect = () => { setSelectMode(false); setSelected({}); setBulkTier(""); setBulkZone(""); };
  const applyBulkTier = () => {
    if (!bulkTier || selectedIds.length === 0) return;
    setClients(prev => prev.map(c => selected[c.id] ? { ...c, wholesaleTier: bulkTier } : c));
    logAudit?.("bulk", "client", "", `Tier ${bulkTier} a ${selectedIds.length} mayoristas`);
    exitSelect();
  };
  const applyBulkZone = () => {
    if (!bulkZone.trim() || selectedIds.length === 0) return;
    setClients(prev => prev.map(c => selected[c.id] ? { ...c, zone: bulkZone.trim() } : c));
    logAudit?.("bulk", "client", "", `Zona "${bulkZone.trim()}" a ${selectedIds.length} mayoristas`);
    exitSelect();
  };
  const exportCSV = () => downloadCSV(`kioscos_${new Date().toISOString().slice(0, 10)}.csv`, kioscosToCSV(clients));

  const chipInput = { flex: isMobile ? "1 1 100%" : "1 1 auto", minWidth: 0 };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: T.text, margin: 0, fontSize: 22 }}>🏪 Kioscos / Mayoristas</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {mayoristas.length > 0 && <Btn variant="secondary" onClick={exportCSV}>📥 CSV</Btn>}
          {mayoristas.length > 0 && <Btn variant="secondary" onClick={() => selectMode ? exitSelect() : setSelectMode(true)}>{selectMode ? "Cancelar" : "☑️ Seleccionar"}</Btn>}
          <Btn onClick={openNew}>+ Nuevo mayorista</Btn>
        </div>
      </div>

      {/* Barra de acciones en lote */}
      {selectMode && (
        <Card style={{ marginBottom: 12, background: T.primarySoft, border: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, color: T.primary }}>{selectedIds.length} seleccionado{selectedIds.length === 1 ? "" : "s"}</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select value={bulkTier} onChange={e => setBulkTier(e.target.value)} style={selStyle(isMobile)}>
                <option value="">Tier…</option>
                {WHOLESALE_TIERS.map(t => <option key={t} value={t}>Tier {t}</option>)}
              </select>
              <Btn variant="secondary" onClick={applyBulkTier}>Aplicar tier</Btn>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input value={bulkZone} onChange={e => setBulkZone(e.target.value)} placeholder="Zona…"
                style={{ padding: isMobile ? "10px 12px" : "9px 12px", minHeight: isMobile ? 44 : 38, fontSize: isMobile ? 16 : 13, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, outline: "none", width: 120, boxSizing: "border-box" }} />
              <Btn variant="secondary" onClick={applyBulkZone}>Aplicar zona</Btn>
            </div>
          </div>
        </Card>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="Mayoristas activos" value={kpis.activos} icon="🏪" color={T.green} />
        <StatCard label="Ticket B2B prom." value={formatMoney(kpis.ticket)} icon="🧾" color={T.blue} />
        <StatCard label="Compraron (30d)" value={kpis.recompraMes} icon="🔁" color={T.amber} />
      </div>

      {/* Candidatos a convertir */}
      {candidatos.length > 0 && (
        <Card style={{ marginBottom: 16, background: T.amberBg, border: `1px solid ${T.amberBorder}` }}>
          <div style={{ fontWeight: 800, color: T.amber, marginBottom: 8 }}>
            ⭐ {candidatos.length} cliente{candidatos.length > 1 ? "s" : ""} con tier "mayorista" viejo — candidatos a pasar a mayorista
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {candidatos.map(c => (
              <button key={c.id} onClick={() => openConvert(c)} style={{
                border: `1px solid ${T.amberBorder}`, background: T.card, color: T.text,
                borderRadius: 8, padding: isMobile ? "10px 14px" : "6px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600,
                minHeight: isMobile ? 44 : undefined,
              }}>{c.name} → convertir</button>
            ))}
          </div>
        </Card>
      )}

      {/* Filtros */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, comercio, zona..."
          style={{ ...chipInput, padding: isMobile ? "12px 14px" : "9px 12px", minHeight: isMobile ? 44 : 38, fontSize: isMobile ? 16 : 14,
            background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, outline: "none" }} />
        <select value={fBusiness} onChange={e => setFBusiness(e.target.value)} style={selStyle(isMobile)}>
          <option value="">Todo comercio</option>
          {BUSINESS_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={fTier} onChange={e => setFTier(e.target.value)} style={selStyle(isMobile)}>
          <option value="">Todo tier</option>
          {WHOLESALE_TIERS.map(t => <option key={t} value={t}>Tier {t}</option>)}
        </select>
        <select value={fStage} onChange={e => setFStage(e.target.value)} style={selStyle(isMobile)}>
          <option value="">Todo estado</option>
          {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <Card><div style={{ textAlign: "center", color: T.textMuted, padding: isMobile ? "32px 16px" : 48 }}>
          {mayoristas.length === 0
            ? "Aún no hay mayoristas. Agregá el primero con \"+ Nuevo mayorista\"."
            : "Ningún mayorista coincide con los filtros."}
        </div></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {filtered.map(c => {
            const st = statsById[c.id];
            const seg = st ? classifyClient(st) : "sin_compras";
            const segS = SEG_STYLE[seg] || SEG_STYLE.sin_compras;
            const tierS = TIER_STYLE[c.wholesaleTier] || { color: T.textMuted, bg: T.borderSoft };
            const pred = st ? predictNextPurchase(st) : null;
            const owed = clientOutstanding(c, sales); // adeudado B2B real (deriva de ventas, no de balance)
            return (
              <Card key={c.id} style={{ cursor: "pointer", outline: selectMode && selected[c.id] ? `2px solid ${T.primary}` : "none" }}>
                <div onClick={() => selectMode ? toggleSelect(c.id) : openEdit(c)}>
                  {selectMode && (
                    <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 12, color: T.textSub }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={!!selected[c.id]} onChange={() => toggleSelect(c.id)} /> seleccionar
                    </label>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: T.text, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.businessName || c.name}
                      </div>
                      <div style={{ fontSize: 12, color: T.textMuted }}>
                        {c.businessType ? `${c.businessType} · ` : ""}{c.zone || "sin zona"}
                      </div>
                    </div>
                    <span style={{ flexShrink: 0, background: tierS.bg, color: tierS.color, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 800 }}>
                      Tier {c.wholesaleTier || "—"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    <span style={{ background: segS.bg, color: segS.color, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{segS.label}</span>
                    {st?.salesCount > 0 && <span style={{ background: T.borderSoft, color: T.textSub, borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>{st.salesCount} pedidos</span>}
                    {owed > 0 && <span style={{ background: T.redBg, color: T.red, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>Debe {formatMoney(owed)}</span>}
                  </div>
                  {pred && pred.status === "atrasado" && (
                    <div style={{ marginTop: 8, fontSize: 12, color: T.red }}>⏰ Debería haber recomprado hace {pred.overdueDays}d</div>
                  )}
                  {pred && pred.status === "por_comprar" && (
                    <div style={{ marginTop: 8, fontSize: 12, color: T.amber }}>🔔 Toca recompra (~cada {st.avgDaysBetween}d)</div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Ficha (crear / editar / convertir) */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? (converting ? "Convertir a mayorista" : "Editar mayorista") : "Nuevo mayorista"}>
        {converting && <div style={{ background: T.amberBg, color: T.amber, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
          Al guardar: se marca como mayorista y el tier retail se normaliza a "regular".
        </div>}
        <Input label="Nombre / responsable *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <Input label="Nombre del comercio" value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} />
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}>
            <Select label="Tipo de comercio" options={BUSINESS_TYPES} value={form.businessType} onChange={e => setForm(f => ({ ...f, businessType: e.target.value }))} />
          </div>
          <div style={{ flex: 1 }}>
            <Select label="Tier mayorista *" options={WHOLESALE_TIERS.map(t => ({ value: t, label: `Tier ${t}` }))} value={form.wholesaleTier} onChange={e => setForm(f => ({ ...f, wholesaleTier: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}><Input label="Zona / barrio" value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))} /></div>
          <div style={{ flex: 1 }}>
            <Select label="Estado (pipeline)" options={PIPELINE_STAGES} value={form.pipelineStage} onChange={e => setForm(f => ({ ...f, pipelineStage: e.target.value }))} />
          </div>
        </div>
        <Input label="Dirección" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}><Input label="Teléfono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div style={{ flex: 1 }}><Input label="Tel. del comercio" value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}><Input label="Contacto / encargado" value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} /></div>
          <div style={{ flex: 1 }}><Input label="CUIT (opcional)" value={form.cuit} onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} /></div>
        </div>
        <Input label="Horario de atención" value={form.openingHours} onChange={e => setForm(f => ({ ...f, openingHours: e.target.value }))} />

        {/* Cuenta corriente (default OFF: paga contra entrega) */}
        <div style={{ background: T.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, color: T.text }}>
            <input type="checkbox" checked={form.creditEnabled} onChange={e => setForm(f => ({ ...f, creditEnabled: e.target.checked }))} />
            💳 Habilitar cuenta corriente (fiado)
          </label>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
            Off = paga contra entrega (default). On = puede dejar saldo a cuenta hasta el límite.
          </div>
          {form.creditEnabled && (
            <div style={{ marginTop: 10 }}>
              <Input label="Límite de crédito (ARS)" type="number" value={form.creditLimitARS} onChange={e => setForm(f => ({ ...f, creditLimitARS: e.target.value }))} />
            </div>
          )}
        </div>

        <Input label="Notas" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
          <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={save}>{editing ? (converting ? "Convertir" : "Guardar") : "Crear"}</Btn>
        </div>
      </Modal>
    </div>
  );
}

function selStyle(isMobile) {
  return {
    padding: isMobile ? "10px 12px" : "9px 12px", minHeight: isMobile ? 44 : 38,
    fontSize: isMobile ? 16 : 13, background: T.card, border: `1px solid ${T.border}`,
    borderRadius: 10, color: T.text, outline: "none", cursor: "pointer",
  };
}
