// src/lib/supplierParser.js
//
// Funciones PURAS de parsing de listas de proveedores. NO leen archivos —
// el componente UI hace la lectura (con SheetJS/pdfjs) y pasa los datos
// crudos acá. Así estos parsers son testeables sin tocar IO.
//
// Schema canónico que devuelven TODOS los parsers:
//   { brand, model, flavor, puffs, qty, priceUSD, raw, source }
//   - brand: string o null
//   - model: string o null
//   - flavor: string o null
//   - puffs: string o null
//   - qty: number (0 si no se detecta)
//   - priceUSD: number (0 si no se detecta)
//   - raw: el string original (para debugging y matching)
//   - source: "spreadsheet" | "text" | "pdf"

import { extractPuffs, brandMatch, normalize } from "./fuzzyMatch.js";

// Busca brand conocido como substring dentro de un texto. Más robusto que
// brandMatch (que compara strings enteros) para frases del tipo "Elfbar TE Açai".
function findBrandInText(text, knownBrands) {
  if (!text || !Array.isArray(knownBrands) || knownBrands.length === 0) {
    return null;
  }
  const normalizedText = normalize(text).replace(/\s+/g, " ");
  // Probamos cada brand conocido. Buscamos su versión normalizada como substring,
  // tanto con espacio ("elf bar") como sin ("elfbar").
  let best = { brand: null, len: 0 };
  for (const b of knownBrands) {
    const nb = normalize(b);
    const nbCompact = nb.replace(/\s+/g, "");
    // Match con espacio
    if (normalizedText.includes(nb)) {
      if (nb.length > best.len) best = { brand: b, len: nb.length };
    } else if (normalizedText.replace(/\s+/g, "").includes(nbCompact)) {
      // Match sin espacios ("ElfBar" → "elfbar")
      if (nbCompact.length > best.len) best = { brand: b, len: nbCompact.length };
    }
  }
  return best.brand;
}

// ============================================================================
// SPREADSHEET PARSER (Excel/CSV)
// ============================================================================

// Diccionarios de aliases para auto-detectar columnas. Se compara case-insensitive
// y con normalización liviana (sin tildes, sin signos). Si alguna columna del
// proveedor encaja en alguno de estos sinónimos, mapeamos al campo canónico.
export const COLUMN_ALIASES = {
  brand: ["brand", "marca", "fabricante", "manufacturer"],
  model: ["model", "modelo", "modello"],
  flavor: ["flavor", "sabor", "flavour", "gusto", "aroma", "producto", "product", "item", "descripcion", "description"],
  puffs: ["puffs", "puff", "pitadas", "caladas", "p"],
  qty: ["qty", "cantidad", "cant", "stock", "disponible", "available", "units", "unidades", "u"],
  priceUSD: ["price", "precio", "priceusd", "preciousd", "usd", "$", "$usd", "costo", "cost", "unitprice"],
};

// Normaliza encabezado de columna: lowercase, sin tildes, sin signos.
function normalizeHeader(h) {
  if (h == null) return "";
  return String(h).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9$]/g, "")
    .trim();
}

// Para un array de headers, devuelve un mapa { canonicalField: columnIndex } o
// null si no se detecta.
export function detectColumns(headers) {
  if (!Array.isArray(headers)) return {};
  const map = {};
  const normalized = headers.map(normalizeHeader);
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias);
      if (idx !== -1 && map[field] === undefined) {
        map[field] = idx;
        break;
      }
    }
  }
  return map;
}

// Parsea filas de spreadsheet (cada fila = array de celdas o object).
// Si la primera fila parece ser un header, lo usa para detectar columnas.
// Si no detecta columnas, asume orden default: [brand, model, flavor, qty, priceUSD].
//
// rows: array<array<any>> o array<object>
export function parseSpreadsheetRows(rows, opts = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  // Caso 1: array de objects (SheetJS json output con header). Detectamos por keys.
  const first = rows[0];
  if (first && typeof first === "object" && !Array.isArray(first)) {
    const headers = Object.keys(first);
    const colMap = detectColumns(headers);
    return rows.map(row => normalizeRow(row, colMap, headers, "spreadsheet"))
      .filter(item => item.flavor || item.model || item.raw);
  }

  // Caso 2: array of arrays (raw). Primera fila = header heurísticamente.
  const firstRow = first;
  const firstHasNumbers = Array.isArray(firstRow) && firstRow.some(c => typeof c === "number" || (/^[\d.,]+$/).test(String(c || "")));
  let dataStart = 0;
  let colMap = {};
  let headerRow = null;
  if (Array.isArray(firstRow) && !firstHasNumbers) {
    headerRow = firstRow.map(c => String(c || ""));
    colMap = detectColumns(headerRow);
    dataStart = 1;
  }
  // Si no hay headers detectados, fallback a orden default
  if (Object.keys(colMap).length === 0) {
    colMap = { brand: 0, model: 1, flavor: 2, qty: 3, priceUSD: 4 };
  }

  return rows.slice(dataStart)
    .filter(row => Array.isArray(row) && row.some(c => c !== "" && c != null))
    .map(row => normalizeArrayRow(row, colMap, "spreadsheet"))
    .filter(item => item.flavor || item.model || item.raw);
}

