// whatsappPhone.js — normalización de teléfonos AR al formato que WhatsApp
// exige en sus links (549 + área + abonado, sin 0 y sin 15) + el builder del
// link de contacto. Handoff 2026-08-10 (flujo de contacto por WhatsApp).
//
// NO confundir con normalizarTelefono() de discovery/discoveryImport.js: esa
// produce claves de IDENTIDAD para dedup (últimos 10 dígitos, sin prefijo) y
// tiene golden tests propios. Esta produce el número que WhatsApp entiende.
// Son dos preguntas distintas sobre el mismo dato: "¿es el mismo negocio?"
// vs "¿a dónde mando el mensaje?".

// normalizarWhatsApp("011 2363-1422") → "5491123631422" · inválido → null.
// Edge conocido y aceptado: un abonado que legítimamente empiece con 15
// después del área (ej. "11 1523-4567") pierde ese 15 por la regla del
// prefijo de celular y cae en null por el check de largo. Indistinguible
// del formato viejo con 15 — se prefiere null a un link a otro número.
export function normalizarWhatsApp(raw) {
  if (!raw) return null;

  let n = String(raw).replace(/\D/g, "");

  // Ya viene internacional
  if (n.startsWith("549")) return n;
  if (n.startsWith("54")) n = n.slice(2);

  n = n.replace(/^0/, "");             // 01123631422 -> 1123631422
  n = n.replace(/^(\d{2,4})15/, "$1"); // saca el 15 después del área

  // Largo esperado: área (2-4) + abonado (6-8) = 10 dígitos
  if (n.length < 9 || n.length > 11) return null;

  return "549" + n;
}

// El link que deja el chat abierto con el texto cargado, a un Enter de
// mandarlo. Mobile → wa.me (deep-link directo a la app, sin landing con el
// número ya normalizado); desktop → web.whatsapp.com (WhatsApp Web con
// sesión iniciada, sin pantalla intermedia). Sin número válido → null: el
// llamador esconde el botón, no arma un link roto.
//
// Límite no negociable (handoff): WhatsApp no permite disparar el envío
// desde una URL. El Enter final siempre lo da una persona.
export function buildWaUrl(telefonoWa, texto = "", { isMobile = false } = {}) {
  if (!telefonoWa) return null;
  const text = texto ? encodeURIComponent(texto) : "";
  if (isMobile) return `https://wa.me/${telefonoWa}${text ? `?text=${text}` : ""}`;
  return `https://web.whatsapp.com/send?phone=${telefonoWa}${text ? `&text=${text}` : ""}`;
}
