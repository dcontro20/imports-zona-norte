// src/lib/fuzzyMatch.js
//
// Funciones PURAS de fuzzy matching para emparejar ítems de listas de proveedores
// (con nombres ambiguos, errores de tipeo, formato libre) contra el catálogo
// interno de productos. Devuelve los candidatos con score.
//
// Convenciones de score:
//   - score: número 0..1 (1 = match exacto)
//   - confidence: "high" (≥0.78) | "medium" (≥0.45) | "low" (<0.45 → producto nuevo)

// Strips diacritics, lowercase, removes punctuation, collapses spaces.
// Critical para que "Açaí" matche "acai" y "Tutti-Frutti" matche "tutti frutti".
export function normalize(str) {
  if (str == null) return "";
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Tokens en palabras significativas. Stopwords mínimas (artículos, conectores).
const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "con", "sin",
  "the", "of", "and", "with", "by", "for",
  "ice", // ice aparece tantísimo que reduce señal, pero NO removemos
  // (descomentar "ice" lo quitaría — preferimos dejarlo para no perder señal)
]);
STOPWORDS.delete("ice"); // mantenerlo (es discriminante en vapes)

export function tokenize(str) {
  return normalize(str).split(" ").filter(t => t && t.length > 1 && !STOPWORDS.has(t));
}

