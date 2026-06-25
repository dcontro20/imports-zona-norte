#!/usr/bin/env node
// Generador automático de docs/ESTRUCTURA.md.
//
// Lee el código fuente y produce un snapshot determinístico (mismo input →
// mismo output) de TODA la estructura del sistema: pantallas, módulos puros,
// utilidades, tests, scripts, endpoints, etc.
//
// Corre cada noche vía .github/workflows/structure-snapshot.yml. Si el output
// es idéntico al doc actual, NO commitea (no inflamos el historial).
//
// Es 100% determinístico: lee el filesystem, NO usa IA. Si el código no
// cambió, el doc no cambia. Si la estructura se mueve, el doc lo refleja
// la misma noche, sin que nadie tenga que acordarse.
//
// Para probarlo a mano: node scripts/generate-structure-doc.mjs

import { promises as fs } from "node:fs";
import { join, relative, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "ESTRUCTURA.md");

// ---------------------------------------------------------------------------
// Helpers de filesystem
// ---------------------------------------------------------------------------
async function listFiles(dir, { recursive = false } = {}) {
  let out = [];
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (recursive) out = out.concat(await listFiles(full, { recursive }));
    } else {
      out.push(full);
    }
  }
  return out.sort();
}

const exists = async (p) => { try { await fs.access(p); return true; } catch { return false; } };
const readText = async (p) => { try { return await fs.readFile(p, "utf8"); } catch { return ""; } };
const sizeOf = async (p) => { try { return (await fs.stat(p)).size; } catch { return 0; } };

// Cuenta líneas no vacías (ignora comentarios obvios y líneas en blanco).
function countLines(src) {
  if (!src) return 0;
  return src.split("\n").filter(l => {
    const t = l.trim();
    return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  }).length;
}

// Extrae la primera línea de comentario "doc" del archivo (la descripción).
function extractDocstring(src) {
  if (!src) return "";
  // Primer bloque de // al inicio del archivo
  const lines = src.split("\n");
  const doc = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("//")) {
      const cleaned = t.replace(/^\/\/+\s?/, "").trim();
      if (cleaned) doc.push(cleaned);
      if (doc.length >= 2) break;
    } else if (t && doc.length > 0) {
      break;
    } else if (t && !t.startsWith("import") && !t.startsWith("/*")) {
      break;
    }
  }
  return doc.join(" ").slice(0, 140);
}

function pad(s, n) { return String(s).padEnd(n); }

// ---------------------------------------------------------------------------
// Recolectores por sección
// ---------------------------------------------------------------------------
async function collectComponents() {
  const root = join(ROOT, "src", "components");
  const top = (await listFiles(root)).filter(f => f.endsWith(".jsx") && !f.endsWith(".test.jsx"));
  const subdirs = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const dir = join(root, entry.name);
      const files = (await listFiles(dir)).filter(f => !f.endsWith(".test.js") && !f.endsWith(".test.jsx"));
      subdirs.push({ name: entry.name, files });
    }
  }
  return { top, subdirs };
}

async function collectCorePure() {
  const root = join(ROOT, "src");
  const all = await listFiles(root);
  return all
    .filter(f => f.endsWith(".js") && !f.endsWith(".test.js") && dirname(f) === root)
    .filter(f => !["main.jsx", "App.jsx"].includes(basename(f)));
}

async function collectLib() {
  const dir = join(ROOT, "src", "lib");
  return (await listFiles(dir)).filter(f => f.endsWith(".js") && !f.endsWith(".test.js"));
}

async function collectScripts() {
  const dir = join(ROOT, "scripts");
  return (await listFiles(dir)).filter(f => /\.(mjs|js|sh|plist)$/.test(f));
}

async function collectApi() {
  const dir = join(ROOT, "api");
  return (await listFiles(dir)).filter(f => f.endsWith(".js"));
}

async function collectWorkflows() {
  const dir = join(ROOT, ".github", "workflows");
  return (await listFiles(dir)).filter(f => f.endsWith(".yml") || f.endsWith(".yaml"));
}

