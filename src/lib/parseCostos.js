// parseCostos.js — PEGAR la lista del proveedor en vez de tipear campo por campo.
//
// Cada vez que el proveedor manda precios nuevos hay que actualizar el costo de
// ~20 modelos. Tipearlos uno por uno es lento y, peor, silencioso: un dígito de
// más no avisa. Acá se pega una tabla de dos columnas (modelo + costo) y se
// obtiene un BORRADOR revisable.
//
// REGLA (la misma que el resto del módulo): esto NO escribe nada. Devuelve qué
// entendió, contra qué modelo lo emparejó y qué cambiaría — el guardado sigue
// siendo el botón de siempre, con la decisión humana en el medio. Nada de
// "importar" a ciegas: un costo mal cargado repercute en toda la lista.
//
// Formatos que acepta (una línea por modelo, separador libre):
//   "Geek Bar Pulse X   6.00"     ·  "Pulse X,6"        ·  "Ignite V500 | USD 12"
//   "Lost Mary Dura\t8,00"        ·  "V250 10"          ·  "HQD 30K Ice Glaze Plus 9"
// El costo es el ÚLTIMO número suelto de la línea: "Nikbar 30K 7.50" entiende
// 7.50 y no 30, porque el 30 va pegado a una letra (30K) — así los modelos con
// número en el nombre (V250, 18K, Z 35K) no se confunden con el precio.

// Normalización para emparejar: sin acentos, sin mayúsculas, sin puntuación,
// espacios colapsados. "Geek Bar  PULSE-X" y "geek bar pulse x" son lo mismo.
export function normalizarNombreModelo(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    // "Mixer+" y "Mixer +" son el mismo modelo.
    .replace(/\s*\+\s*/g, "+");
}

// Último número "suelto" de la línea (no pegado a letras): el costo.
// Devuelve { costo, inicio, fin } o null.
function ultimoNumeroSuelto(linea) {
  // El lookbehind mira solo \w: la parte decimal ya la consume el propio match
  // ("8,00" entra entero), pero una coma SEPARADORA ("Pulse X,6") no puede
  // descalificar al número que le sigue.
  const re = /(?<!\w)\d+(?:[.,]\d+)?(?!\w)/g;
  let m, ultimo = null;
  while ((m = re.exec(linea)) !== null) ultimo = m;
  if (!ultimo) return null;
  const costo = Number(String(ultimo[0]).replace(",", "."));
  if (!Number.isFinite(costo)) return null;
  return { costo, inicio: ultimo.index, fin: ultimo.index + ultimo[0].length };
}

// Separadores y símbolos de moneda que sobran alrededor del nombre.
const BORDES = /^[\s|;:,\-=•·*$]+|[\s|;:,\-=•·*$]+$/g;
const MONEDA = /\b(usd|u\$s|us\$|ars|\$)\b/gi;

// Parsea el texto pegado contra los modelos que EXISTEN en el sistema.
//   texto: lo pegado (una línea por modelo)
//   modelos: [{ id: "Marca|Modelo", marca, modelo }] — salida del adaptador
// Devuelve { lineas, resumen }:
//   lineas: [{ raw, nombre, costo, estado, id?, etiqueta?, candidatos? }]
//     estado: "ok" | "ambiguo" | "sin_match" | "sin_costo"
//   resumen: { ok, ambiguo, sinMatch, sinCosto, total }
// Las líneas vacías se ignoran (no cuentan como error).
export function parsearTablaCostos(texto, modelos = []) {
  // Índice de búsqueda: se empareja por "marca modelo" y también por "modelo"
  // solo (el proveedor rara vez repite la marca en cada renglón). Un mismo
  // nombre corto puede apuntar a más de un modelo ⇒ ambiguo, no se adivina.
  const porClave = new Map();
  const agregar = (clave, modelo) => {
    if (!clave) return;
    if (!porClave.has(clave)) porClave.set(clave, []);
    const lista = porClave.get(clave);
    if (!lista.some((m) => m.id === modelo.id)) lista.push(modelo);
  };
  for (const m of modelos || []) {
    if (!m?.id) continue;
    agregar(normalizarNombreModelo(`${m.marca || ""} ${m.modelo || ""}`), m);
    agregar(normalizarNombreModelo(m.modelo), m);
  }

  const lineas = [];
  for (const raw of String(texto || "").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const limpio = raw.replace(MONEDA, " ");
    const num = ultimoNumeroSuelto(limpio);
    const nombre = (num ? limpio.slice(0, num.inicio) : limpio).replace(BORDES, "").trim();

    if (!num || !(num.costo > 0)) {
      lineas.push({ raw: raw.trim(), nombre, costo: null, estado: "sin_costo" });
      continue;
    }
    const candidatos = porClave.get(normalizarNombreModelo(nombre)) || [];
    if (candidatos.length === 1) {
      lineas.push({
        raw: raw.trim(), nombre, costo: num.costo, estado: "ok",
        id: candidatos[0].id, etiqueta: `${candidatos[0].marca} ${candidatos[0].modelo}`.trim(),
      });
    } else if (candidatos.length > 1) {
      lineas.push({
        raw: raw.trim(), nombre, costo: num.costo, estado: "ambiguo",
        candidatos: candidatos.map((c) => c.id),
      });
    } else {
      lineas.push({ raw: raw.trim(), nombre, costo: num.costo, estado: "sin_match" });
    }
  }

  const cuenta = (e) => lineas.filter((l) => l.estado === e).length;
  return {
    lineas,
    resumen: {
      ok: cuenta("ok"), ambiguo: cuenta("ambiguo"),
      sinMatch: cuenta("sin_match"), sinCosto: cuenta("sin_costo"),
      total: lineas.length,
    },
  };
}

// Qué cambiaría realmente contra los costos actuales. Solo las líneas "ok"
// tocan algo; el resto se reporta y no se aplica.
//   actuales: Map|objeto id → costo actual
// Devuelve { cambios: [{ id, etiqueta, antes, ahora }], iguales: [ids] }
export function diffCostos(lineas, actuales) {
  const leer = (id) => Number(actuales instanceof Map ? actuales.get(id) : actuales?.[id]) || 0;
  const cambios = [];
  const iguales = [];
  for (const l of lineas || []) {
    if (l.estado !== "ok") continue;
    const antes = leer(l.id);
    if (Math.abs(antes - l.costo) < 1e-9) iguales.push(l.id);
    else cambios.push({ id: l.id, etiqueta: l.etiqueta, antes, ahora: l.costo });
  }
  return { cambios, iguales };
}