// Normaliza una fila como object (con header keys conocidos)
function normalizeRow(row, colMap, headers, source) {
  const get = (field) => {
    const idx = colMap[field];
    if (idx == null) return null;
    return row[headers[idx]];
  };
  const raw = [get("brand"), get("model"), get("flavor")].filter(Boolean).join(" ");
  return {
    brand: cleanStr(get("brand")),
    model: cleanStr(get("model")),
    flavor: cleanStr(get("flavor")),
    puffs: cleanStr(get("puffs")) || extractPuffs(raw),
    qty: toNum(get("qty")),
    priceUSD: toNum(get("priceUSD")),
    raw,
    source,
  };
}

// Normaliza fila tipo array (acceso por índice)
function normalizeArrayRow(row, colMap, source) {
  const get = (field) => {
    const idx = colMap[field];
    if (idx == null) return null;
    return row[idx];
  };
  const raw = [get("brand"), get("model"), get("flavor")].filter(Boolean).join(" ");
  return {
    brand: cleanStr(get("brand")),
    model: cleanStr(get("model")),
    flavor: cleanStr(get("flavor")),
    puffs: cleanStr(get("puffs")) || extractPuffs(raw || String(row.join(" "))),
    qty: toNum(get("qty")),
    priceUSD: toNum(get("priceUSD")),
    raw: raw || String(row.filter(Boolean).join(" ")),
    source,
  };
}

function cleanStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function toNum(v) {
  if (v == null || v === "") return 0;
  // Acepta "1.234,50" (es-AR) y "1,234.50" (en-US). Heurística: si tiene comas Y puntos
  // y el último es coma → coma es decimal. Si solo hay coma → coma es decimal.
  const s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  let cleaned;
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      cleaned = s.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    // Si la coma tiene exactamente 3 dígitos después, probablemente es separador de miles
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length === 3) {
      cleaned = s.replace(",", "");
    } else {
      cleaned = s.replace(",", ".");
    }
  } else {
    cleaned = s;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// ============================================================================
// TEXT PARSER (WhatsApp/email crudo)
// ============================================================================

// Parsea texto libre línea por línea. Heurísticas comunes en mensajes de proveedor:
//   "Elfbar TE Açai Banana x20 $18"
//   "20 x Elfbar TE Açai Banana - 18 USD"
//   "Elfbar TE Açai Banana | 20 | $18"
//   "- Açai Banana (20u) 18u$"
//
// Estrategia: tokenizar línea, extraer qty/price con regex, lo demás va al "raw"
// que después matchProduct intentará mapear contra el catálogo.
export function parseTextLines(text, opts = {}) {
  if (!text || typeof text !== "string") return [];
  const knownBrands = opts.knownBrands || [];

  const lines = text.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !isHeaderLine(l));

  return lines.map(line => {
    // Quitar bullets y prefijos comunes
    const cleaned = line.replace(/^[\-•*●▪️·\d]+[\.\)]\s*/, "").trim();

    const qty = extractQty(cleaned);
    const price = extractPrice(cleaned);
    const puffs = extractPuffs(cleaned);

    // Stripear partes que ya consumimos (qty, price) del raw para no contaminar
    // el matching contra catálogo.
    let raw = cleaned
      .replace(/\b\d+\s*(?:x|×|u\b|unid|uds|unidades)\b/gi, " ")
      .replace(/(?:x|×)\s*\d+\b/gi, " ")
      .replace(/[$us]+\s*\d+(?:[.,]\d+)?/gi, " ")
      .replace(/\d+(?:[.,]\d+)?\s*(?:usd|u\$s|dolares?|\$)/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Si la línea es muy corta o solo es número/precio, no es un item válido.
    if (raw.length < 3) return null;

    // Inferir brand desde el texto si conocemos catálogo
    let brand = null;
    if (knownBrands.length > 0) {
      brand = findBrandInText(raw, knownBrands);
      if (brand) {
        // Quitar el brand del raw para que no contamine el flavor matching
        const brandRe = new RegExp(brand.replace(/\s+/g, "\\s*"), "i");
        raw = raw.replace(brandRe, "").trim();
      }
    }

    // Filtro final: si la línea quedó sin tokens útiles (solo números/símbolos)
    // y además NO tiene qty ni precio, no es un item real.
    const hasUsefulText = /[a-záéíóúñ]{3,}/i.test(raw);
    if (!hasUsefulText && qty === 0 && price === 0) return null;

    return {
      brand,
      model: null,
      flavor: null,
      puffs,
      qty,
      priceUSD: price,
      raw: raw || cleaned,
      source: "text",
    };
  }).filter(Boolean);
}

