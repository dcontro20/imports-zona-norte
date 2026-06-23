// Lógica PURA de scheduling de push remotas. Sin side effects — la usa
// tanto el endpoint serverless (api/send-daily-push.js) como los tests.
//
// Modelo: un cron externo (GitHub Actions) pinguea el endpoint cada ~10 min.
// El endpoint pregunta "¿algún slot cae en la ventana actual?" usando
// dueSlots(). El dedupe por día/slot vive en Firestore (doc push/sent_*),
// acá solo se decide la ventana.

import { parseTime } from "./notifications.js";

export const ART_TZ = "America/Argentina/Buenos_Aires";

// Ventana de tolerancia: el cron de GitHub Actions corre cada 30 min y puede
// atrasarse varios minutos. Con 60 min de ventana, cada horario de slot cae
// dentro de 2 corridas del cron → redundancia (la dedupe evita doble envío).
// Si el ping llega dentro de los WINDOW_MINUTES posteriores al horario del
// slot, se manda.
export const WINDOW_MINUTES = 60;

// Convierte un Date a { date: "YYYY-MM-DD", minutes: 0-1439 } en una TZ dada.
export function nowInTZ(now = new Date(), tz = ART_TZ) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (type) => parts.find(p => p.type === type)?.value;
  const hour = Number(get("hour")) % 24; // Intl puede devolver "24" para medianoche
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute")),
  };
}

// Dado el config { noonTime, eveningTime } y los minutos actuales del día,
// devuelve los slots que están "vencidos y dentro de ventana":
//   slotMinutes <= nowMinutes < slotMinutes + windowMinutes
export function dueSlots(config = {}, nowMinutes, windowMinutes = WINDOW_MINUTES) {
  const defs = [
    {
      slot: "noon",
      time: config.noonTime || "12:00",
      title: "☀️ Mediodía — mensaje de stock",
      body: "Es hora de marcar presencia: copiá el mensaje y pegalo al grupo.",
    },
    {
      slot: "evening",
      time: config.eveningTime || "18:30",
      title: "🌆 Tarde — segunda pasada",
      body: "Segundo envío del día: agarra a los que no vieron el del mediodía.",
    },
  ];
  return defs.filter(({ time }) => {
    const { hours, minutes } = parseTime(time);
    const slotMinutes = hours * 60 + minutes;
    return nowMinutes >= slotMinutes && nowMinutes < slotMinutes + windowMinutes;
  });
}