async function collectDocs() {
  const dir = join(ROOT, "docs");
  return (await listFiles(dir)).filter(f => f.endsWith(".md"));
}

async function collectTests() {
  const all = await listFiles(join(ROOT, "src"), { recursive: true });
  return all.filter(f => /\.(test|spec)\.(js|jsx)$/.test(f));
}

async function collectPublic() {
  const dir = join(ROOT, "public");
  return await listFiles(dir);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function rel(p) { return relative(ROOT, p).replace(/\\/g, "/"); }

async function fileRow(p) {
  const src = await readText(p);
  return {
    name: basename(p),
    path: rel(p),
    lines: countLines(src),
    bytes: await sizeOf(p),
    doc: extractDocstring(src),
  };
}

function fmtBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function table(rows, cols) {
  const header = "| " + cols.map(c => c.label).join(" | ") + " |";
  const sep = "|" + cols.map(() => "---").join("|") + "|";
  const body = rows.map(r => "| " + cols.map(c => c.get(r)).join(" | ") + " |").join("\n");
  return [header, sep, body].join("\n");
}

async function main() {
  const [components, corePure, lib, scripts, api, workflows, docs, tests, publicFiles] = await Promise.all([
    collectComponents(),
    collectCorePure(),
    collectLib(),
    collectScripts(),
    collectApi(),
    collectWorkflows(),
    collectDocs(),
    collectTests(),
    collectPublic(),
  ]);

  // Totales para el resumen
  const totalLOC = async (paths) => {
    let n = 0;
    for (const p of paths) n += countLines(await readText(p));
    return n;
  };
  const allComponentFiles = [
    ...components.top,
    ...components.subdirs.flatMap(s => s.files),
  ];
  const [locComponents, locCore, locLib] = await Promise.all([
    totalLOC(allComponentFiles),
    totalLOC(corePure),
    totalLOC(lib),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  let out = `# 📐 Estructura del sistema — snapshot automático

> Actualizado: **${today}** · Generado por \`scripts/generate-structure-doc.mjs\`
> (cron nocturno). **No editar a mano** — los cambios se sobrescriben.
> Para la guía humana de cómo está organizado todo, ver \`MAPA_DEL_SISTEMA.md\`.
> Para decisiones y contexto, ver \`CLAUDE.md\` + \`docs/SESSION_*.md\`.

## 📊 Totales

| Capa | Archivos | Líneas (aprox.) |
|---|---:|---:|
| Componentes (pantallas + sub-piezas) | ${allComponentFiles.length} | ${locComponents.toLocaleString("es-AR")} |
| Módulos puros (cerebro de cálculos) | ${corePure.length} | ${locCore.toLocaleString("es-AR")} |
| Utilidades (\`src/lib/\`) | ${lib.length} | ${locLib.toLocaleString("es-AR")} |
| Tests | ${tests.length} | — |
| Scripts | ${scripts.length} | — |
| Endpoints serverless | ${api.length} | — |
| Workflows GitHub Actions | ${workflows.length} | — |
| Docs (.md) | ${docs.length} | — |

---

## 🖥️ Componentes — pantallas principales (\`src/components/\`)

Cada archivo \`.jsx\` es una pantalla o módulo visible en la nav. La columna
"Qué hace" sale de la primera línea de comentario del archivo.

`;

  const topRows = await Promise.all(components.top.map(fileRow));
  out += table(topRows, [
    { label: "Archivo", get: r => r.name },
    { label: "Líneas", get: r => r.lines },
    { label: "Qué hace", get: r => r.doc || "—" },
  ]) + "\n\n";

  out += `## 📂 Componentes — sub-carpetas\n\n`;
  for (const sub of components.subdirs) {
    out += `### \`src/components/${sub.name}/\` (${sub.files.length} archivos)\n\n`;
    const rows = await Promise.all(sub.files.map(fileRow));
    out += table(rows, [
      { label: "Archivo", get: r => r.name },
      { label: "Líneas", get: r => r.lines },
      { label: "Qué hace", get: r => r.doc || "—" },
    ]) + "\n\n";
  }

  out += `## 🧠 Módulos puros — el "cerebro" de cálculos (\`src/\`)\n\n`;
  out += `Funciones puras del negocio: matemática financiera, inteligencia de\n`;
  out += `producto/cliente, métricas, sync. Sin pantalla → testeable.\n\n`;
  const coreRows = await Promise.all(corePure.map(fileRow));
  out += table(coreRows, [
    { label: "Archivo", get: r => r.name },
    { label: "Líneas", get: r => r.lines },
    { label: "Qué hace", get: r => r.doc || "—" },
  ]) + "\n\n";

  out += `## 🛠️ Utilidades — \`src/lib/\`\n\n`;
  const libRows = await Promise.all(lib.map(fileRow));
  out += table(libRows, [
    { label: "Archivo", get: r => r.name },
    { label: "Líneas", get: r => r.lines },
    { label: "Qué hace", get: r => r.doc || "—" },
  ]) + "\n\n";

  out += `## ☁️ Backend — corre fuera del navegador\n\n`;
  out += `### Endpoints serverless (\`api/\`)\n\n`;
  const apiRows = await Promise.all(api.map(fileRow));
  out += (apiRows.length ? table(apiRows, [
    { label: "Endpoint", get: r => r.name },
    { label: "Qué hace", get: r => r.doc || "—" },
  ]) : "_(ninguno)_") + "\n\n";

  out += `### Workflows automáticos (\`.github/workflows/\`)\n\n`;
  const wfRows = workflows.map(p => ({ name: basename(p), path: rel(p) }));
  out += (wfRows.length ? table(wfRows, [
    { label: "Workflow", get: r => r.name },
    { label: "Ruta", get: r => r.path },
  ]) : "_(ninguno)_") + "\n\n";

  out += `### Scripts (\`scripts/\`)\n\n`;
  const scriptRows = await Promise.all(scripts.map(async p => ({
    name: basename(p),
    doc: extractDocstring(await readText(p)) || "—",
  })));
  out += table(scriptRows, [
    { label: "Script", get: r => r.name },
    { label: "Qué hace", get: r => r.doc },
  ]) + "\n\n";

  out += `## 🧪 Tests\n\n`;
  out += `Tests detectados: **${tests.length}**. Para correrlos: \`npm test\`.\n\n`;
  out += tests.map(p => `- \`${rel(p)}\``).join("\n") + "\n\n";

  out += `## 📦 Public (PWA + assets)\n\n`;
  out += publicFiles.map(p => `- \`${rel(p)}\` (${fmtBytes(0 /* size irrelevante para hash */)}__SIZE_REPLACED__\`${basename(p)}\``).join("") || "_(vacío)_";
  // Versión más simple sin tamaños cambiantes (los tamaños rompen idempotencia)
  out = out.replace(/## 📦 Public \(PWA \+ assets\)[\s\S]*$/, `## 📦 Public (PWA + assets)\n\n` + publicFiles.map(p => `- \`${rel(p)}\``).join("\n") + "\n\n");

  out += `## 📚 Documentación (\`docs/\`)\n\n`;
  out += docs.map(p => `- \`${rel(p)}\``).join("\n") + "\n";

  return out;
}

const newContent = await main();

// Idempotencia: si el archivo existe y es idéntico al output nuevo, no escribimos.
const existing = (await exists(OUT)) ? await readText(OUT) : "";
if (existing === newContent) {
  console.log("ESTRUCTURA.md ya está al día — no se escribe nada.");
  process.exit(0);
}

await fs.mkdir(dirname(OUT), { recursive: true });
await fs.writeFile(OUT, newContent, "utf8");
console.log(`✅ ESTRUCTURA.md regenerado (${newContent.length} bytes).`);
