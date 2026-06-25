// Vercel Serverless Function: 🤖 AGENTE REDACTOR.
//
// Genera el COPY del mensaje de stock diario y lo guarda en Firestore para que
// la app (y, opcionalmente, la push) lo lean ya escrito. La IA escribe sólo el
// marco humano (gancho + urgencia + cierre); el catálogo lo arma generateFullMessage
// de forma determinista. Toda la lógica pura vive en src/lib/messageAgent.js.
//
// Lo llama un cron de GitHub Actions (.github/workflows/message-agent-cron.yml)
// ~15 min antes de cada slot de push, con Authorization: Bearer $PUSH_CRON_SECRET.
//
// Flujo:
//   1. Auth timing-safe (mismo secreto que la push: PUSH_CRON_SECRET).
//   2. Determina el slot (?slot=noon|evening, default por hora ART).
//   3. Dedupe: si ya existe dailyMessage/{fecha}_{slot}, salta (salvo ?force=1).
//   4. Lee products + sales + exchangeRate de Firestore (colección appData).
//   5. Arma el contexto y pide el copy a Claude. Si no hay ANTHROPIC_API_KEY o
//      falla, cae al copy de template (igual da variedad por día/slot).
//   6. Ensambla el mensaje final y lo guarda en dailyMessage/{fecha}_{slot}.
//
// Modo prueba: POST /api/generate-daily-message?test=1[&slot=evening] genera YA,
// ignora el dedupe y NO requiere que el slot esté "vencido".
//
// Env vars (Vercel → Settings → Environment Variables):
//   FIREBASE_SERVICE_ACCOUNT  JSON del service account (una línea) — ya existe para la push
//   PUSH_CRON_SECRET          string random compartido con GitHub Actions — ya existe
//   ANTHROPIC_API_KEY         (opcional) si falta, el agente usa el copy de template
//   MESSAGE_AGENT_MODEL       (opcional) override del modelo; default claude-opus-4-8

import admin from "firebase-admin";
import { timingSafeEqual } from "node:crypto";
import { nowInTZ } from "../src/lib/pushWindow.js";
import { generateFullMessage } from "../src/lib/whatsappMessage.js";
import {
  buildCatalogContext,
  templateCopy,
  normalizeCopy,
  composeDailyMessage,
  buildSystemPrompt,
  buildUserPrompt,
  MESSAGE_COPY_SCHEMA,
} from "../src/lib/messageAgent.js";

const DEFAULT_MODEL = "claude-opus-4-8";

// Comparación de strings resistente a timing attacks.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env var missing");
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}

// Lee un doc de la colección appData. Cada doc guarda { data: "<json>", updatedAt }.
async function readAppData(db, key, fallback) {
  const snap = await db.doc(`appData/${key}`).get();
  if (!snap.exists) return fallback;
  try {
    const parsed = JSON.parse(snap.data().data);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

// Normaliza el exchangeRate (puede venir número o objeto legacy con .venta/.value).
function coerceRate(raw, fallback = 1415) {
  if (typeof raw === "number" && raw > 0) return raw;
  if (raw && typeof raw === "object") {
    const n = Number(raw.venta ?? raw.value ?? raw.blue);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Decide el slot actual desde la hora ART si no vino explícito.
// Mediodía: 00:00–15:00 → "noon". Tarde: 15:00–24:00 → "evening".
function resolveSlot(querySlot, minutes) {
  if (querySlot === "noon" || querySlot === "evening") return querySlot;
  return minutes < 15 * 60 ? "noon" : "evening";
}

// Llama a Claude para generar el copy. Devuelve el objeto copy normalizado, o
// null si no hay API key / falla (el caller cae al template).
async function generateAiCopy(context) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  let Anthropic;
  try {
    ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
  } catch {
    console.error("[redactor] @anthropic-ai/sdk no instalado — uso template");
    return null;
  }

  try {
    const client = new Anthropic({ apiKey });
    const model = process.env.MESSAGE_AGENT_MODEL || DEFAULT_MODEL;
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: buildSystemPrompt(),
      output_config: { format: { type: "json_schema", schema: MESSAGE_COPY_SCHEMA } },
      messages: [{ role: "user", content: buildUserPrompt(context) }],
    });

    if (response.stop_reason === "refusal") {
      console.error("[redactor] respuesta rechazada por el modelo — uso template");
      return null;
    }
    const textBlock = (response.content || []).find(b => b.type === "text");
    if (!textBlock) return null;
    const parsed = JSON.parse(textBlock.text);
    return normalizeCopy({ ...parsed, source: "ai" }, "ai");
  } catch (e) {
    console.error("[redactor] error llamando a Claude — uso template:", e?.message || e);
    return null;
  }
}

export default async function handler(req, res) {
  // Auth: mismo secreto que la push (no obliga a Diego a crear uno nuevo).
  const auth = req.headers.authorization || "";
  const secret = process.env.PUSH_CRON_SECRET;
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  let db;
  try {
    db = admin.firestore(getAdminApp());
  } catch (e) {
    console.error("[redactor] admin init failed:", e?.message || e);
    return res.status(500).json({ error: "admin_init_failed" });
  }

  const isTest = req.query?.test === "1" || req.query?.test === "true";
  const force = isTest || req.query?.force === "1";
  const { date, minutes } = nowInTZ(new Date());
  const slot = resolveSlot(req.query?.slot, minutes);
  const docId = `${date}_${slot}`;

  // Dedupe: si ya está generado para hoy+slot, no quemamos tokens de nuevo.
  if (!force) {
    const existing = await db.doc(`dailyMessage/${docId}`).get();
    if (existing.exists) {
      return res.status(200).json({ skipped: "already_generated", date, slot });
    }
  }

  // Datos vivos del negocio.
  const [products, sales, rateRaw] = await Promise.all([
    readAppData(db, "products", []),
    readAppData(db, "sales", []),
    readAppData(db, "exchangeRate", 1415),
  ]);
  const exchangeRate = coerceRate(rateRaw);

  // Contexto + copy (IA con fallback a template) + catálogo determinista.
  const context = buildCatalogContext({ products, sales, now: new Date(), slot });
  const aiCopy = await generateAiCopy(context);
  const copy = aiCopy || templateCopy(context);
  const catalogBody = generateFullMessage(products, exchangeRate);
  const message = composeDailyMessage(copy, catalogBody);

  const payload = {
    date,
    slot,
    message,
    copy,
    source: copy.source,
    stats: context.stats,
    generatedAt: new Date().toISOString(),
  };

  // .set() (no .create()): si fue ?force lo sobrescribe; el dedupe de arriba ya
  // evita el doble trabajo en la corrida normal del cron.
  await db.doc(`dailyMessage/${docId}`).set(payload);

  return res.status(200).json({
    ok: true,
    date,
    slot,
    source: copy.source,
    chars: message.length,
    preview: message.slice(0, 280),
  });
}
