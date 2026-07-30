// discoveryImport.js — la ingesta de descubiertos a la app (contrato §6/§7).
// JS puro: recibe el staging + el estado vivo y devuelve decisiones; la UI
// pinta y el llamador persiste (setProspects / setDiscoverySuppressed).
//
// Dedup sobre identity.js — la MISMA fuente de identidad que usa el runner.
// Claves, en orden de fuerza (§6):
//   1. placeId / clavesIdentidad ⇒ re-import del mismo descubrimiento.
//   2. Teléfono normalizado ⇒ misma entidad (45% de cobertura real).
//   3. Nombre+dirección vía clavesDe (100% de cobertura real).
// Supresión (§7): descartar RECUERDA — la identidad queda en
// discoverySuppressed y no vuelve a aparecer salvo rehabilitación explícita.
// Regla heredada: sin identidad suficiente (web o nombre+dirección) no se
// puede suprimir — un bloqueo que no puede matchear es un hueco silencioso.

import { clavesDe } from "./identity.js";

// Teléfono → clave de identidad. Normalización AR pragmática: solo dígitos,
// sin prefijo internacional (54/549) ni 0 inicial; se comparan los últimos 10
// (área+línea). Menos de 6 dígitos no identifican nada ⇒ sin clave.
export function normalizarTelefono(tel) {
  let d = String(tel || "").replace(/\D/g, "");
  if (d.startsWith("549")) d = d.slice(3);
  else if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length > 10) d = d.slice(-10);
  return d.length >= 6 ? d : "";
}

// Claves de identidad de CUALQUIER registro del sistema (descubierto staged,
// prospecto vivo, cliente, entrada de supresión). Superset de las del runner:
// suma placeId y teléfono, que el descubrimiento trae y el retail también.
export function clavesDeRegistro(x = {}) {
  const claves = new Set(clavesDe(x.web, x.businessName || x.name || x.nombre, x.address || x.direccion));
  for (const k of x.clavesIdentidad || x.claves || []) claves.add(k);
  if (String(x.placeId || "").trim()) claves.add("pid:" + String(x.placeId).trim());
  const tel = normalizarTelefono(x.phone ?? x.telefono);
  if (tel) claves.add("tel:" + tel);
  return claves;
}

// ¿Tiene identidad suficiente para un bloqueo que garantice matchear? (§7)
export function puedeSuprimirse(p = {}) {
  const nombre = String(p.businessName || p.nombre || "").trim();
  const direccion = String(p.address || p.direccion || "").trim();
  return !!(String(p.web || "").trim() || (nombre && direccion));
}

const interseca = (claves, set) => [...claves].find(k => set.has(k)) || null;

// revisarDescubiertos({ prospectos, prospects, clients, suprimidos }) →
//   { items: [{prospecto, estado, motivo}], importables, duplicados, suprimidos }
// Estados: "importable" | "duplicado" (ya existe como prospecto/cliente o
// repetido en el lote) | "suprimido" (descartado con memoria — no se ofrece).
// prospects/clients son las colecciones CRUDAS: acá se filtra soft-delete
// (un prospecto borrado en Papelera no bloquea el re-descubrimiento; un
// suprimido sí — esa es la diferencia entre borrar y descartar).
export function revisarDescubiertos({ prospectos = [], prospects = [], clients = [], suprimidos = [] } = {}) {
  const vivos = new Map();  // clave → etiqueta de quién la ocupa (para el motivo)
  for (const p of prospects) {
    if (!p || p.isDeleted) continue;
    for (const k of clavesDeRegistro(p)) vivos.set(k, `prospecto "${p.businessName || p.name}"`);
  }
  for (const c of clients) {
    if (!c || c.isDeleted) continue;
    for (const k of clavesDeRegistro(c)) vivos.set(k, `cliente "${c.businessName || c.name}"`);
  }
  const suprSet = new Set();
  for (const s of suprimidos) for (const k of clavesDeRegistro(s)) suprSet.add(k);

  const items = [];
  for (const p of prospectos) {
    const claves = clavesDeRegistro(p);
    const kSupr = interseca(claves, suprSet);
    if (kSupr) {
      items.push({ prospecto: p, estado: "suprimido", motivo: "descartado antes — rehabilitalo para volver a verlo" });
      continue;
    }
    const kVivo = interseca(claves, new Set(vivos.keys()));
    if (kVivo) {
      items.push({ prospecto: p, estado: "duplicado", motivo: `ya existe: ${vivos.get(kVivo)}` });
      continue;
    }
    // Reservar las claves dentro del lote: dos avistajes del mismo negocio en
    // una corrida no generan dos altas.
    for (const k of claves) vivos.set(k, `descubierto "${p.businessName}"`);
    items.push({ prospecto: p, estado: "importable", motivo: "" });
  }

  return {
    items,
    importables: items.filter(i => i.estado === "importable").length,
    duplicados: items.filter(i => i.estado === "duplicado").length,
    suprimidos: items.filter(i => i.estado === "suprimido").length,
  };
}

// Identidades ya conocidas por el sistema, para inyectar al runner como
// `existentes` (el worker las arma desde Firestore antes de scrapear).
// Incluye: prospectos vivos, clientes vivos y descubiertos todavía en staging
// (una búsqueda repetida antes de revisar la anterior no re-staged lo mismo).
// Los suprimidos NO van acá: viajan aparte al runner (cuentan como
// saltadosSuprimidos, no como duplicados — contrato §3).
export function identidadesExistentes({ prospects = [], clients = [], staging = [] } = {}) {
  const claves = new Set();
  for (const p of prospects) {
    if (!p || p.isDeleted) continue;
    for (const k of clavesDeRegistro(p)) claves.add(k);
  }
  for (const c of clients) {
    if (!c || c.isDeleted) continue;
    for (const k of clavesDeRegistro(c)) claves.add(k);
  }
  for (const doc of staging) {
    for (const p of doc?.prospectos || []) {
      for (const k of clavesDeRegistro(p)) claves.add(k);
    }
  }
  return claves;
}

// Descubierto confirmado → prospecto FINAL (nace en IZN acá — contrato §5).
// id/fechas los inyecta el llamador (uid()/now() viven en la app).
export function altaDesdeDescubierto(p, { id, at } = {}) {
  return { id, ...p, foundAt: at, lastContactAt: at };
}

// Descartado → entrada de supresión (§7). Lanza si la identidad no alcanza
// (validar antes con puedeSuprimirse; la regla heredada no guarda silencioso).
export function suprimirDescubierto(p, { id, motivo = "descartado en revisión", at, por } = {}) {
  if (!puedeSuprimirse(p)) {
    throw new Error("supresión con identidad insuficiente: exige web o nombre+dirección (P5)");
  }
  return {
    id,
    nombre: p.businessName || "",
    direccion: p.address || "",
    web: p.web || "",
    claves: [...clavesDeRegistro(p)].sort(),
    motivo, at, por,
  };
}
