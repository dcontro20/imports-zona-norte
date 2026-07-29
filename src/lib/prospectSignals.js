// prospectSignals.js — ADAPTADOR prospecto → señales TRI del Prospect Engine.
// El ÚNICO módulo que conoce ambos mundos: el documento Firestore de Imports
// (prospect + visits + clients + sales) y el contrato de señales del motor
// (prospectScoring.js). El motor jamás ve el documento; la UI jamás arma señales.
//
// Regla de honestidad (innegociable):
//   - Dato AUSENTE en un contexto que sí fue provisto ⇒ es un "no"/"si" real
//     (nuestros propios registros son autoritativos: 0 visitas = nunca visitado).
//   - Contexto NO provisto (undefined) ⇒ "sin_datos" (no podemos saber).
//   Por eso los datasets del contexto NO tienen default []: distinguir
//   "no me pasaste las visitas" de "no hay visitas" es la diferencia entre
//   sin_datos y un dato medido.
//
// prospect.calificacion (diseño §6.2, se captura en la visita — Fase 4):
//   { vendeCategoria, proveedorEstable, tamano, movimiento, decisorVisto,
//     competenciaVisible*, actualizadoAt, actualizadoPor }
//   Prospectos sin calificar rinden sin_datos en esas señales — sin migración.
//   (*) competenciaVisible: campo PROVISIONAL agregado por la fila
//   op_sin_competencia_visible del borrador §7, que no tenía respaldo en §6.2.

import { zonesCoverage, lastVisitFor } from "../prospecting.js";
import { productsByZone } from "../wholesaleIntelligence.js";

const OUTCOMES_INTERES = ["interesado", "volver"];
const OUTCOMES_POSITIVOS = ["interesado", "volver", "vendido"];

// Misma normalización de zona que zonesCoverage (prospecting.js no la exporta).
const normZone = (z) => (z || "").trim() || "Sin zona";

const senal = (valor, fuentes = []) => ({ valor, fuentes });
const SIN_DATOS = () => senal("sin_datos", []);

// TRI desde la calificación de visita, con inversión opcional (la calificación
// registra el hecho — "tiene proveedor" — y la señal pregunta el gap — "¿NO tiene?").
function desdeCalificacion(calif, campo, { invertir = false } = {}) {
  const v = calif?.[campo];
  if (v !== "si" && v !== "no") return SIN_DATOS();
  const fecha = (calif.actualizadoAt || "").slice(0, 10);
  const fuente = fecha ? `calificacion_${fecha}` : "calificacion";
  const val = invertir ? (v === "si" ? "no" : "si") : v;
  return senal(val, [fuente]);
}

// prospectToSignals(prospect, contexto) → { [señalId]: { valor, fuentes } }
// Contexto (todo opcional — lo que falte degrada a sin_datos en sus señales):
//   visits   → op_interes_declarado, op_nunca_visitado, fit_receptividad
//   clients  → op_zona_sin_mayorista, fit_zona_reparto (vía zonesCoverage)
//   sales+products+clients → op_producto_vecino (vía productsByZone)
export function prospectToSignals(prospect, { visits, clients, sales, products } = {}) {
  const p = prospect || {};
  const calif = p.calificacion;
  const s = {};

  // --- calificación de visita (fuente humana) ---
  s.op_sin_proveedor = desdeCalificacion(calif, "proveedorEstable", { invertir: true });
  s.op_no_vende = desdeCalificacion(calif, "vendeCategoria", { invertir: true });
  s.op_sin_competencia_visible = desdeCalificacion(calif, "competenciaVisible", { invertir: true });
  s.fit_movimiento = desdeCalificacion(calif, "movimiento");
  // tamano es escala (chico/medio/grande), no TRI: medio o grande ⇒ sirve para volumen.
  if (calif?.tamano === "medio" || calif?.tamano === "grande" || calif?.tamano === "chico") {
    const fecha = (calif.actualizadoAt || "").slice(0, 10);
    s.fit_tamano = senal(calif.tamano === "chico" ? "no" : "si",
                         [fecha ? `calificacion_${fecha}` : "calificacion"]);
  } else {
    s.fit_tamano = SIN_DATOS();
  }

  // --- visitas (bitácora propia = autoritativa) ---
  if (Array.isArray(visits)) {
    const ultima = lastVisitFor(visits, p.id);
    const propias = visits.filter(v => v && !v.isDeleted && v.targetId === p.id);
    if (ultima) {
      const f = [`visita_${(ultima.date || "").slice(0, 10)}`];
      s.op_nunca_visitado = senal("no", f);
      s.op_interes_declarado = senal(OUTCOMES_INTERES.includes(ultima.outcome) ? "si" : "no", f);
      const positiva = propias.find(v => OUTCOMES_POSITIVOS.includes(v.outcome));
      s.fit_receptividad = positiva
        ? senal("si", [`visita_${(positiva.date || "").slice(0, 10)}`])
        : senal("no", f);
    } else {
      s.op_nunca_visitado = senal("si", ["visits"]);
      s.op_interes_declarado = SIN_DATOS();   // sin visitas no hay outcome que leer
      s.fit_receptividad = SIN_DATOS();
    }
  } else {
    s.op_nunca_visitado = SIN_DATOS();
    s.op_interes_declarado = SIN_DATOS();
    s.fit_receptividad = SIN_DATOS();
  }

  // --- cobertura de zona (clientes mayoristas propios) ---
  if (Array.isArray(clients)) {
    const zona = normZone(p.zone);
    const cov = zonesCoverage({ clients }).find(z => z.zone === zona);
    const activos = cov ? cov.activos : 0;
    s.op_zona_sin_mayorista = senal(activos === 0 ? "si" : "no", ["zonesCoverage"]);
    s.fit_zona_reparto = senal(activos > 0 ? "si" : "no", ["zonesCoverage"]);
  } else {
    s.op_zona_sin_mayorista = SIN_DATOS();
    s.fit_zona_reparto = SIN_DATOS();
  }

  // --- demanda probada en la zona (ventas mayoristas propias) ---
  if (Array.isArray(sales) && Array.isArray(products) && Array.isArray(clients)) {
    const porZona = productsByZone(clients, sales, products);
    const rota = (porZona[normZone(p.zone)] || []).some(x => (x.qty || 0) > 0);
    s.op_producto_vecino = senal(rota ? "si" : "no", ["productsByZone"]);
  } else {
    s.op_producto_vecino = SIN_DATOS();
  }

  // --- ficha del prospecto ---
  s.op_referido = p.source
    ? senal(p.source === "referido" ? "si" : "no", ["prospect.source"])
    : SIN_DATOS();
  // La ficha ES la identificación del decisor: sin nombre+teléfono cargados, no está identificado.
  const decisor = !!(String(p.contactName || "").trim() && String(p.phone || "").trim());
  s.fit_decisor = senal(decisor ? "si" : "no", ["prospect.contactName", "prospect.phone"]);

  return s;
}
