// Vercel Serverless Function: dispara las push remotas diarias vía FCM.
//
// Lo llama un cron de GitHub Actions cada ~10 min (.github/workflows/push-cron.yml)
// con Authorization: Bearer $PUSH_CRON_SECRET.
//
// Lógica:
//   1. Lee push/config de Firestore (enabled + horarios que setea la app)
//   2. Calcula la hora actual en Buenos Aires y pregunta a dueSlots()
//      si algún slot cae en la ventana [hora_slot, hora_slot + 45min)
//   3. Dedupe: crea push/sent_{fecha}_{slot} con .create() — si ya existe
//      (otro ping del cron ya lo mandó), salta. Atómico, sin race.
//   4. Manda data-message a todos los tokens de pushTokens vía FCM.
//      El SW del cliente (sw.js) renderiza la notificación.
//   5. Limpia tokens muertos (dispositivo desinstaló la PWA, token rotado).
//
// Modo prueba: POST /api/send-daily-push?test=1 manda YA a todos los
// dispositivos ignorando horarios y dedupe. Para validar el setup.
//
// Env vars requeridas (Vercel → Settings → Environment Variables):
//   FIREBASE_SERVICE_ACCOUNT  JSON del service account (una línea)
//   PUSH_CRON_SECRET          string random compartido con GitHub Actions

import admin from "firebase-admin";
import { timingSafeEqual } from "node:crypto";
import { nowInTZ, dueSlots } from "../src/lib/pushWindow.js";

// Comparación de strings resistente a timing attacks. Devuelve false si las
// longitudes difieren (sin leak) o si el contenido no coincide.
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
  const serviceAccount = JSON.parse(raw);
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function sendSlot(db, messaging, slot, tokens) {
  const message = {
    data: {
      title: slot.title,
      body: slot.body,
      slot: slot.slot,
      url: "/?page=offers",
    },
    webpush: {
      headers: { Urgency: "high", TTL: "3600" },
    },
  };
  const result = await messaging.sendEachForMulticast({ ...message, tokens });

  // Limpiar tokens muertos para no acumular basura
  const deadTokens = [];
  result.responses.forEach((r, i) => {
    const code = r.error?.code || "";
    if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
      deadTokens.push(tokens[i]);
    }
  });
  await Promise.all(deadTokens.map(t => db.doc(`pushTokens/${t}`).delete().catch(() => {})));

  return { success: result.successCount, failed: result.failureCount, cleaned: deadTokens.length };
}

export default async function handler(req, res) {
  // Auth: solo el cron (o Diego con el secret) puede disparar esto.
  // Comparación timing-safe para no filtrar el secreto byte a byte.
  const auth = req.headers.authorization || "";
  const secret = process.env.PUSH_CRON_SECRET;
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  let db, messaging;
  try {
    const app = getAdminApp();
    db = admin.firestore(app);
    messaging = admin.messaging(app);
  } catch (e) {
    // No devolver e.message al cliente (puede revelar detalle del service account).
    console.error("[push] admin init failed:", e?.message || e);
    return res.status(500).json({ error: "admin_init_failed" });
  }

  const isTest = req.query?.test === "1" || req.query?.test === "true";

  // Config escrita por la app (push/config). Sin config o disabled → no-op.
  const configSnap = await db.doc("push/config").get();
  const config = configSnap.exists ? configSnap.data() : null;
  if (!isTest && (!config || !config.enabled)) {
    return res.status(200).json({ skipped: "disabled_or_no_config" });
  }

  const { date, minutes } = nowInTZ(new Date(), config?.tz || undefined);

  const slots = isTest
    ? [{
        slot: "test",
        title: "🔔 Push de prueba",
        body: "Si estás leyendo esto en el lock screen, las push remotas funcionan. 🎉",
      }]
    : dueSlots(config, minutes);

  if (slots.length === 0) {
    return res.status(200).json({ skipped: "no_slot_due", date, minutes });
  }

  // Tokens de todos los dispositivos registrados
  const tokensSnap = await db.collection("pushTokens").get();
  const tokens = tokensSnap.docs.map(d => d.id);
  if (tokens.length === 0) {
    return res.status(200).json({ skipped: "no_tokens", date });
  }

  const results = {};
  for (const slot of slots) {
    if (!isTest) {
      // Dedupe atómico: .create() falla si el doc ya existe (ALREADY_EXISTS)
      try {
        await db.doc(`push/sent_${date}_${slot.slot}`).create({
          sentAt: new Date().toISOString(),
          tokens: tokens.length,
        });
      } catch (e) {
        if (e.code === 6 /* ALREADY_EXISTS */) {
          results[slot.slot] = { skipped: "already_sent_today" };
          continue;
        }
        throw e;
      }
    }
    results[slot.slot] = await sendSlot(db, messaging, slot, tokens);
  }

  return res.status(200).json({ ok: true, date, minutes, devices: tokens.length, results });
}
