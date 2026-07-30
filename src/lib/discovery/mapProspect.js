// mapProspect.js — RawBusiness descubierto → prospecto IZN (shape del alta
// manual de Pipeline + passthrough). Implementa la tabla §5 del contrato
// (docs/DISCOVERY_ENGINE_CONTRATO.md). Acá NO hay equivalencia con Atlas que
// validar: el envoltorio de dominio de la referencia (Prospect/Encargo/Source)
// era de Atlas; el de Imports es este documento. Se testea contra el contrato.
//
// Reglas del contrato que este mapping cumple:
//   - contactName SIEMPRE vacío: el scraping no identifica al decisor, y la
//     señal fit_decisor del engine debe rendir "no" honestamente.
//   - source "descubrimiento" (op_referido no se afecta: ≠"referido" ⇒ "no").
//   - zone viene del JOB (Diego la elige al buscar), no de la dirección.
//   - Los extras (rating, reviews, horarios, web/red, categoría) se preservan
//     como passthrough para la calibración futura de la rúbrica — HOY no
//     alimentan señales (rúbrica izn-v1 congelada).
//   - id y createdAt NO se ponen acá: los pone el import de la app al
//     confirmar Diego (el prospecto nace en IZN en ese momento).
//   - lat/lng SÍ viajan: el port mapea RawBusiness directo (la referencia los
//     perdía en su propio envoltorio; acá salen gratis).

// rawToProspect(itemDescubierto, contexto) → doc prospecto IZN (sin id).
//   item: {raw, claves, red} — un descubierto de discoverRun().
//   contexto: {zona, termino, ubicacion, fecha} — del job que lo trajo.
export function rawToProspect({ raw, claves, red }, { zona, termino, ubicacion, fecha } = {}) {
  return {
    // --- campos del alta manual de Pipeline ---
    businessName: raw.nombre,
    zone: String(zona || "").trim(),
    address: raw.direccion,
    phone: raw.telefono,
    contactName: "",
    source: "descubrimiento",
    notes: "",
    lat: raw.latitud ?? "",
    lng: raw.longitud ?? "",
    pipelineStage: "prospecto",
    // --- procedencia (espíritu P1: todo dato con origen) ---
    via: "google_maps",
    descubiertoTermino: String(termino || ""),
    descubiertoEn: String(ubicacion || ""),
    descubiertoAt: String(fecha || ""),
    placeId: raw.id_externo,
    urlOrigen: raw.url_origen,
    clavesIdentidad: claves,
    // --- passthrough para calibración futura (P6 ya filtró en origen) ---
    web: raw.web,
    redSocial: red || "",
    categoria: raw.categoria,
    email: raw.email,
    rating: raw.rating,
    reviewsCount: raw.reviews_count,
    horariosCompletos: raw.horarios_completos,
  };
}
