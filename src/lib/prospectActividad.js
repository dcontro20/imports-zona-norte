// prospectActividad.js — la sección Actividad de la Ficha (spec §Ficha.5,
// docs/PROSPECT_CRM_SPEC.md) como LISTA DE EVENTOS TIPADOS:
//   { tipo, icono, titulo, detalle, at, por }
//
// Regla de crecimiento (lineamiento de F3): agregar un tipo de evento =
// agregar un builder ACÁ. La pantalla renderiza la lista genéricamente y no
// conoce los tipos — incorporar notas, recordatorios o mensajes enviados en
// futuras iteraciones no rediseña nada.
//
// v1 compone lo que YA existe:
//   - visitas (colección `visits` — la fuente RICA: outcome + notas + autor);
//   - eventos de `auditLog` del prospecto (alta, edición, calificación,
//     conversión, importación del descubrimiento, rehabilitación, borrado).
// Los audit con action "visit" se EXCLUYEN: duplicarían la visita rica.
// Una action desconocida no se inventa: se ignora hasta tener su builder.

const AUDIT_EVENTO = {
  create:  { icono: "🆕", titulo: "Alta" },
  update:  { icono: "✏️", titulo: "Edición" },
  qualify: { icono: "☑️", titulo: "Calificación actualizada" },
  convert: { icono: "🏪", titulo: "Convertido a mayorista" },
  import:  { icono: "🔎", titulo: "Importado del descubrimiento" },
  rehab:   { icono: "↩️", titulo: "Rehabilitado del descarte" },
  delete:  { icono: "🗑", titulo: "Borrado" },
};

// actividadDeProspecto({ prospectId, visits, auditLog }) → eventos DESC por fecha.
export function actividadDeProspecto({ prospectId, visits = [], auditLog = [] } = {}) {
  if (!prospectId) return [];
  const eventos = [];

  for (const v of visits) {
    if (!v || v.isDeleted || v.targetId !== prospectId) continue;
    eventos.push({
      tipo: "visita",
      icono: "📋",
      titulo: `Visita: ${v.outcome || "—"}`,
      detalle: v.notes || "",
      at: v.date || "",
      por: v.byUser || "",
    });
  }

  for (const a of auditLog) {
    if (!a || a.entityId !== prospectId || a.action === "visit") continue;
    const base = AUDIT_EVENTO[a.action];
    if (!base) continue;
    eventos.push({
      tipo: `audit_${a.action}`,
      icono: base.icono,
      titulo: base.titulo,
      detalle: a.description || "",
      at: a.timestamp || "",
      por: a.user || "",
    });
  }

  return eventos.sort((x, y) => String(y.at).localeCompare(String(x.at)));
}
