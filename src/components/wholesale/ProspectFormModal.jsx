// ProspectFormModal.jsx — alta/edición de prospecto. Extraído de Pipeline en
// F2 del mini CRM (spec docs/PROSPECT_CRM_SPEC.md) para usarlo también desde
// la pestaña Hoy. Comportamiento IDÉNTICO al original: mismos campos, misma
// validación, mismo shape del alta (id + pipelineStage + foundAt/lastContactAt).
import { useState, useEffect } from "react";
import { uid } from "../../helpers.js";
import { useResponsive } from "../../App.jsx";
import { Btn, Modal, Input, Select } from "../UI.jsx";
import { T } from "../../theme.js";
import { PROSPECT_SOURCES } from "../../constants.js";
import { useAppContext } from "../../AppContext.js";

const emptyProspect = { businessName: "", zone: "", address: "", phone: "", contactName: "", source: "manual", notes: "", lat: "", lng: "" };

// editing: prospecto a editar, o null para alta nueva.
export function ProspectFormModal({ open, editing = null, onClose, setProspects }) {
  const { isMobile } = useResponsive();
  const { logAudit } = useAppContext();
  const [form, setForm] = useState(emptyProspect);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setForm(editing
        ? { ...emptyProspect, ...editing, lat: editing.lat ?? "", lng: editing.lng ?? "" }
        : emptyProspect);
      setErr("");
    }
  }, [open, editing]);

  const now = () => new Date().toISOString();
  const save = () => {
    if (!form.businessName.trim()) { setErr("El nombre del comercio es obligatorio"); return; }
    const base = {
      businessName: form.businessName.trim(), zone: form.zone.trim(), address: form.address.trim(),
      phone: form.phone.trim(), contactName: form.contactName.trim(),
      source: form.source || "manual", notes: form.notes.trim(),
      lat: form.lat === "" ? null : Number(form.lat), lng: form.lng === "" ? null : Number(form.lng),
    };
    if (editing) {
      setProspects(prev => prev.map(p => p.id === editing.id ? { ...p, ...base } : p));
      logAudit?.("update", "prospect", editing.id, `Prospecto editado: ${base.businessName}`);
    } else {
      const id = uid();
      setProspects(prev => [{ id, pipelineStage: "prospecto", foundAt: now(), lastContactAt: now(), ...base }, ...prev]);
      logAudit?.("create", "prospect", id, `Prospecto nuevo: ${base.businessName}`);
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Editar prospecto" : "Nuevo prospecto"}>
      <Input label="Nombre del comercio *" value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} />
      <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
        <div style={{ flex: 1 }}><Input label="Zona / barrio" value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))} /></div>
        <div style={{ flex: 1 }}><Select label="Origen" options={PROSPECT_SOURCES} value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} /></div>
      </div>
      <Input label="Dirección" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
      <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
        <div style={{ flex: 1 }}><Input label="Teléfono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
        <div style={{ flex: 1 }}><Input label="Contacto / encargado" value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} /></div>
      </div>
      <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
        <div style={{ flex: 1 }}><Input label="Lat (opcional)" value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} /></div>
        <div style={{ flex: 1 }}><Input label="Lng (opcional)" value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} /></div>
      </div>
      <Input label="Notas" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save}>{editing ? "Guardar" : "Crear"}</Btn>
      </div>
    </Modal>
  );
}
