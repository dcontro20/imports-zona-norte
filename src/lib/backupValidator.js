// src/lib/backupValidator.js
//
// Validador de integridad de backups JSON. Calcula un checksum determinístico
// del contenido y lo embebe en el backup. Al restaurar, recalcula y compara.
//
// El checksum es un hash simple (DJB2) de la representación JSON ordenada
// — no es criptográfico (no necesitamos seguridad, solo detección de
// corrupción accidental).

import {
  validateBatch, ProductSchema, SaleSchema, ClientSchema, ExpenseSchema,
  ProspectSchema, VisitSchema, RouteSchema, DiscoverySuppressedSchema,
} from "./schemas.js";

// Hash determinístico de un string (DJB2). Suficiente para detectar
// modificación accidental, no para verificar autenticidad.
export function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

// Serializa con claves ordenadas para que el hash sea estable.
function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

// Empaqueta los datos con checksum y metadata.
export function packBackup(data, metadata = {}) {
  const payload = data || {};
  const checksum = djb2Hash(stableStringify(payload));
  return {
    _meta: {
      version: 1,
      createdAt: new Date().toISOString(),
      checksum,
      ...metadata,
    },
    data: payload,
  };
}

// Valida un backup recibido: chequea checksum + (opcionalmente) schemas.
export function validateBackup(backup, { strictSchemas = false } = {}) {
  if (!backup || typeof backup !== "object") {
    return { valid: false, errors: ["Backup vacío o no es objeto"], summary: null };
  }
  if (!backup._meta || !backup.data) {
    return { valid: false, errors: ["Falta _meta o data"], summary: null };
  }
  const errors = [];

  // Validar checksum
  const expected = backup._meta.checksum;
  const actual = djb2Hash(stableStringify(backup.data));
  if (expected !== actual) {
    errors.push(`Checksum no coincide. Esperado: ${expected}, actual: ${actual}. El backup puede estar corrupto.`);
  }

  // Validar schemas (opcional, soft)
  const schemaResults = {};
  if (strictSchemas) {
    if (Array.isArray(backup.data.products)) {
      schemaResults.products = validateBatch(ProductSchema, backup.data.products);
    }
    if (Array.isArray(backup.data.sales)) {
      schemaResults.sales = validateBatch(SaleSchema, backup.data.sales);
    }
    if (Array.isArray(backup.data.clients)) {
      schemaResults.clients = validateBatch(ClientSchema, backup.data.clients);
    }
    if (Array.isArray(backup.data.expenses)) {
      schemaResults.expenses = validateBatch(ExpenseSchema, backup.data.expenses);
    }
    // CRM de prospección (ciclo B3)
    if (Array.isArray(backup.data.prospects)) {
      schemaResults.prospects = validateBatch(ProspectSchema, backup.data.prospects);
    }
    if (Array.isArray(backup.data.visits)) {
      schemaResults.visits = validateBatch(VisitSchema, backup.data.visits);
    }
    if (Array.isArray(backup.data.routes)) {
      schemaResults.routes = validateBatch(RouteSchema, backup.data.routes);
    }
    if (Array.isArray(backup.data.discoverySuppressed)) {
      schemaResults.discoverySuppressed = validateBatch(DiscoverySuppressedSchema, backup.data.discoverySuppressed);
    }
  }

  const summary = {
    checksumValid: expected === actual,
    metadata: backup._meta,
    counts: Object.keys(backup.data).reduce((acc, k) => {
      const v = backup.data[k];
      if (Array.isArray(v)) acc[k] = v.length;
      else if (v && typeof v === "object") acc[k] = "obj";
      else acc[k] = "scalar";
      return acc;
    }, {}),
    schemaResults: strictSchemas ? schemaResults : null,
  };

  return {
    valid: errors.length === 0,
    errors,
    summary,
  };
}