// Detecta líneas que son headers/separadores y no items reales.
function isHeaderLine(line) {
  if (!line) return true;
  const lower = line.toLowerCase();
  // Líneas con muchos guiones o iguales (separadores)
  if (/^[-=*_]{3,}$/.test(line.trim())) return true;
  // Líneas que parecen títulos de sección
  if (/^(lista|stock|productos?|catalogo|precios?|disponible|sabores?)\s*[:.]?$/i.test(lower)) return true;
  return false;
}

// Extrae qty con varios patrones: "x20", "20x", "20u", "20 unidades", "(20)", "| 15 |"
function extractQty(line) {
  if (!line) return 0;
  const patterns = [
    /\b(\d+)\s*[x×]\s*(?!\s*\$|\s*usd)/i,    // "20x" pero no "20 x $"
    /[x×]\s*(\d+)\b/i,                       // "x20"
    /\((\d+)\s*u?\s*\)/i,                    // "(20)" o "(20u)"
    /\b(\d+)\s*(?:u\b|uds?|unid|unidades)\b/i, // "20u", "20 uds"
    /\bcant(?:idad)?[\s:.]*(\d+)/i,          // "cantidad: 20"
    /\bstock[\s:.]*(\d+)/i,                  // "stock 20"
    /\|\s*(\d+)\s*\|/,                       // "| 15 |"
  ];
  for (const p of patterns) {
    const m = line.match(p);
    if (m) return toNum(m[1]);
  }
  return 0;
}

// Extrae precio USD con varios patrones: "$18", "18 USD", "u$s 18", "18u$"
function extractPrice(line) {
  if (!line) return 0;
  const patterns = [
    /\$\s*(\d+(?:[.,]\d+)?)/,                // "$18"
    /(\d+(?:[.,]\d+)?)\s*(?:u?\$|usd|u\$s|us\$|dolares?)/i, // "18 USD", "18$", "18u$"
    /(?:precio|costo|price)[\s:]*\$?\s*(\d+(?:[.,]\d+)?)/i, // "precio 18"
  ];
  for (const p of patterns) {
    const m = line.match(p);
    if (m) return toNum(m[1]);
  }
  return 0;
}

// ============================================================================
// PDF text parser
// ============================================================================
// El componente UI llama a pdfjs-dist para extraer el texto del PDF como string,
// y después pasa ese string acá. Si el PDF tiene estructura tabular clara
// (columnas separadas por múltiples espacios o tabs), intentamos split por
// columnas. Si no, fallback al parser de texto.
export function parsePdfText(text, opts = {}) {
  if (!text) return [];
  // Heurística: si una línea tiene 3+ campos separados por 2+ espacios/tabs, es tabular.
  const lines = text.split(/\r?\n/);
  const tabular = lines.filter(l => (l.match(/\s{2,}/g) || []).length >= 2).length;
  const total = lines.filter(l => l.trim().length > 0).length;
  const isTabular = total > 0 && tabular / total > 0.4;

  if (isTabular) {
    // Tratar como spreadsheet: cada línea es una fila, separar por chunks de espacios
    const rows = lines
      .filter(l => l.trim().length > 0)
      .map(l => l.trim().split(/\s{2,}|\t+/).map(c => c.trim()))
      .filter(r => r.length >= 2);
    return parseSpreadsheetRows(rows, opts).map(r => ({ ...r, source: "pdf" }));
  }
  return parseTextLines(text, opts).map(r => ({ ...r, source: "pdf" }));
}

// ============================================================================
// HELPERS
// ============================================================================

// Aplica matchProduct a cada ítem y devuelve la lista enriquecida con
// { topMatches, bestMatch, confidence }.
// catalog: array de productos (de Firestore)
export function enrichWithMatches(items, catalog, matchProductFn) {
  return (items || []).map(item => {
    const topMatches = matchProductFn(item, catalog, { topN: 5 });
    const bestMatch = topMatches[0] || null;
    return {
      ...item,
      topMatches,
      bestMatch,
      confidence: bestMatch ? bestMatch.confidence : "low",
    };
  });
}
