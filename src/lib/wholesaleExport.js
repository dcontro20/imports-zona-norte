// src/lib/wholesaleExport.js
//
// Export a CSV de clientes mayoristas y prospectos. Funciones PURAS (devuelven el
// string CSV); el componente hace el download con Blob. Mismo escaping que Export.jsx.

function escape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(headers, rows) {
  return [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
}

// CSV de clientes mayoristas (type="mayorista", no borrados).
export function kioscosToCSV(clients = []) {
  const headers = ["Comercio", "Responsable", "Tipo", "Tier", "Zona", "Dirección", "Teléfono", "Contacto", "Estado", "Crédito", "Límite ARS"];
  const rows = (clients || [])
    .filter(c => c && !c.isDeleted && c.type === "mayorista")
    .sort((a, b) => (a.businessName || a.name || "").localeCompare(b.businessName || b.name || ""))
    .map(c => [
      c.businessName || "", c.name || "", c.businessType || "", c.wholesaleTier || "",
      c.zone || "", c.address || "", c.phone || "", c.contactName || "",
      c.pipelineStage || "", c.creditEnabled ? "sí" : "no", c.creditEnabled ? (c.creditLimitARS || 0) : "",
    ]);
  return toCSV(headers, rows);
}

// CSV de prospectos activos (sin convertir, no borrados).
export function prospectsToCSV(prospects = []) {
  const headers = ["Comercio", "Zona", "Etapa", "Origen", "Teléfono", "Contacto", "Detectado", "Últ. contacto"];
  const rows = (prospects || [])
    .filter(p => p && !p.isDeleted && !p.convertedClientId)
    .sort((a, b) => (a.businessName || "").localeCompare(b.businessName || ""))
    .map(p => [
      p.businessName || "", p.zone || "", p.pipelineStage || "", p.source || "",
      p.phone || "", p.contactName || "",
      (p.foundAt || "").slice(0, 10), (p.lastContactAt || "").slice(0, 10),
    ]);
  return toCSV(headers, rows);
}
