// priceLists.js — LISTAS DE PRECIOS VERSIONADAS E INMUTABLES (RN-12, RN-13).
//
// Una lista publicada es un SNAPSHOT: congela la política, los costos y los
// precios del momento de publicación. Nunca se edita — los cambios generan
// versión nueva, y toda cotización guarda a qué versión respondió (RN-11/12).
// La colección appData/priceLists es append-only por convención: ninguna
// pantalla la muta, no pasa por Papelera.
//
// Estabilidad (§5.17 / RN-13): al republicar contra una lista base, un
// producto cuyo costo real se movió MENOS que el umbral conserva sus precios
// anteriores (el margen absorbe el movimiento); solo se recalcula el que se
// movió de verdad. Excepciones que fuerzan recálculo total: cambio en la
// parte MOTOR de la política (márgenes, escalones, redondeo, envío, piso).
// El piso de margen manda siempre: si un precio conservado quedara debajo
// del piso con el costo nuevo, ese producto se recalcula (RN-05 > §5.17).
//
// CONTRA QUÉ costo se mide el umbral (anti erosión silenciosa): contra el
// costo real de REFERENCIA — el que originó los precios que se conservan
// (`costoRealReferencia`, que viaja intacto de snapshot en snapshot mientras
// el producto se estabiliza). NUNCA contra la republicación anterior: si se
// midiera contra la anterior, un costo que sube 2,5% cinco veces jamás
// dispararía recálculo aunque subió 13% real, y el piso lo atraparía tarde,
// con el margen ya erosionado. Hay test que fija este comportamiento.
import { generarLista, costoReal, validarProducto } from "./pricingEngine.js";

// Campos de la política que definen el CÁLCULO (si alguno cambia, la
// estabilidad no aplica y se recalcula todo).
const CAMPOS_MOTOR = ["costoAdicionalPct", "escalones", "redondeo", "margenMinimo", "validaciones"];

export function politicaMotorCambio(politicaA, politicaB) {
  return CAMPOS_MOTOR.some(
    (campo) => JSON.stringify(politicaA?.[campo]) !== JSON.stringify(politicaB?.[campo])
  );
}

// "v2026-08" para la primera del mes; "v2026-08.2", ".3"... para las siguientes.
export function siguienteVersion(listas, fechaISO) {
  const base = `v${String(fechaISO).slice(0, 7)}`;
  const delMes = (listas || []).filter((l) => l?.version === base || l?.version?.startsWith(`${base}.`));
  return delMes.length === 0 ? base : `${base}.${delMes.length + 1}`;
}

// Última lista publicada (la vigente). Las listas no se borran, pero por
// higiene se ignora cualquier isDeleted.
export function listaVigente(listas) {
  const publicadas = (listas || []).filter((l) => l && !l.isDeleted);
  if (publicadas.length === 0) return null;
  return publicadas.reduce((a, b) => (String(a.publishedAt) >= String(b.publishedAt) ? a : b));
}

// Construye el snapshot de una publicación. NO lo persiste (eso es de la
// pantalla que publica) y NO decide si se puede publicar (ver puedePublicar).
//   productosMotor: salida del adaptador (pricingAdapter.productosParaMotor)
//   politica: política completa vigente al publicar (queda congelada adentro)
//   base: lista vigente anterior (opcional) — activa la estabilidad §5.17
export function construirSnapshot({ productosMotor, politica, version, fecha, autor = "", base = null, fx = 0 }) {
  const umbral = Number(politica?.umbralRecalculoPct) || 0;
  const aplicaEstabilidad = base && !politicaMotorCambio(base.politica, politica);
  const filasBase = aplicaEstabilidad ? new Map(base.filas.map((f) => [f.id, f])) : new Map();

  const lista = generarLista(productosMotor, politica);
  const porId = new Map(productosMotor.map((p) => [p.id, p]));

  const filas = lista.filas.map((fila) => {
    const producto = porId.get(fila.id);
    const anterior = filasBase.get(fila.id);
    let precios = fila.precios;
    let estabilizada = false;
    // Por default (recálculo fresco) la referencia pasa a ser el costo actual.
    let costoRealReferencia = fila.costoReal;

    // Referencia de la base: el costo que originó sus precios (compat con
    // snapshots viejos sin el campo: su propio costoReal).
    const referencia = anterior ? (anterior.costoRealReferencia ?? anterior.costoReal) : 0;
    if (anterior && referencia > 0) {
      const drift = Math.abs(fila.costoReal - referencia) / referencia;
      if (drift <= umbral + 1e-12) {
        // El margen absorbe el movimiento: se conservan los precios anteriores,
        // con el margen real recalculado sobre el costo real NUEVO.
        const conservados = anterior.precios.map((esc) => ({
          ...esc,
          margenReal: esc.precio > 0 ? (esc.precio - fila.costoReal) / esc.precio : 0,
        }));
        const piso = Number(politica?.margenMinimo) || 0;
        if (conservados.every((esc) => esc.margenReal >= piso - 1e-9)) {
          precios = conservados;
          estabilizada = true;
          costoRealReferencia = referencia; // la referencia viaja intacta
        }
        // Si conservar viola el piso, cae al recálculo fresco (RN-05 manda).
      }
    }

    // Validaciones SIEMPRE sobre los precios finales que se publican.
    const { bloqueantes, alertas } = validarProducto(producto, precios, politica);
    return {
      id: fila.id,
      marca: producto?.marca || "",
      modelo: producto?.modelo || "",
      productIds: producto?.productIds || [],
      costo: fila.costo,
      costoReal: fila.costoReal,
      costoRealReferencia,
      precios,
      estabilizada,
      bloqueantes,
      alertas,
      publicable: bloqueantes.length === 0,
    };
  });

  const bloqueados = filas.filter((f) => !f.publicable).map((f) => f.id);
  return {
    id: `pl_${version}`,
    version,
    publishedAt: fecha,
    publishedBy: autor,
    // FX de referencia al publicar (regla d, gate F4): contra esto se detecta
    // la divergencia del presupuesto — "el cliente vio la lista a $X".
    fxAlPublicar: Number(fx) > 0 ? Number(fx) : null,
    politica: JSON.parse(JSON.stringify(politica)), // congelada (RN-12)
    filas,
    sinCosto: lista.sinCosto,
    bloqueados,
    publicable: filas.length > 0 && bloqueados.length === 0,
  };
}

