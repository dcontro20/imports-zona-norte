// whatsappMigration.js — estampa telefonoWa / telefonoInvalido sobre los
// prospectos (handoff 2026-08-10, Cambio 1). Pura e idempotente, mismo patrón
// que wholesaleMigration: corre en cada arranque y solo escribe si hay algo
// que cambiar. RE-DERIVANTE: si `phone` se editó desde la última corrida, la
// próxima carga recalcula — el campo persistido nunca queda stale más de una
// sesión, sin tocar ningún path de guardado.
//
// Semántica de los campos:
//   telefonoWa       "549..." listo para el link · null si no hay o no sirve
//   telefonoInvalido true SOLO si HAY teléfono y no normaliza (formato roto).
//                    Sin teléfono NO es inválido: es otra cola (para_visitar).
// Los prospectos sin teléfono no se estampan (misma semántica que el campo
// ausente): la migración no mete ruido de campos en data que no lo necesita.
import { normalizarWhatsApp } from "./whatsappPhone.js";

// Derivación de un prospecto → { telefonoWa, telefonoInvalido }. Exportada
// para que el modal (F3) pueda derivar EN VIVO si el phone cambió en la
// misma sesión (el persistido manda en listas/filtros; el link no miente).
export function derivarTelefonoWa(p = {}) {
  const raw = String(p.phone || "").trim();
  if (!raw) return { telefonoWa: null, telefonoInvalido: false };
  const wa = normalizarWhatsApp(raw);
  return { telefonoWa: wa, telefonoInvalido: wa === null };
}

// migrarTelefonosWa(prospects) → { prospects, didChange, counts }
// counts: { total, validos, invalidos, sinTelefono, cambiados } (sobre todos,
// incluidos soft-borrados: restaurar de Papelera devuelve data ya estampada).
export function migrarTelefonosWa(prospects = []) {
  const counts = { total: 0, validos: 0, invalidos: 0, sinTelefono: 0, cambiados: 0 };
  let didChange = false;
  const out = prospects.map(p => {
    if (!p) return p; // huecos: se preservan tal cual
    counts.total++;
    const d = derivarTelefonoWa(p);
    if (d.telefonoWa) counts.validos++;
    else if (d.telefonoInvalido) counts.invalidos++;
    else counts.sinTelefono++;
    const alDia = (p.telefonoWa ?? null) === d.telefonoWa
      && !!p.telefonoInvalido === d.telefonoInvalido;
    if (alDia) return p; // sin cambios: misma referencia, cero writes
    counts.cambiados++;
    didChange = true;
    return { ...p, ...d };
  });
  return { prospects: didChange ? out : prospects, didChange, counts };
}
