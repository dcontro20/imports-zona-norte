// Settings configurables por el usuario. Persisten en localStorage.
// Si en el futuro queremos sync entre devices, se migra a Firestore key.
// Owner-only por convención (no hay enforcement técnico en cliente).

const STORAGE_KEY = "izn_settings";

export const DEFAULT_SETTINGS = {
  // Modo de negocio (pivote a kioscos). Default "minorista" (decisión Diego
  // 2026-07-17: el minorista sigue siendo el canal más usado mientras los
  // kioscos arrancan — se da vuelta con un click del toggle cuando crezca).
  // en la navegación; "minorista" mantiene el orden histórico. NO oculta nada:
  // ambos modos ven todas las pantallas, solo cambia el orden.
  businessMode: "minorista",

  // Stock & inventario
  lowStockThreshold: 3,        // alerta "stock bajo" si stock <= esto
  willRunOutDays: 7,           // alerta "se agota en N días"
  willRunOutMaxStock: 10,      // sólo alertar si stock <= esto (evita false positives)
  staleProductDays: 30,        // alerta "sin vender hace N días"
  expiringDaysAhead: 30,       // alerta vencimiento si expiryDate ≤ N días
  stagnantLoteMinPct: 0.7,     // alerta lote sin rotar si >= 70% del stock original
  stagnantLoteMinDays: 14,     // y han pasado >= N días desde recibido

  // Caja & finanzas
  cashLowThreshold: 3000,      // alerta "caja baja" si saldo total ARS-equiv < esto
  largeExpenseThreshold: 200000, // confirmación extra para egresos >= ARS

  // Clientes & deuda
  debtTotalAlertARS: 1000,     // alerta "clientes con deuda" si total deudas > esto
  debtClientLimitARS: 20000,   // alerta al cargar venta si cliente.balance < -esto

  // Mermas / calidad
  warrantyRatePct: 3,          // alerta modelo con alta tasa falla > %
  warrantyMonthlyCount: 2,     // mínimo de garantías para que aplique alerta
  shippingDamageMonthly: 3,    // alerta cambios por daño envío >= N este mes

  // Backups
  backupReminderDays: 7,       // recordatorio si no se hizo backup en N días
  driveBackupStaleDays: 2,     // alerta Dashboard si el último backup a Drive tiene ≥ N días (≥ 2N = urgente)

  // Meta de ventas del mes (ARS). 0 = sin meta. El dashboard muestra una
  // barra de progreso con "esperado a esta altura del mes" para saber si
  // vamos bien encaminados o atrasados.
  monthlyRevenueGoalARS: 0,

  // Notificaciones diarias: recordatorios para mandar el mensaje de stock
  // al grupo. Solo locales por ahora (se programan al abrir la app cada día).
  notificationsEnabled: false,        // off por default; el user lo activa
  notificationNoonTime: "12:00",      // formato HH:MM
  notificationEveningTime: "18:30",   // formato HH:MM
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    // Merge con defaults para que keys nuevas en versiones futuras
    // se llenen sin que el usuario tenga que reconfigurar.
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // Notificar a la app que cambiaron settings, así los useEffect
    // que dependen de ellos se re-ejecutan sin necesidad de refresh.
    window.dispatchEvent(new CustomEvent("izn:settings-changed", { detail: settings }));
  } catch (e) {
    console.error("Error guardando settings:", e);
  }
}

export function resetSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("izn:settings-changed", { detail: { ...DEFAULT_SETTINGS } }));
  } catch {}
}
