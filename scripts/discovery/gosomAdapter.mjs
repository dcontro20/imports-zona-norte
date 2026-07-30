// gosomAdapter.mjs — adapter Node del binario gosom/google-maps-scraper.
// Port de la invocación de GosomDiscoverer (referencia: Atlas
// atlas/adapters/discover_gosom.py) — mismos flags, mismo cálculo de depth,
// misma tolerancia: el binario puede salir con código ≠0 y aun así haber
// producido resultados; solo es error si NO hay archivo de resultados.
//
// Reglas heredadas (vinculantes):
//   - P2: depth mínimo necesario para el tope; el tope trunca igual.
//   - P3: gosom navega deslogueado; jamás se le pasan cookies ni cuentas.
//   - Rate limiting humano: concurrencia 1 (-c 1).
//   - Telemetría del binario (posthog) SIEMPRE desactivada.
//
// El binario es un tercero (github.com/gosom/google-maps-scraper v1.17.2),
// copia PROPIA de Imports en scripts/discovery/bin/ (gitignoreado).
// Instalación: scripts/DISCOVERY_SETUP.md.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseGosomRecord } from "../../src/lib/discovery/gosomParse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_BINARY = process.env.GOSOM_BINARY || join(__dirname, "bin", "google-maps-scraper");

const RESULTS_PER_DEPTH = 20;   // observado: depth 1 ≈ 20 resultados (heredado)
const MAX_DEPTH = 10;

const pExecFile = promisify(execFile);

// descubrirConGosom({termino, ubicacion, tope, idioma}) → RawBusiness[]
export async function descubrirConGosom({ termino, ubicacion, tope, idioma = "es",
                                          binary = DEFAULT_BINARY, timeoutMs = 1800_000 }) {
  if (!existsSync(binary)) {
    throw new Error(`binario de gosom no encontrado en ${binary} — instalación: scripts/DISCOVERY_SETUP.md`);
  }
  const depth = Math.min(MAX_DEPTH, Math.max(1, Math.ceil(tope / RESULTS_PER_DEPTH)));
  const tmp = await mkdtemp(join(tmpdir(), "izn-gosom-"));
  const qfile = join(tmp, "queries.txt");
  const rfile = join(tmp, "results.ndjson");
  try {
    await writeFile(qfile, `${termino} ${ubicacion}\n`, "utf8");
    let execError = null;
    try {
      await pExecFile(binary,
        ["-input", qfile, "-results", rfile, "-json", "-lang", idioma,
         "-depth", String(depth), "-c", "1", "-exit-on-inactivity", "3m"],
        { timeout: timeoutMs, env: { ...process.env, DISABLE_TELEMETRY: "1" },
          maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
      execError = e;   // exit ≠0 no es error si el archivo de resultados existe
    }
    if (!existsSync(rfile)) {
      const stderr = String(execError?.stderr || "").slice(-500);
      throw new Error(`gosom no produjo resultados (exit ${execError?.code ?? "?"}). stderr: ${stderr}`);
    }
    const lines = (await readFile(rfile, "utf8"))
      .split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
    return lines.map(parseGosomRecord).slice(0, tope);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