// Distancia de Levenshtein clásica con rolling array (O(n × m) tiempo, O(min(n,m)) espacio).
// Usado para comparar palabras individuales (no strings largos).
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  if (a.length < b.length) { const t = a; a = b; b = t; }
  let prev = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) prev[i] = i;
  for (let i = 1; i <= a.length; i++) {
    const curr = new Array(b.length + 1);
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

// Similitud entre tokens individuales usando Levenshtein normalizado.
function tokenSim(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// "Best-pair" matching: para cada token en A encuentra su gemelo más parecido en B
// y promedia. Robusto a typos: "watermelon" vs "watermellon" (1 letra) da ~0.91 en
// lugar de 0 (que daría Jaccard puro). Crítico para nombres de sabores donde un
// tipeo arruina el match.
function bestPairTokenSim(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  let sum = 0;
  for (const t of tokensA) {
    let best = 0;
    for (const u of tokensB) {
      const sim = tokenSim(t, u);
      if (sim > best) best = sim;
    }
    sum += best;
  }
  // Promedio bidireccional: también contamos qué tan bien cubre B a A.
  // Esto penaliza casos donde A es subset de B pero B tiene muchos tokens extra.
  let sumB = 0;
  for (const u of tokensB) {
    let best = 0;
    for (const t of tokensA) {
      const sim = tokenSim(t, u);
      if (sim > best) best = sim;
    }
    sumB += best;
  }
  return ((sum / tokensA.length) + (sumB / tokensB.length)) / 2;
}

// 0..1 similitud entre dos strings (1 = idénticos tras normalizar, 0 = nada en común).
// Combina char-level Levenshtein con best-pair token matching para tolerar typos
// y reordenamientos ("Cherry Ice" vs "Ice Cherry").
export function stringSimilarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const maxLen = Math.max(na.length, nb.length);
  const charSim = 1 - levenshtein(na, nb) / maxLen;

  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  const tokenS = bestPairTokenSim(tokensA, tokensB);

  return charSim * 0.4 + tokenS * 0.6;
}

// Brand matching tolera variantes comunes: "Elf Bar", "ElfBar", "elfbar" → "Elfbar".
// Esta función no normaliza al diccionario del catálogo; eso lo hace matchProduct
// usando stringSimilarity sobre el campo brand.
export function brandMatch(rawBrand, catalogBrands) {
  if (!rawBrand) return { brand: null, score: 0 };
  const n = normalize(rawBrand).replace(/\s+/g, "");
  let best = { brand: null, score: 0 };
  for (const b of catalogBrands) {
    const cn = normalize(b).replace(/\s+/g, "");
    if (cn === n) return { brand: b, score: 1 };
    const score = stringSimilarity(n, cn);
    if (score > best.score) best = { brand: b, score };
  }
  return best;
}

// Heurística: extraer puffs aproximados de un texto ("30k", "30000", "30000 puffs").
// Útil cuando el proveedor menciona puffs en el mismo string del modelo.
export function extractPuffs(str) {
  if (!str) return null;
  const s = String(str).toLowerCase();
  const kMatch = s.match(/(\d{1,3})\s*k(?:\s|$|p)/);
  if (kMatch) return String(Number(kMatch[1]) * 1000);
  const numMatch = s.match(/(\d{4,6})\s*(?:puffs|pitadas|p\b)?/);
  if (numMatch) return numMatch[1];
  return null;
}

// Match principal. Recibe un ítem crudo del proveedor y devuelve los top N
// candidatos del catálogo con score y confidence.
//
// Score formula:
//   - brand:   peso 0.30 (debe coincidir bastante; si no, penaliza)
//   - model:   peso 0.25
//   - flavor:  peso 0.35
//   - puffs:   peso 0.10 (bonus si coincide, no penaliza si falta)
//
// candidate: { brand?, model?, flavor?, puffs?, raw? }
// catalog:   array de productos { id, brand, model, flavor, puffs }
//
// Returns: array<{ product, score, confidence }> ordenado desc por score
export function matchProduct(candidate, catalog, options = {}) {
  const { topN = 5, minScore = 0 } = options;
  if (!candidate || !Array.isArray(catalog) || catalog.length === 0) return [];

  // Si no tenemos brand explícito pero el "raw" sí lo contiene, intentar inferirlo
  const catalogBrands = Array.from(new Set(catalog.map(p => p.brand).filter(Boolean)));
  let candBrand = candidate.brand;
  if (!candBrand && candidate.raw) {
    const bm = brandMatch(candidate.raw, catalogBrands);
    if (bm.score >= 0.7) candBrand = bm.brand;
  }

  const candPuffs = candidate.puffs || extractPuffs(candidate.raw || "") || null;
  const candModel = candidate.model || "";
  const candFlavor = candidate.flavor || candidate.raw || "";

  const scored = catalog.map(p => {
    const brandScore = candBrand
      ? stringSimilarity(candBrand, p.brand || "")
      : (candidate.raw ? stringSimilarity(candidate.raw, p.brand || "") * 0.5 : 0.3);
    const modelScore = candModel
      ? stringSimilarity(candModel, p.model || "")
      : (candidate.raw ? stringSimilarity(candidate.raw, p.model || "") * 0.5 : 0.3);
    const flavorScore = stringSimilarity(candFlavor, p.flavor || "");
    const puffsBonus = candPuffs && String(p.puffs) === String(candPuffs) ? 1 : 0;

    let score = brandScore * 0.30 + modelScore * 0.25 + flavorScore * 0.35 + puffsBonus * 0.10;
    // El sabor es el discriminante principal (misma marca/modelo tiene muchos sabores).
    // Si el flavor matchea mal, todo el resultado es dudoso aunque brand coincida.
    if (flavorScore < 0.3) score *= 0.7;

    return { product: p, score, breakdown: { brandScore, modelScore, flavorScore, puffsBonus } };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored
    .filter(x => x.score >= minScore)
    .slice(0, topN)
    .map(x => ({
      product: x.product,
      score: Math.round(x.score * 1000) / 1000,
      confidence: x.score >= 0.78 ? "high" : x.score >= 0.45 ? "medium" : "low",
      breakdown: x.breakdown,
    }));
}

// Helper de UI: traduce confidence a color/emoji canónicos del sistema.
export function confidenceMeta(confidence) {
  if (confidence === "high") return { color: "#0F7B6C", emoji: "🟢", label: "Coincide" };
  if (confidence === "medium") return { color: "#CB912F", emoji: "🟡", label: "Revisar" };
  return { color: "#E03E3E", emoji: "🔴", label: "Nuevo" };
}
