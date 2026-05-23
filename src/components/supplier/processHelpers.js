// src/components/supplier/processHelpers.js
//
// Helpers compartidos entre las tabs del módulo de Proveedores.
// Pure-ish — algunas funciones son async (leen archivos del FS local) pero
// no escriben a state.

import * as XLSX from "xlsx";
import {
  parseSpreadsheetRows,
  parseTextLines,
  parsePdfText,
  enrichWithMatches,
} from "../../lib/supplierParser.js";
import { matchProduct } from "../../lib/fuzzyMatch.js";
import { findAlias, aliasKey } from "../../lib/supplierProfiles.js";

// Carga dinámica de pdfjs-dist. Se invoca solo cuando se procesa un PDF —
// no engrosa el chunk inicial.
export async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }
  return pdfjs;
}

// Parsea un archivo Excel/CSV y devuelve items canónicos.
export async function processSpreadsheetFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  let items = parseSpreadsheetRows(rows);
  if (items.length === 0) {
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    items = parseSpreadsheetRows(rawRows);
  }
  return items;
}

// Parsea un PDF y devuelve items canónicos.
export async function processPdfFile(file, knownBrands = []) {
  const pdfjs = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(it => it.str).join(" ");
    fullText += pageText + "\n";
  }
  return parsePdfText(fullText, { knownBrands });
}

// Enriquece items con: aliases conocidos (preferentes), matches fuzzy.
// supplierId opcional: si está, prioriza aliases de ese supplier.
export function enrichItems(items, products, aliases = [], supplierId = null) {
  const activeProducts = products.filter(p => !p.isDeleted);
  const productById = new Map(activeProducts.map(p => [p.id, p]));
  const knownBrands = Array.from(new Set(activeProducts.map(p => p.brand).filter(Boolean)));

  // Inferir brand desde el raw si no lo tenemos
  const withBrand = items.map(it => {
    if (it.brand) return it;
    const matched = knownBrands.find(b => {
      const normB = b.toLowerCase().replace(/\s+/g, "");
      return (it.raw || "").toLowerCase().replace(/\s+/g, "").includes(normB);
    });
    return matched ? { ...it, brand: matched } : it;
  });

  // 1ra pasada: aliases conocidos
  const result = withBrand.map(it => {
    const alias = findAlias(aliases, it.raw, supplierId);
    if (alias && productById.has(alias.productId)) {
      const product = productById.get(alias.productId);
      const fromAlias = {
        product,
        score: 0.95,
        confidence: "high",
        breakdown: { fromAlias: true },
      };
      return {
        ...it,
        topMatches: [fromAlias],
        bestMatch: fromAlias,
        confidence: "high",
        fromAlias: true,
      };
    }
    return null; // marca como pendiente de fuzzy match
  });

  // 2da pasada: fuzzy match para items sin alias
  return result.map((enriched, i) => {
    if (enriched) return enriched;
    const item = withBrand[i];
    const topMatches = matchProduct(item, activeProducts, { topN: 5 });
    const bestMatch = topMatches[0] || null;
    return {
      ...item,
      topMatches,
      bestMatch,
      confidence: bestMatch ? bestMatch.confidence : "low",
      fromAlias: false,
    };
  });
}

// Convierte 0..1 score a porcentaje
export const pct = (n) => Math.round(n * 100);
