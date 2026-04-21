#!/usr/bin/env node
// Segundo pase: colores claros residuales no cubiertos por el primer script.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;
const SKIP = new Set(["components/Dashboard.jsx", "theme.js"]);

// Light surfaces tintados → bgs oscuros tintados (mismo hue pero sobre dark).
const map = {
  "#eef2ff": "#6366f122",  // light indigo bg → indigo tint
  "#c7d2fe": "#6366f140",  // indigo border
  "#fff7ed": "#F59E0B18",  // light orange bg → amber tint
  "#fdba74": "#F59E0B40",  // orange border
  "#eff6ff": "#3B82F618",  // light blue bg
  "#bfdbfe": "#3B82F640",  // blue border
  "#2563eb": "#3B82F6",    // blue text
  "#f9fafb": "#0F172A",    // light gray bg
  "#f3f4f6": "#334155",    // neutral gray
  "#10b981": "#22C55E",    // emerald green → bright green
  "#e74c3c": "#EF4444",    // red variant
  "#f59e0b": "#F59E0B",    // keep (normalize case)
};

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

function escapeRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

let total = 0;
const report = [];
for (const f of listJsx(ROOT)) {
  let src = readFileSync(f, "utf8");
  let count = 0;
  for (const [from, to] of Object.entries(map)) {
    const re = new RegExp(escapeRx(from), "gi");
    const before = src;
    src = src.replace(re, to);
    count += (before.match(re) || []).length;
  }
  if (count > 0) {
    total += count;
    report.push([f.replace(ROOT + "/", ""), count]);
    writeFileSync(f, src);
  }
}

console.log(`\nPass 2 complete. Total: ${total}`);
report.sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`  ${n.toString().padStart(4)}  ${f}`));
