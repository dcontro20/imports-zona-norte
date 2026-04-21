#!/usr/bin/env node
// Revierte el swap a dark mode y aplica paleta Notion/Linear light.
// Mapea los hexes oscuros (que el swap anterior introdujo) a tokens cálidos.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;
const SKIP = new Set(["theme.js"]); // theme.js ya reescrito a mano

// Dark hexes (introducidos por dark swap) → Notion light tokens
const map = {
  // Surfaces
  "#0F172A": "#FAFAF9",   // bg
  "#1E293B": "#FFFFFF",   // card
  "#253347": "#F6F5F2",   // cardHover
  "#334155": "#E8E7E3",   // border
  "#273246": "#F0EFEB",   // borderSoft
  // Text
  "#F8FAFC": "#37352F",   // primary text
  "#CBD5E1": "#555247",   // secondary text
  "#94A3B8": "#8C8A82",   // muted
  "#64748B": "#B1AFA7",   // faint
  "#475569": "#9B9A97",   // scrollbar hover
  // Status — dark bright → Notion muted
  "#22C55E": "#0F7B6C",   // green
  "#22C55E18": "#DDEDEA", // green bg
  "#22C55E40": "#B6D4CC", // green border
  "#22C55E22": "#D3E5DD", // slight variant
  "#EF4444": "#E03E3E",   // red
  "#EF444418": "#FBE4E4",
  "#EF444422": "#F7D7D6",
  "#EF444440": "#F1B8B6",
  "#3B82F6": "#2383E2",   // blue
  "#3B82F618": "#DDEBF1",
  "#3B82F622": "#D0E3EE",
  "#3B82F640": "#B1D4E8",
  "#F59E0B": "#CB912F",   // amber
  "#F59E0B18": "#FDECC8",
  "#F59E0B22": "#FBE3B3",
  "#F59E0B40": "#F2D59A",
  "#8B5CF6": "#6940A5",   // purple
  "#8B5CF618": "#EAE4F2",
  "#8B5CF640": "#CDB8E2",
  "#06B6D4": "#0E8BA8",   // cyan
  // Primary indigo tweak
  "#6366f1": "#5E6AD2",
  "#6366f120": "#EEF0FC",
  "#6366f122": "#EAECF9",
  "#6366f140": "#D4D7F2",
  "#6366f115": "#F1F2FD",
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

// Ordenar por largo descendente (reemplazar hexes largos primero: "#22C55E18" antes de "#22C55E")
const entries = Object.entries(map).sort((a, b) => b[0].length - a[0].length);

let total = 0;
const report = [];
for (const f of listJsx(ROOT)) {
  let src = readFileSync(f, "utf8");
  let count = 0;
  for (const [from, to] of entries) {
    const re = new RegExp(escapeRx(from), "gi");
    const matches = src.match(re);
    if (matches) {
      count += matches.length;
      src = src.replace(re, to);
    }
  }
  if (count > 0) {
    total += count;
    report.push([f.replace(ROOT + "/", ""), count]);
    writeFileSync(f, src);
  }
}

console.log(`\nLight theme restore complete. Total: ${total}`);
report.sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`  ${n.toString().padStart(4)}  ${f}`));
