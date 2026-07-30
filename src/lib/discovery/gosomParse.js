// gosomParse.js — parser de registros NDJSON de gosom/google-maps-scraper.
// Port 1:1 de parse_gosom_record + _horarios_completos (Atlas,
// atlas/adapters/discover_gosom.py). Atlas es la implementación de REFERENCIA:
// la equivalencia se valida contra izn_discovery.golden.json (generada solo
// allá) sin tolerancias. Después de eso, esta copia es soberana.
//
// Regla P6 (heredada y vinculante): de la salida de gosom se toman SOLO hechos
// del negocio. user_reviews (texto con copyright), images/thumbnail (fotos),
// owner (dato personal del dueño de la ficha), popular_times y about se
// DESCARTAN acá, en origen. No agregar campos sin pasar por el contrato.
//
// Mañas del original que este port replica a propósito:
//   - rating 0 ⇒ null (Python: `and rating` es falsy con 0) — "sin rating" y
//     "rating cero" se tratan igual porque Maps no muestra fichas con 0 real.
//   - review_count 0 SÍ se conserva (0 reseñas es un hecho medido).
//   - Fallback al typo "longtitude" que gosom emite en algunas versiones.
//   - horarios_completos: la ficha declara 7 días ⇒ "si"; algunos ⇒ "no";
//     nada ⇒ "sin_datos".
//
// Los nombres de campo del RawBusiness se mantienen IDÉNTICOS al contrato de
// referencia (snake_case incluido: reviews_count, horarios_completos,
// url_origen, id_externo) — la fixture compara objeto contra objeto.

const str = (v) => String(v || "").trim();

function horariosCompletos(openHours) {
  // Espejo de `not open_hours` de Python: null/undefined/""/0 y también
  // objeto o lista vacíos cuentan como "nada declarado".
  if (!openHours) return "sin_datos";
  const n = typeof openHours === "string" ? openHours.length : Object.keys(openHours).length;
  if (n === 0) return "sin_datos";
  return n >= 7 ? "si" : "no";
}

// Un registro NDJSON de gosom → RawBusiness. Función pura (testeable offline).
// Todo lo no listado acá se descarta deliberadamente (P6).
export function parseGosomRecord(d) {
  const emails = d.emails || [];
  const rating = d.review_rating;
  const count = d.review_count;
  return {
    nombre: str(d.title),
    categoria: str(d.category),
    direccion: str(d.address),
    telefono: str(d.phone),
    web: str(d.web_site),
    email: emails.length ? String(emails[0]).trim() : "",
    rating: typeof rating === "number" && rating ? rating : null,
    reviews_count: typeof count === "number" ? Math.trunc(count) : null,
    horarios_completos: horariosCompletos(d.open_hours),
    latitud: d.latitude ?? null,
    longitud: d.longitude ?? d.longtitude ?? null,
    url_origen: str(d.link),
    id_externo: str(d.place_id),
  };
}
