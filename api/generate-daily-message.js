// Vercel Serverless Function: 🤖 AGENTE REDACTOR (versión sin costo de API).
//
// Genera el mensaje de stock diario y lo guarda en Firestore para que la app
// (y, opcionalmente, la push) lo lean ya escrito. NO llama a ninguna API paga:
// el copy creativo sale del BANCO de copys (src/lib/messageCopyBank.js), que
// Claude escribe en la sesión de Diego (plan MAX) y se refresca con el comando
// /regenerar-banco-mensajes. El catálogo lo arma generateFullMessage de forma
// determinista. Toda la lógica vive en src/lib/* y está testeada.
//
// Lo llama un cron de GitHub Actions (.github/workflows/message-agent-cron.yml)
// ~30 min antes de cada slot, con Authorization: Bearer $PUSH_CRON_SECRET.
//
// Flujo:
//   1. Auth timing-safe (mismo secreto que la push: PUSH_CRON_SECRET).
//   2. Determina el slot (?slot=noon|evening, default por hora ART).
//   3. Dedupe: si ya existe dailyMessage/{fecha}_{slot}, salta (salvo ?force=1).
//   4. Lee products + sales + exchangeRate de Firestore (colección appData).
//   5. Arma el contexto, elige el copy del banco (rotado por día/slot/situación).
//   6. Ensambla el mensaje final y lo guarda en dailyMessage/{fecha}_{slot}.
//
// Modo prueba: POST /api/generate-daily-message?test=1[&slot=evening] genera YA,
// ignora el dedupe y NO requiere que el slot esté "vencido".
//
// Env vars (Vercel → Settings → Environment Variables) — TODAS YA EXISTEN:
//   FIREBASE_SERVICE_ACCOUNT  JSON del service account (lo usa la push)
//   PUSH_CRON_SECRET          string random compartido con GitHub Actions
//   (NO se necesita ninguna API key — cero costo extra.)

import admin from "firebase-admin";
import { timingSafeEqual } from "node:crypto";
import { nowInTZ } from "../src/lib/pushWindow.js";
import { generateFullMessage } from "../src/lib/whatsappMessage.js";
import { buildCatalogContext, composeDailyMessage } from "../src/lib/messageAgent.js";
import { pickDailyCopy } from "../src/lib/messageCopyBank.js";

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

  // Dedupe: si ya está generado para hoy+slot, no rehacemos el trabajo.
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

  // Contexto + copy del banco (rotado, contextual) + catálogo determinista.
  const context = buildCatalogContext({ products, sales, now: new Date(), slot });
  const copy = pickDailyCopy(context);
  const catalogBody = generateFullMessage(products, exchangeRate);
  const message = composeDailyMessage(copy, catalogBody);

  const payload = {
    date,
    slot,
    message,
    copy,
    source: copy.source,        // "bank"
    situation: copy.situation,  // novedad | agotando | top | normal
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
    situation: copy.situation,
    chars: message.length,
    preview: message.slice(0, 280),
  });
}