// RN-05 como puerta de publicación: con algún producto debajo del piso, la
// lista NO se publica — exige decisión humana (ajustar costo/política o
// discontinuar el producto). Devuelve { ok, motivos }.
export function puedePublicar(snapshot) {
  const motivos = [];
  if (!snapshot || (snapshot.filas || []).length === 0) motivos.push("La lista no tiene productos con costo.");
  for (const id of snapshot?.bloqueados || []) {
    motivos.push(`${id.replace("|", " ")} viola el piso de margen (RN-05).`);
  }
  return { ok: motivos.length === 0, motivos };
}

// RN-13 — ¿la lista vigente quedó desfasada contra los datos de hoy?
// Compara costo real actual (productos + política de hoy) contra el snapshot.
// Devuelve { necesitaRepublicar, costosMovidos, nuevos, retirados, politicaCambio }.
export function driftContraVigente({ vigente, productosMotor, politica }) {
  if (!vigente) {
    return {
      necesitaRepublicar: (productosMotor || []).some((p) => Number(p.costo) > 0),
      costosMovidos: [], nuevos: (productosMotor || []).map((p) => p.id), retirados: [],
      politicaCambio: false,
    };
  }
  const umbral = Number(politica?.umbralRecalculoPct) || 0;
  const enVigente = new Map(vigente.filas.map((f) => [f.id, f]));
  const actualesIds = new Set();
  const costosMovidos = [];
  const nuevos = [];

  for (const p of productosMotor || []) {
    if (!(Number(p.costo) > 0)) continue;
    actualesIds.add(p.id);
    const fila = enVigente.get(p.id);
    if (!fila) { nuevos.push(p.id); continue; }
    const real = costoReal(p.costo, politica?.costoAdicionalPct);
    // Contra la REFERENCIA (el costo que originó los precios vigentes), no
    // contra el costo de la última republicación — ver nota de cabecera.
    const referencia = fila.costoRealReferencia ?? fila.costoReal;
    const drift = referencia > 0 ? Math.abs(real - referencia) / referencia : 1;
    if (drift > umbral + 1e-12) {
      costosMovidos.push({ id: p.id, antes: referencia, ahora: real, pct: drift });
    }
  }
  const retirados = vigente.filas.filter((f) => !actualesIds.has(f.id)).map((f) => f.id);
  const politicaCambio = politicaMotorCambio(vigente.politica, politica);

  return {
    necesitaRepublicar: costosMovidos.length > 0 || nuevos.length > 0 || retirados.length > 0 || politicaCambio,
    costosMovidos, nuevos, retirados, politicaCambio,
  };
}

// Precio de un producto (id de modelo del adaptador) en una lista publicada,
// para el escalón que corresponde a un total de unidades. Es lo que consumirá
// el cotizador (F5): la cotización lee la LISTA, jamás recalcula en vivo.
export function precioEnLista(lista, idModelo, totalUnidades) {
  const fila = (lista?.filas || []).find((f) => f.id === idModelo);
  if (!fila) return null;
  const n = Number(totalUnidades) || 0;
  const esc = fila.precios.find((e) => n >= e.desde && (e.hasta == null || n <= e.hasta));
  return esc ? { precio: esc.precio, desde: esc.desde, hasta: esc.hasta, margen: esc.margen } : null;
}
