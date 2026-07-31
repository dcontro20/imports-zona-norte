// identity.js — identidad de negocios descubiertos: slug estable, claves de
// identidad y detección de red-social-como-web.
// Port 1:1 de slug / _claves_de / _red_de (Atlas, atlas/prospect/discover.py),
// validado contra izn_discovery.golden.json. ÚNICA fuente de identidad del
// sistema de discovery: la usan el runner (dedup al descubrir), el import
// (dedup contra prospectos/clientes vivos, F2) y la supresión (F2/F3).
// Si dos módulos calcularan claves distinto, el dedup se parte — no duplicar.

// ascii-fold + minúsculas + no-alfanumérico → '-' (ids estables).
export function slug(texto) {
  // Espejo de: normalize("NFKD") → encode(ascii, ignore) → lower → mapear.
  const ascii = String(texto ?? "").normalize("NFKD").replace(/[^\x00-\x7F]/g, "");
  const mapeado = [...ascii.toLowerCase()].map(c => (/[a-z0-9]/.test(c) ? c : "-")).join("");
  return mapeado.split("-").filter(Boolean).join("-");
}

const DOMINIOS_RED = {
  "facebook.com": "facebook",
  "instagram.com": "instagram",
  "tiktok.com": "tiktok",
  "linktr.ee": "linktree",
};

// Espejo del netloc de urlparse (Python): hay host solo si la URL trae "//"
// al inicio o inmediatamente después de un esquema válido. "facebook.com/x"
// sin esquema es un PATH para urlparse (netloc vacío) — y por lo tanto NO se
// detecta como red. La fixture cubre este caso a propósito.
function netloc(url) {
  const u = String(url || "");
  const i = u.indexOf("//");
  if (i === -1) return "";
  const antes = u.slice(0, i);
  if (antes !== "" && !/^[a-zA-Z][a-zA-Z0-9+.-]*:$/.test(antes)) return "";
  const resto = u.slice(i + 2);
  const fin = resto.search(/[/?#]/);
  return fin === -1 ? resto : resto.slice(0, fin);
}

// Nombre de la red social si la URL es de una plataforma conocida, sino "".
export function redDe(url) {
  const host = netloc(url).toLowerCase().replace(/^www\./, "");
  for (const [dom, red] of Object.entries(DOMINIOS_RED)) {
    if (host === dom || host.endsWith("." + dom)) return red;
  }
  return "";
}

// Claves de identidad de un negocio: por URL (web o red social) y/o por
// nombre+dirección slugificados. Un negocio sin web y sin dirección no tiene
// identidad rastreable (Set vacío) — igual que en la referencia.
export function clavesDe(web, nombre, direccion) {
  const claves = new Set();
  const w = String(web || "").trim();
  if (w) claves.add("url:" + w.replace(/\/+$/, "").toLowerCase());
  if (String(nombre || "").trim() && String(direccion || "").trim()) {
    claves.add(`nd:${slug(nombre)}|${slug(direccion)}`);
  }
  return claves;
}
