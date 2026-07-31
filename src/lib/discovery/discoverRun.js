// discoverRun.js — el runner de descubrimiento como FUNCIÓN PURA por inyección.
// Port del núcleo de decisiones de descubrir() (Atlas, atlas/prospect/discover.py),
// validado contra izn_discovery.golden.json. La diferencia arquitectónica es
// deliberada: en la referencia el estado (identidades ya vistas, suprimidos)
// viene del filesystem; acá lo INYECTA el llamador — el worker lo arma desde
// Firestore (prospects + clients + staging + suprimidos) y esta función no
// sabe de dónde salió. Más testeable, mismo comportamiento.
//
// Reglas heredadas (vinculantes):
//   - P2: el tope manda — se trunca aunque el proveedor lo ignore.
//   - P5: suprimido no se re-descubre (se chequea ANTES que duplicado).
//   - Idempotencia: identidad ya vista (inyectada o de este mismo run) ⇒ dup.
//   - Red-como-web: si la "web" es facebook/instagram/tiktok/linktree, se
//     etiqueta como red social — no como sitio.
//   - Fail-loud: un raw sin nombre es un bug del proveedor ⇒ excepción,
//     jamás se traga.

import { clavesDe, redDe } from "./identity.js";

export const TOPE_DEFAULT = 60;   // default del encargo (heredado de la referencia)
export const TOPE_MAX = 100;      // techo duro anti-crawling (P2, heredado)

// Validación de la búsqueda de un job (el validate_encargo de IZN — nuestros
// campos, mismas reglas de fondo). Devuelve lista de problemas; vacía = OK.
export function validarBusqueda({ termino, ubicacion, zona, tope } = {}) {
  const probs = [];
  if (!String(termino || "").trim()) probs.push("GRAVE: búsqueda sin término (P2)");
  if (!String(ubicacion || "").trim()) probs.push("GRAVE: búsqueda sin ubicación (P2)");
  if (!String(zona || "").trim()) probs.push("GRAVE: búsqueda sin zona (las señales de zona del engine la necesitan)");
  if (!Number.isInteger(tope) || tope <= 0) {
    probs.push(`GRAVE: tope inválido (${tope}) (P2)`);
  } else if (tope > TOPE_MAX) {
    probs.push(`GRAVE: tope ${tope} > ${TOPE_MAX} (techo anti-crawling, P2)`);
  }
  return probs;
}

const interseca = (claves, set) => [...claves].some(k => set.has(k));

// discoverRun({ raws, tope, existentes, suprimidos }) → decisiones.
//   raws        RawBusiness[] (salida de parseGosomRecord, en orden del proveedor)
//   tope        techo del encargo (P2)
//   existentes  Iterable<string> de claves de identidad ya conocidas
//   suprimidos  [{web, nombre, direccion}] — el ledger; las claves se derivan acá
// Devuelve { descubiertos: [{raw, claves, red}], saltadosSuprimidos, saltadosDuplicados }.
// `claves` sale ordenado (determinismo); `red` es la plataforma detectada o "".
export function discoverRun({ raws, tope = TOPE_DEFAULT, existentes = [], suprimidos = [] } = {}) {
  const suprimidosKeys = new Set();
  for (const s of suprimidos) {
    for (const k of clavesDe(s.web, s.nombre, s.direccion)) suprimidosKeys.add(k);
  }
  const vistas = new Set(existentes);

  const descubiertos = [];
  let saltadosSuprimidos = 0, saltadosDuplicados = 0;

  for (const raw of (raws || []).slice(0, tope)) {
    if (!String(raw.nombre || "").trim()) {
      throw new Error("raw sin nombre: bug del proveedor de descubrimiento (fail-loud)");
    }
    const claves = clavesDe(raw.web, raw.nombre, raw.direccion);
    if (interseca(claves, suprimidosKeys)) { saltadosSuprimidos++; continue; }
    if (interseca(claves, vistas)) { saltadosDuplicados++; continue; }
    for (const k of claves) vistas.add(k);
    descubiertos.push({ raw, claves: [...claves].sort(), red: redDe(raw.web) });
  }

  return { descubiertos, saltadosSuprimidos, saltadosDuplicados };
}
