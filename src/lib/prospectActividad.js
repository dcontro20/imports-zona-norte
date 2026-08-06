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

// Hechos del ciclo v2 (prospectHechos.js §2): los que la etapa DERIVA. Cada
// uno es un builder — la pantalla sigue sin conocer los tipos.
const HECHO_EVENTO = [
  { campo: "analizadoAt", autor: "analizadoPor", tipo: "analizado", icono: "🔍", titulo: "Analizado — vale la pena trabajarlo" },
  { campo: "mensajeEnviadoAt", autor: "mensajeEnviadoPor", tipo: "mensaje_enviado", icono: "💬", titulo: "Presentación enviada" },
  { campo: "respondioAt", tipo: "respuesta", icono: "🟢", titulo: "Respondió" },
  { campo: "noRespondeAt", tipo: "sin_respuesta", icono: "🔴", titulo: "No responde" },
  { campo: "negociacionAt", tipo: "negociacion", icono: "🤝", titulo: "Pasó a negociación" },
];

// actividadDeProspecto({ prospect, prospectId, visits, auditLog }) → eventos
// DESC por fecha. `prospect` es opcional por compatibilidad: sin él salen las
// visitas y el auditLog (v1); con él salen además los hechos del ciclo v2.
export function actividadDeProspecto({ prospect = null, prospectId, visits = [], auditLog = [] } = {}) {
  const id = prospectId || prospect?.id;
  if (!id) return [];
  const eventos = [];

  for (const h of HECHO_EVENTO) {
    const at = prospect?.[h.campo];
    if (!at) continue;
    eventos.push({
      tipo: h.tipo, icono: h.icono, titulo: h.titulo, detalle: "",
      at, por: (h.autor && prospect[h.autor]) || "",
    });
  }

  for (const v of visits) {
    if (!v || v.isDeleted || v.targetId !== id) continue;
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
    if (!a || a.entityId !== id || a.action === "visit") continue;
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
