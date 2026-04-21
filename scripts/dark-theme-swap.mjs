#!/usr/bin/env node
// Mass color swap: light theme → dark theme across src/**/*.jsx
// Preserva `color: "#fff"` y similares (texto blanco sobre botones), y solo
// reemplaza `#fff` cuando está en contexto de background/border/fill/stroke.
//
// Uso: node scripts/dark-theme-swap.mjs [--dry]

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;
const DRY = process.argv.includes("--dry");

// Mapeo de hexes inambiguos: cada uno se usa SIEMPRE para lo mismo (bg, border
// o color), así que se pueden reemplazar globalmente sin romper nada.
const simpleMap = {
  // Surfaces claras → oscuras
  "#e5e7eb": "#0F172A",  // page bg
  "#e2e4e9": "#334155",  // border
  "#f7f8fa": "#0F172A",  // input bg / hover bg
  "#f0f1f5": "#334155",  // secondary button bg
  "#edf0f2": "#273246",  // table row divider
  "#f0f0ff": "#6366f120",// active nav bg

  // Textos
  "#1a1a2e": "#F8FAFC",  // primary text
  "#4b5563": "#CBD5E1",  // body text
  "#6b7280": "#94A3B8",  // muted text
  "#9ca3af": "#64748B",  // faint text

  // Status light → status bright (para dark bg)
  "#fef2f2": "#EF444418",  // danger bg
  "#fecaca": "#EF444440",  // danger border
  "#dc2626": "#EF4444",    // danger text
  "#f0fdf4": "#22C55E18",  // success bg
  "#bbf7d0": "#22C55E40",  // success border
  "#ecfdf5": "#22C55E18",
  "#a7f3d0": "#22C55E40",
  "#16a34a": "#22C55E",    // success text
  "#059669": "#22C55E",    // success text (misma)
  "#fffbeb": "#F59E0B18",  // warning bg
  "#fde68a": "#F59E0B40",  // warning border
  "#d97706": "#F59E0B",    // warning text
};

// `#fff` es ambiguo: como `color` queda blanco (texto sobre botón), como
// `background` / `borderColor` / `fill` / `stroke` debe ser dark.
// Lista de patrones contextuales que SÍ deben cambiar:
const fffContextPatterns = [
  // background / backgroundColor (con comillas simples o dobles)
  /\bbackground(Color)?:\s*"#fff"/g,
  /\bbackground(Color)?:\s*'#fff'/g,
  /\bbackground(Color)?:\s*"#ffffff"/g,
  /\bbackground(Color)?:\s*'#ffffff'/g,
  // border / borderColor
  /\bborder(Color|Top|Bottom|Left|Right)?:\s*"([^"]*)#fff([^"]*)"/g,
  /\bfill:\s*"#fff"/g,
  /\bstroke:\s*"#fff"/g,
];

// Archivos que ya están en dark mode (no tocar)
const SKIP = new Set(["components/Dashboard.jsx", "theme.js"]);

function listJsx(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) listJsx(p, out);
    else if (extname(p) === ".jsx" || extname(p) === ".js") {
      const rel = p.replace(ROOT + "/", "");
      if (!SKIP.has(rel)) out.push(p);
    }
  }
  return out;
}

const files = listJsx(ROOT);
let totalReplaced = 0;
const report = [];

for (const f of files) {
  let src = readFileSync(f, "utf8");
  let count = 0;

  // Simple map
  for (const [from, to] of Object.entries(simpleMap)) {
    const re = new RegExp(escapeRx(from), "g");
    const before = src;
    src = src.replace(re, to);
    count += (before.match(re) || []).length;
  }

  // `#fff` contextual
  // background: "#fff" → bg dark
  src = src.replace(/\bbackground(Color)?:\s*"#f{3,6}"/g, (m) => {
    count++;
    return m.replace(/"#f{3,6}"/, '"#1E293B"');
  });
  src = src.replace(/\bbackground(Color)?:\s*'#f{3,6}'/g, (m) => {
    count++;
    return m.replace(/'#f{3,6}'/, "'#1E293B'");
  });

  // fill/stroke SVG
  src = src.replace(/\bfill:\s*"#f{3,6}"/g, (m) => { count++; return m.replace(/"#f{3,6}"/, '"#F8FAFC"'); });
  src = src.replace(/\bstroke:\s*"#f{3,6}"/g, (m) => { count++; return m.replace(/"#f{3,6}"/, '"#F8FAFC"'); });

  // border que contiene #fff (p.ej. "1px solid #fff")
  src = src.replace(/\bborder(Color|Top|Bottom|Left|Right)?:\s*"([^"]*?)#f{3,6}([^"]*?)"/g, (m, dir, a, b) => {
    count++;
    return m.replace(/#f{3,6}/, "#334155");
  });

  if (count > 0) {
    totalReplaced += count;
    report.push([f.replace(ROOT + "/", ""), count]);
    if (!DRY) writeFileSync(f, src);
  }
}

function escapeRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

console.log(`\n${DRY ? "DRY RUN — " : ""}Dark theme swap complete.`);
console.log(`Total replacements: ${totalReplaced}`);
console.log("Files modified:");
report.sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`  ${n.toString().padStart(4)}  ${f}`));
