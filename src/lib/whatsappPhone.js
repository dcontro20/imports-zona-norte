// whatsappPhone.js — normalización de teléfonos AR al formato que WhatsApp
// exige en sus links (549 + área + abonado, sin 0 y sin 15) + el builder del
// link de contacto. Handoff 2026-08-10 (flujo de contacto por WhatsApp).
//
// NO confundir con normalizarTelefono() de discovery/discoveryImport.js: esa
// produce claves de IDENTIDAD para dedup (últimos 10 dígitos, sin prefijo) y
// tiene golden tests propios. Esta produce el número que WhatsApp entiende.
// Son dos preguntas distintas sobre el mismo dato: "¿es el mismo negocio?"
// vs "¿a dónde mando el mensaje?".
//
// REGLA ESTRUCTURAL DEL 15 (gate F2): el 15 se elimina únicamente cuando la
// ESTRUCTURA lo delata como prefijo móvil — número nacional de 12 dígitos =
// área + 15 + abonado (un número completo tiene 10; los 2 que sobran son el
// 15). Un 15 adentro de un número de 10 dígitos es parte del abonado y se
// queda (el bug real: "011 4415-8435" perdía su 15 interno y moría en null).
//
// Validación final: exactamente 10 dígitos nacionales con forma de área
// argentina real — "11" (AMBA) o 2xx/3xx (interior; los códigos de área AR
// empiezan todos con 11, 2 o 3). Lo que no se puede determinar con seguridad
// (largo raro, "15..." sin área, área inexistente) → null: mejor sin botón
// que un link a otro número.

// ¿Los 10 dígitos nacionales tienen forma de número argentino completo?
const NACIONAL_VALIDO = /^(11|[23]\d)\d{8}$/;

// n de 12 dígitos → 10 sin el prefijo 15, o null si no hay un 15 que la
// estructura identifique. El área manda dónde puede estar el 15:
//   · área "11" (la única de 2 dígitos) → 15 en posición 2
//   · áreas de 3 o 4 dígitos (empiezan con 2 o 3) → 15 en posición 3 o 4
// Las tres reglas son mutuamente excluyentes (una empieza con 11, las otras
// con 2/3, y posición 3 y 4 no pueden ser "15" a la vez) — el Set es un
// cinturón por si alguna vez dejan de serlo: dos candidatos ≠ certeza ⇒ null.
function sacarPrefijo15(n) {
  const candidatos = new Set();
  if (n.startsWith("11") && n.slice(2, 4) === "15") candidatos.add("11" + n.slice(4));
  if (/^[23]/.test(n)) {
    for (const largo of [3, 4]) {
      if (n.slice(largo, largo + 2) === "15") candidatos.add(n.slice(0, largo) + n.slice(largo + 2));
    }
  }
  return candidatos.size === 1 ? candidatos.values().next().value : null;
}

// normalizarWhatsApp("011 2363-1422") → "5491123631422" · inválido → null.
// Acepta las formas reales: 011/11 + número, otros códigos de área, 0+área+
// 15+abonado, +54 9 / 54 9 / 54 / 0054 adelante, y cualquier decoración
// (espacios, guiones, paréntesis) — solo importan los dígitos.
export function normalizarWhatsApp(raw) {
  if (!raw) return null;

  let n = String(raw).replace(/\D/g, "");

  if (n.startsWith("00")) n = n.slice(2);   // internacional con doble cero
  if (n.startsWith("549")) n = n.slice(3);  // móvil internacional
  else if (n.startsWith("54")) n = n.slice(2); // internacional sin el 9
  if (n.startsWith("0")) n = n.slice(1);    // prefijo troncal nacional

  // 12 dígitos = área + 15 + abonado: el único caso donde el 15 sobra.
  if (n.length === 12) n = sacarPrefijo15(n);

  if (!n || !NACIONAL_VALIDO.test(n)) return null;
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
