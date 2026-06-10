import { useState, useEffect } from "react";
import { uid } from "../../helpers.js";
import { Modal, Btn, Input } from "../UI.jsx";
import {
  SUPPLIER_COLORS,
  emptySupplierProfile,
  buildSupplierProfile,
  pickSupplierColor,
} from "../../lib/supplierProfiles.js";

// Modal para crear o editar un perfil de proveedor.
export function SupplierProfileModal({ open, profile, existingProfiles = [], onClose, onSave, onDelete }) {
  const [form, setForm] = useState(emptySupplierProfile());

  useEffect(() => {
    if (!open) return;
    if (profile) {
      setForm({ ...emptySupplierProfile(), ...profile });
    } else {
      setForm({ ...emptySupplierProfile() });
    }
  }, [open, profile]);

  const isEdit = !!profile?.id;

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (isEdit) {
      onSave({ ...form, name: form.name.trim() });
    } else {
      const newProfile = buildSupplierProfile(form.name.trim(), existingProfiles);
      onSave({
        ...newProfile,
        ...form,
        id: uid(),
        name: form.name.trim(),
        color: form.color || newProfile.color,
        createdAt: newProfile.createdAt,
      });
    }
  };

  const handleDelete = () => {
    if (!profile?.id) return;
    if (!confirm(`¿Eliminar el proveedor "${profile.name}"?\n\nSe ocultará pero los pedidos pasados se mantienen.`)) return;
    onDelete(profile.id);
  };

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  if (!open) return null;

  const usedColors = existingProfiles
    .filter(p => !p.isDeleted && (!profile || p.id !== profile.id))
    .map(p => p.color);

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Editar: ${profile.name}` : "➕ Nuevo Proveedor"}>
      <Input
        label="Nombre"
        value={form.name}
        onChange={e => set("name", e.target.value)}
        placeholder="Ej: Paraguay 1"
      />

      {/* Color picker */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: "#6B7794", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block" }}>Color identificador</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SUPPLIER_COLORS.map(color => {
            const taken = usedColors.includes(color) && color !== form.color;
            return (
              <button
                key={color}
                type="button"
                onClick={() => set("color", color)}
                disabled={taken}
                title={taken ? "Color usado por otro proveedor" : ""}
                style={{
                  width: 32, height: 32, borderRadius: 8, padding: 0,
                  background: color,
                  border: form.color === color ? "3px solid #1E2B4A" : "1px solid #E5DAC2",
                  cursor: taken ? "not-allowed" : "pointer",
                  opacity: taken ? 0.3 : 1,
                  transition: "all 0.15s",
                  outline: "none",
                }}
              />
            );
          })}
        </div>
      </div>

      <Input label="Contacto (nombre)" value={form.contactName} onChange={e => set("contactName", e.target.value)} placeholder="Ej: Mario" />
      <Input label="Contacto (teléfono / WhatsApp)" value={form.contactPhone} onChange={e => set("contactPhone", e.target.value)} placeholder="Ej: +595991234567" />
      <Input label="País / Origen" value={form.country} onChange={e => set("country", e.target.value)} placeholder="Paraguay" />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <Input
            label="Lead time típico (días)"
            type="number" min="1"
            value={form.defaultLeadDays}
            onChange={e => set("defaultLeadDays", Number(e.target.value) || 30)}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <Input
            label="Comisión proveedor (%)"
            type="number" step="0.1"
            value={form.defaultSupplierCommPercent}
            onChange={e => set("defaultSupplierCommPercent", Number(e.target.value) || 0)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <Input
            label="Pasero (%)"
            type="number" step="0.1"
            value={form.defaultPaseroPercent}
            onChange={e => set("defaultPaseroPercent", Number(e.target.value) || 0)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <Input
            label="Envío (ARS)"
            type="number" min="0"
            value={form.defaultEnvioCostARS}
            onChange={e => set("defaultEnvioCostARS", Number(e.target.value) || 0)}
          />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: "#6B7794", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block" }}>Notas</label>
        <textarea
          value={form.notes}
          onChange={e => set("notes", e.target.value)}
          placeholder="Notas internas — preferencias, condiciones, etc."
          style={{
            width: "100%", minHeight: 80, padding: 14,
            background: "#F8F2E7", border: "1px solid #E5DAC2",
            borderRadius: 10, color: "#1E2B4A", fontSize: 14,
            outline: "none", boxSizing: "border-box",
            fontFamily: "inherit", resize: "vertical",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
        {isEdit && (
          <Btn variant="danger" onClick={handleDelete} style={{ marginRight: "auto" }}>🗑️ Eliminar</Btn>
        )}
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={handleSave} disabled={!form.name.trim()}>{isEdit ? "Guardar cambios" : "Crear"}</Btn>
      </div>
    </Modal>
  );
}
