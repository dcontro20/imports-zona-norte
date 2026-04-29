import { useState } from "react";
import { Modal, Card, Btn, Input } from "./UI.jsx";
import { T } from "../theme.js";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, resetSettings } from "../settings.js";

// SettingsModal — configuración de thresholds del sistema.
// Owner ajusta cómo el sistema dispara alertas (stock bajo, caja baja, etc).
// Los settings persisten en localStorage y disparan re-render en consumidores
// via event "izn:settings-changed".

const FIELDS = [
  // Sección Stock
  { section: "📦 Stock & inventario", key: "lowStockThreshold",   label: "Alerta stock bajo si quedan ≤", suffix: "uds" },
  { section: "📦 Stock & inventario", key: "willRunOutMaxStock",  label: "Solo alertar 'se agota' si stock ≤", suffix: "uds" },
  { section: "📦 Stock & inventario", key: "willRunOutDays",      label: "Alertar 'se agota' si dura ≤", suffix: "días" },
  { section: "📦 Stock & inventario", key: "staleProductDays",    label: "Producto sin vender hace ≥", suffix: "días" },
  { section: "📦 Stock & inventario", key: "expiringDaysAhead",   label: "Alerta vencimiento si vence en ≤", suffix: "días" },
  { section: "📦 Stock & inventario", key: "stagnantLoteMinDays", label: "Lote 'sin rotar' después de ≥", suffix: "días" },
  // Sección Caja
  { section: "💰 Caja & finanzas",    key: "cashLowThreshold",    label: "Alerta caja baja si total ARS <", suffix: "$" },
  { section: "💰 Caja & finanzas",    key: "largeExpenseThreshold", label: "Confirmación extra egreso ≥", suffix: "$" },
  // Sección Clientes
  { section: "👥 Clientes & deudas",  key: "debtTotalAlertARS",   label: "Alerta deudas pendientes si total >", suffix: "$" },
  { section: "👥 Clientes & deudas",  key: "debtClientLimitARS",  label: "Alerta crédito agotado si deuda cliente >", suffix: "$" },
  // Sección Mermas
  { section: "🛡️ Mermas & calidad",   key: "warrantyRatePct",     label: "Alerta modelo con tasa falla >", suffix: "%" },
  { section: "🛡️ Mermas & calidad",   key: "warrantyMonthlyCount",label: "Mínimo garantías mensuales para alertar", suffix: "uds" },
  { section: "🛡️ Mermas & calidad",   key: "shippingDamageMonthly", label: "Alerta daño envío ≥", suffix: "casos/mes" },
  // Sección Backup
  { section: "🔄 Backups",            key: "backupReminderDays",  label: "Recordatorio backup si pasaron ≥", suffix: "días" },
  // Sección Tax (monotributo Argentina)
  { section: "🏛️ Monotributo (AR)",   key: "monotributoYearlyLimitARS", label: "Techo anual de tu categoría (0 = deshabilitar alerta)", suffix: "$" },
];

export const SettingsModal = ({ open, onClose }) => {
  const [draft, setDraft] = useState(() => loadSettings());
  const [saved, setSaved] = useState(false);

  if (!open) return null;

  const update = (key, val) => {
    const num = Number(val);
    setDraft(prev => ({ ...prev, [key]: Number.isFinite(num) ? num : prev[key] }));
    setSaved(false);
  };

  const handleSave = () => {
    saveSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleReset = () => {
    if (!confirm("¿Restaurar todos los valores por defecto?")) return;
    resetSettings();
    setDraft({ ...DEFAULT_SETTINGS });
  };

  // Agrupar fields por sección
  const grouped = {};
  FIELDS.forEach(f => {
    if (!grouped[f.section]) grouped[f.section] = [];
    grouped[f.section].push(f);
  });

  return (
    <Modal open={open} onClose={onClose} title="⚙️ Configuración del sistema">
      <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 18px" }}>
        Ajustá los umbrales que dispara el sistema para alertar problemas.
        Los cambios se guardan localmente en este dispositivo.
      </p>

      {Object.entries(grouped).map(([section, fields]) => (
        <Card key={section} style={{ marginBottom: 14 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: T.text }}>{section}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            {fields.map(f => (
              <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ flex: 1, fontSize: 13, color: T.textSub }}>{f.label}</label>
                <input
                  type="number"
                  value={draft[f.key]}
                  onChange={e => update(f.key, e.target.value)}
                  style={{
                    width: 90, padding: "6px 8px", minHeight: 36,
                    border: `1px solid ${T.borderSoft}`, borderRadius: 6,
                    background: T.surface2, color: T.text,
                    fontSize: 14, fontWeight: 600, fontFamily: "inherit",
                    textAlign: "right", outline: "none",
                  }}
                />
                <span style={{ fontSize: 11, color: T.textMuted, minWidth: 50 }}>{f.suffix}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={handleReset} style={{
          padding: "10px 16px", minHeight: 40,
          background: "transparent", border: `1px solid ${T.borderSoft}`,
          borderRadius: 8, color: T.textMuted, fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}>↺ Restaurar defaults</button>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
          <Btn onClick={handleSave}>{saved ? "✓ Guardado" : "Guardar"}</Btn>
        </div>
      </div>
    </Modal>
  );
};

export default SettingsModal;
