import { useState, useEffect } from "react";
import { Modal, Card, Btn, Input } from "./UI.jsx";
import { T } from "../theme.js";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, resetSettings } from "../settings.js";
import { isSupported as notifSupported, getPermission, requestPermission } from "../lib/notifications.js";
import { isPushConfigured, getStoredPushToken } from "../lib/push.js";

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
  // Sección Meta de ventas
  { section: "🎯 Meta de ventas",     key: "monthlyRevenueGoalARS", label: "Objetivo mensual (0 = sin meta)", suffix: "$" },
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

      {/* Sección: recordatorios diarios */}
      <NotificationsSection draft={draft} setDraft={setDraft} />

      {/* Sección: utilidades de la app */}
      <Card style={{ marginTop: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 10 }}>
          🎓 Utilidades
        </div>
        <button onClick={async () => {
          const m = await import("./OnboardingTour.jsx");
          m.resetOnboarding();
          alert("Tour de bienvenida activado para la próxima sesión. Cerrá y volvé a abrir la app.");
        }} style={{
          padding: "10px 14px", background: "transparent", border: `1px solid ${T.borderSoft}`,
          borderRadius: 8, color: T.textMuted, fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit", width: "100%", textAlign: "left",
        }}>↺ Volver a ver el tour de bienvenida</button>
        <button onClick={async () => {
          const m = await import("../lib/errorReporter.js");
          const stats = m.errorStats();
          if (stats.total === 0) {
            alert("Sin errores registrados. 👍");
            return;
          }
          const top = stats.topMessages.slice(0, 5).map(t => `${t.count}× ${t.msg}`).join("\n");
          alert(`Total: ${stats.total} errores\nÚltimos 24h: ${stats.last24h}\nÚltimos 7d: ${stats.last7d}\n\nTop:\n${top}`);
        }} style={{
          padding: "10px 14px", marginTop: 8, background: "transparent", border: `1px solid ${T.borderSoft}`,
          borderRadius: 8, color: T.textMuted, fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit", width: "100%", textAlign: "left",
        }}>🐛 Ver errores del sistema (debug)</button>
      </Card>

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

// ============================================================================
// SECCIÓN DE NOTIFICACIONES DIARIAS
// ============================================================================
function NotificationsSection({ draft, setDraft }) {
  const supported = notifSupported();
  const [perm, setPerm] = useState(supported ? getPermission() : "unsupported");
  const [requesting, setRequesting] = useState(false);
  // Push remoto: "active" (token registrado), "ready" (configurado, falta
  // registrar — pasa solo al guardar), "unconfigured" (falta VAPID key)
  const [pushState, setPushState] = useState(() => {
    if (!isPushConfigured()) return "unconfigured";
    return getStoredPushToken() ? "active" : "ready";
  });
  const [registering, setRegistering] = useState(false);

  const registerPushNow = async () => {
    setRegistering(true);
    try {
      const { enablePush } = await import("../lib/push.js");
      const r = await enablePush();
      setPushState(r.ok ? "active" : "error");
    } catch {
      setPushState("error");
    }
    setRegistering(false);
  };

  // Re-checkear el permiso por si el usuario lo cambió en otro lado
  useEffect(() => {
    if (!supported) return;
    const id = setInterval(() => {
      const next = getPermission();
      if (next !== perm) setPerm(next);
    }, 1500);
    return () => clearInterval(id);
  }, [perm, supported]);

  const askPermission = async () => {
    setRequesting(true);
    const r = await requestPermission();
    setPerm(r);
    setRequesting(false);
  };

  const enabled = !!draft.notificationsEnabled;

  // Color / texto del estado del permiso
  const permLabels = {
    granted: { txt: "✓ Permiso concedido", color: T.green },
    denied: { txt: "✗ Permiso denegado — habilitalo desde Ajustes de iOS", color: T.red },
    default: { txt: "Falta pedir permiso al sistema", color: T.amber },
    unsupported: { txt: "Tu dispositivo no soporta notificaciones", color: T.textMuted },
  };
  const permState = permLabels[perm] || permLabels.default;

  return (
    <Card style={{ marginTop: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 4 }}>
        🔔 Recordatorios diarios al mediodía y a la tarde
      </div>
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
        El sistema te avisa a las horas que elegís para que mandes el mensaje de stock al grupo.
        Por ahora son <strong>locales</strong>: funcionan si abriste la app al menos una vez en el día.
      </div>

      {/* Toggle on/off */}
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 0" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => setDraft(d => ({ ...d, notificationsEnabled: e.target.checked }))}
          style={{ width: 18, height: 18, cursor: "pointer", accentColor: T.primary }}
        />
        <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Activar recordatorios diarios</span>
      </label>

      {enabled && (
        <div style={{ marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}`, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Estado del permiso */}
          <div style={{
            padding: "8px 12px", borderRadius: 8,
            background: perm === "granted" ? T.greenBg : perm === "denied" ? T.redBg : T.amberBg,
            border: `1px solid ${perm === "granted" ? T.greenBorder : perm === "denied" ? T.redBorder : T.amberBorder}`,
            fontSize: 12, color: permState.color, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap",
          }}>
            <span>{permState.txt}</span>
            {perm === "default" && (
              <Btn onClick={askPermission} disabled={requesting}>
                {requesting ? "Pidiendo…" : "Pedir permiso"}
              </Btn>
            )}
          </div>

          {/* Estado del push remoto (FCM) */}
          {perm === "granted" && (
            <div style={{
              padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 8, flexWrap: "wrap",
              background: pushState === "active" ? T.greenBg : pushState === "unconfigured" ? T.amberBg : T.cardAlt || T.card,
              border: `1px solid ${pushState === "active" ? T.greenBorder : pushState === "unconfigured" ? T.amberBorder : T.borderSoft}`,
              color: pushState === "active" ? T.green : pushState === "unconfigured" ? T.amber : T.textMuted,
            }}>
              {pushState === "active" && <span>📡 Push remoto activo — te llega aunque la app esté cerrada</span>}
              {pushState === "unconfigured" && (
                <span>📡 Push remoto: falta setup (ver <strong>docs/PUSH_SETUP.md</strong>). Mientras tanto, recordatorios locales.</span>
              )}
              {(pushState === "ready" || pushState === "error") && (
                <>
                  <span>{pushState === "error" ? "📡 Falló el registro — reintentá" : "📡 Push remoto listo para activar"}</span>
                  <Btn onClick={registerPushNow} disabled={registering}>
                    {registering ? "Registrando…" : "Activar en este dispositivo"}
                  </Btn>
                </>
              )}
            </div>
          )}

          {/* Horarios */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                ☀️ Mediodía
              </label>
              <input
                type="time"
                value={draft.notificationNoonTime || "12:00"}
                onChange={e => setDraft(d => ({ ...d, notificationNoonTime: e.target.value }))}
                style={timeInputStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                🌆 Tarde
              </label>
              <input
                type="time"
                value={draft.notificationEveningTime || "18:30"}
                onChange={e => setDraft(d => ({ ...d, notificationEveningTime: e.target.value }))}
                style={timeInputStyle}
              />
            </div>
          </div>

          {perm === "denied" && (
            <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.4 }}>
              💡 Para reactivar: <strong>Ajustes de iOS → Notificaciones → IZN → Permitir notificaciones</strong>.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const timeInputStyle = {
  width: "100%", padding: "10px 12px", fontSize: 16,
  border: `1px solid ${T.borderSoft}`, borderRadius: 8,
  background: T.card, color: T.text, outline: "none",
  fontFamily: "inherit", boxSizing: "border-box", minHeight: 44,
};
