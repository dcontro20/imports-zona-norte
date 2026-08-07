// ColasProspectos.jsx — la pantalla ☀️ Hoy del sistema de ejecución comercial
// (ciclo v2 F3, spec docs/PROSPECT_CRM_EJECUCION_SPEC.md §6): el sistema
// organiza el trabajo en COLAS y propone la siguiente acción; el usuario
// ejecuta o descarta.
//
// Dos criterios de Gustavo mandan sobre este archivo:
//  1. "Por analizar" es una ETAPA DE ANÁLISIS, no una lista de prospectos
//     nuevos: es el único momento en que se toma una decisión comercial
//     (¿vale la pena este negocio?). Por eso es un DECK de a uno con el
//     expediente completo, y no una card más.
//  2. El sistema nunca debe volverse ruidoso: una sola cola activa a la vez,
//     las colas sin trabajo NO se muestran, y no hay banners compitiendo con
//     la cola (el aviso de "entraron solos" de F2 lo absorbió la cola 🔍).
//
// Las acciones son taps que registran HECHOS (prospectHechos.js vía
// makeProspectActions — única fuente con la Ficha y el Embudo). Ninguna
// escribe una etapa: la etapa se deriva sola.
import { useState, useMemo } from "react";
import { formatDate } from "../../helpers.js";
import { useResponsive } from "../../App.jsx";
import { Btn, MiniBtn, Badge } from "../UI.jsx";
import { T } from "../../theme.js";
import { ETAPAS_OPERATIVAS, subEstadoEspera } from "../../lib/prospectEtapas.js";
import { ProspectMapsLine } from "./ProspectMapsLine.jsx";

// Las colas de TRABAJO: las 7 etapas operativas menos `cliente` (que ya salió
// del CRM hacia Kioscos). El orden ES el flujo: descubrir → analizar →
// ejecutar → seguir → cerrar.
export const COLAS = ETAPAS_OPERATIVAS
  .filter(e => e.key !== "cliente")
  .map(e => ({ ...e, corto: { por_analizar: "Analizar", para_contactar: "Contactar", para_visitar: "Visitar", esperando_respuesta: "Esperando", visitado: "Visitados", negociacion: "Cerrar" }[e.key] }));

const HORARIOS = { si: "abre todos los días", no: "abre algunos días", sin_datos: "" };

// Color del chip de prioridad (mapeo de DISPLAY; la etiqueta la da el dominio).
// Escala de calor para que el ojo encuentre primero lo que más conviene
// trabajar. Vivía en Pipeline.jsx, que se retiró en F4; la usan las colas, el
// Embudo y la Ficha — una sola escala en todo el módulo.
export const PRIORIDAD_COLOR = {
  muy_alta: T.green, alta: T.blue, media: T.amber, baja: T.textMuted, "": T.textFaint,
};

// ---------------------------------------------------------------------------
// Barra de colas: el mapa del trabajo del día. Solo aparecen las que TIENEN
// trabajo; 🔍 es la excepción (queda siempre porque hospeda el descubrimiento,
// que es la puerta de entrada del flujo).
// ---------------------------------------------------------------------------
export function BarraColas({ conteo = {}, vencidos = 0, activa, onSelect }) {
  const { isMobile } = useResponsive();
  const visibles = COLAS.filter(c => (conteo[c.key] || 0) > 0 || c.key === "por_analizar");
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
      {visibles.map(c => {
        const sel = activa === c.key;
        const n = conteo[c.key] || 0;
        return (
          <button key={c.key} onClick={() => onSelect?.(c.key)} title={c.etiqueta} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: isMobile ? "10px 12px" : "8px 12px", minHeight: 44,
            borderRadius: 10, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            background: sel ? T.primarySoft : T.card,
            color: sel ? T.primary : T.textMuted,
            border: `1px solid ${sel ? T.primary : T.border}`,
            fontWeight: sel ? 800 : 600,
          }}>
            <span>{c.icono}</span>
            {/* Mobile: solo la cola activa se nombra. Con 6 chips etiquetados
                la barra ocupaba 3 filas antes de que se viera el trabajo; y el
                chip activo alcanza para saber dónde estás (la lista ya no
                lleva título propio). */}
            {(!isMobile || sel) && <span>{c.corto}</span>}
            <span style={{ fontWeight: 800, color: sel ? T.primary : T.text }}>{n}</span>
            {/* Los vencidos son lo ÚNICO que pide atención dentro de la espera */}
            {c.key === "esperando_respuesta" && vencidos > 0 && (
              <span style={{ fontSize: 10, fontWeight: 800, color: T.red, background: T.redBg, borderRadius: 999, padding: "1px 6px" }}>
                {vencidos} para reintentar
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El DECK de análisis (cola 🔍) — criterio 1: acá se decide, no se revisa.
// Un negocio por vez, con TODO lo que el descubrimiento sabe de él, y una
// pregunta explícita. "Saltear" no registra ningún hecho: manda el negocio al
// final de la fila y sigue — no es una decisión, es postergarla.
// ---------------------------------------------------------------------------
export function DeckAnalisis({ items = [], acciones, onFicha, herramientas = null, siguiente = null }) {
  const { isMobile } = useResponsive();
  const [salteados, setSalteados] = useState(() => new Set());

  // Los salteados van al final en vez de desaparecer: si el usuario saltea
  // todos, la fila sigue existiendo (nunca se pierde trabajo por postergarlo).
  const fila = useMemo(() => {
    const pend = items.filter(it => !salteados.has(it.prospect.id));
    const post = items.filter(it => salteados.has(it.prospect.id));
    return [...pend, ...post];
  }, [items, salteados]);

  if (!items.length) {
    return (
      <div>
        <div style={{
          fontSize: 13, color: T.textMuted, background: T.bg, border: `1px solid ${T.borderSoft}`,
          borderRadius: 12, padding: isMobile ? "24px 16px" : 28, textAlign: "center", marginBottom: 16,
        }}>
          Nada para analizar. Buscá negocios nuevos y entran solos acá.
          {siguiente && (
            <div style={{ marginTop: 10 }}>
              <MiniBtn onClick={siguiente.onIr} color={T.blue}>
                {siguiente.icono} Te quedan {siguiente.cantidad} en {siguiente.etiqueta} →
              </MiniBtn>
            </div>
          )}
        </div>
        {herramientas}
      </div>
    );
  }

  const it = fila[0];
  const p = it.prospect;
  const restantes = items.length;
  const yaSalteado = salteados.has(p.id);
  const saltear = () => setSalteados(prev => new Set(prev).add(p.id));
  const detalle = [
    p.categoria || "",
    HORARIOS[p.horariosCompletos] || "",
  ].filter(Boolean).join(" · ");

  return (
    <div>
      {/* Lo único que va arriba del deck es el avance: cuánto falta decidir */}
      <div style={{ fontSize: 11, color: T.textFaint, textAlign: "right", marginBottom: 8 }}>
        {restantes} {restantes === 1 ? "negocio" : "negocios"} sin decidir
      </div>

      {/* key: remontar al cambiar de negocio da el "pasó al siguiente" (D-A) */}
      <div key={p.id} style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: isMobile ? 16 : 20, animation: "fadeIn 180ms ease-out", marginBottom: 16,
      }}>
        <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: T.text }}>{p.businessName}</div>
        <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>
          {[p.address, p.zone].filter(Boolean).join(" · ") || "sin dirección"}
        </div>

        {/* El expediente: lo que se sabe del negocio para poder JUZGARLO */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "14px 0" }}>
          <Dato icono="⭐">
            {p.rating != null
              ? <>{p.rating} <span style={{ color: T.textFaint }}>· {p.reviewsCount != null ? `${p.reviewsCount} reseñas` : "sin reseñas"}</span></>
              : <span style={{ color: T.textFaint }}>Sin calificación en Maps</span>}
          </Dato>
          {detalle && <Dato icono="🏷">{detalle}</Dato>}
          <Dato icono="📞">
            {p.phone
              ? <>{p.phone} <span style={{ color: T.textFaint }}>· se puede contactar</span></>
              : <span style={{ color: T.amber }}>Sin teléfono — va a la cola de visitar</span>}
          </Dato>
          {(p.web || p.redSocial) && (
            <Dato icono="🌐">
              <a href={p.web} target="_blank" rel="noreferrer" style={{ color: T.blue }}>{p.redSocial || "sitio web"}</a>
            </Dato>
          )}
          {p.descubiertoTermino && (
            <Dato icono="🔎">
              <span style={{ color: T.textFaint }}>
                Encontrado buscando "{p.descubiertoTermino}"{p.descubiertoEn ? ` en ${p.descubiertoEn}` : ""}
                {p.descubiertoAt ? ` · ${formatDate(p.descubiertoAt)}` : ""}
              </span>
            </Dato>
          )}
        </div>
        <ProspectMapsLine prospect={p} style={{ marginBottom: 16 }} />

        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 10 }}>
          ¿Vale la pena trabajarlo?
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn onClick={() => acciones?.analizar(p)} style={{ flex: isMobile ? "1 1 100%" : "0 0 auto" }}>✓ Trabajar</Btn>
          <Btn variant="secondary" onClick={() => acciones?.descartar(p)}
            style={{ flex: isMobile ? "1 1 100%" : "0 0 auto", color: T.red, borderColor: T.redBorder }}>
            ✗ Descartar
          </Btn>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          {fila.length > 1 && (
            <button onClick={saltear} style={linkBtn}>
              {yaSalteado ? "Siguiente" : "Saltear por ahora"}
            </button>
          )}
          <button onClick={() => onFicha?.(p.id)} style={linkBtn}>Ver ficha completa</button>
        </div>
        <div style={{ fontSize: 10.5, color: T.textFaint, marginTop: 10 }}>
          Descartar recuerda: no vuelve a aparecer en próximas búsquedas.
        </div>
      </div>

      {herramientas}
    </div>
  );
}

const linkBtn = {
  background: "none", border: "none", padding: "6px 0", cursor: "pointer",
  fontFamily: "inherit", fontSize: 12, color: T.textMuted, textDecoration: "underline",
};

const Dato = ({ icono, children }) => (
  <div style={{ display: "flex", gap: 8, fontSize: 13, color: T.text, alignItems: "baseline" }}>
    <span style={{ flexShrink: 0 }}>{icono}</span>
    <span style={{ minWidth: 0 }}>{children}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Las colas de EJECUCIÓN (💬 🚶 ⏳ 📋 🤝): misma gramática entre sí — card
// compacta, acción primaria de la etapa, y la Ficha a un tap.
// ---------------------------------------------------------------------------
export function ColaLista({ cola, items = [], visits = [], acciones, onFicha, onVisita, onPresentar, prioridadColor }) {
  const { isMobile } = useResponsive();
  if (!items.length) {
    return (
      <div style={{ fontSize: 13, color: T.textFaint, background: T.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: isMobile ? "24px 16px" : 28, textAlign: "center" }}>
        Nada pendiente en esta cola.
      </div>
    );
  }
  // Sin título propio: el chip activo de la barra YA dice en qué cola estás.
  // Repetirlo sería el tipo de ruido que la pantalla tiene que evitar.
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map(it => {
          const p = it.prospect;
          const espera = cola.key === "esperando_respuesta" ? subEstadoEspera(p) : "";
          return (
            <div key={p.id} style={{ background: T.card, border: `1px solid ${espera === "reintentar" ? T.redBorder : T.border}`, borderRadius: 12, padding: 12 }}>
              <div onClick={() => onFicha?.(p.id)} title="Abrir ficha"
                style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, cursor: "pointer" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>
                    {p.businessName}<span style={{ color: T.textFaint, fontWeight: 400 }}>{" ›"}</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                    {p.zone || "sin zona"}{contexto(cola.key, p, visits)}
                  </div>
                </div>
                <span style={{ flexShrink: 0, display: "flex", gap: 4, alignItems: "center" }}>
                  {espera === "reintentar" && <Badge color={T.red}>reintentar</Badge>}
                  <Badge color={prioridadColor?.(it) ?? T.textFaint}>{it.chip?.etiqueta}</Badge>
                </span>
              </div>
              <ProspectMapsLine prospect={p} style={{ marginTop: 4 }} />
              {/* El engine propone; el operador ejecuta */}
              <div style={{ fontSize: 12, color: T.textSub, margin: "8px 0", display: "flex", gap: 6 }}>
                <span style={{ flexShrink: 0 }}>{it.proximoPaso?.icono || "👉"}</span>
                <span>{it.proximoPaso?.texto}</span>
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {accionesDeEtapa(cola.key, p, { espera }).map(a => (
                  <MiniBtn key={a.key} color={a.color}
                    onClick={() => a.run(p, { acciones, onVisita, onPresentar })}>{a.label}</MiniBtn>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// El contexto que importa EN ESA cola (y solo ese: nada de datos de relleno).
function contexto(colaKey, p, visits) {
  if (colaKey === "esperando_respuesta" && p.mensajeEnviadoAt) return ` · escrito ${formatDate(p.mensajeEnviadoAt)}`;
  if (colaKey === "visitado" || colaKey === "negociacion") {
    const v = ultimaVisitaDe(visits, p.id);
    if (v) return ` · visitado ${formatDate(v)}`;
  }
  if (colaKey === "para_contactar" && p.analizadoAt) return ` · analizado ${formatDate(p.analizadoAt)}`;
  return "";
}

function ultimaVisitaDe(visits, id) {
  let max = "";
  for (const v of visits || []) {
    if (!v || v.isDeleted || v.targetId !== id) continue;
    if (String(v.date || "") > max) max = String(v.date || "");
  }
  return max;
}

// Las acciones de cada etapa, en orden: **la primera es la PRIMARIA** (tabla §1
// del spec, columna "Acción primaria"). Devuelve DESCRIPTORES, no JSX, porque
// las consumen dos pantallas con formas distintas: la cola las pinta todas
// como MiniBtn, y la Ficha pinta la primera como botón principal (F4). Única
// fuente: si divergieran, la cola y la Ficha propondrían cosas distintas para
// el mismo prospecto.
const A = {
  trabajar:   { key: "trabajar",   label: "✓ Trabajar",     color: T.green,  run: (p, h) => h.acciones?.analizar(p) },
  descartar:  { key: "descartar",  label: "✗ Descartar",    color: T.red,    run: (p, h) => { h.acciones?.descartar(p); h.onCerrar?.(); } },
  presentar:  { key: "presentar",  label: "💬 Presentar",   color: T.green,  run: (p, h) => h.onPresentar?.(p) },
  reescribir: { key: "reescribir", label: "💬 Reescribir",  color: T.blue,   run: (p, h) => h.onPresentar?.(p) },
  llamar:     { key: "llamar",     label: "📞 Llamar",      color: T.blue,   run: (p) => { window.location.href = `tel:${String(p.phone).replace(/[^\d+]/g, "")}`; } },
  visita:     { key: "visita",     label: "📋 Visita",      color: T.amber,  run: (p, h) => h.onVisita?.(p) },
  respondio:  { key: "respondio",  label: "🟢 Respondió",   color: T.green,  run: (p, h) => h.acciones?.respondio(p) },
  noResponde: { key: "noResponde", label: "🔴 No responde", color: T.red,    run: (p, h) => h.acciones?.noResponde(p) },
  negociar:   { key: "negociar",   label: "🤝 Negociando",  color: T.blue,   run: (p, h) => h.acciones?.negociar(p) },
  convertir:  { key: "convertir",  label: "✓ Convertir",    color: T.green,  run: (p, h) => { h.acciones?.convertir(p); h.onCerrar?.(); } },
};

export function accionesDeEtapa(etapaKey, p = {}, { espera = "" } = {}) {
  switch (etapaKey) {
    case "por_analizar":        return [A.trabajar, A.descartar];
    case "para_contactar":      return p.phone ? [A.presentar, A.llamar] : [A.presentar];
    // Sin teléfono el plan es ir, pero el mensaje sigue sirviendo (mandarlo por
    // IG, o mostrarlo en el mostrador): secundaria, no primaria.
    case "para_visitar":        return [A.visita, A.presentar];
    case "esperando_respuesta": return espera === "reintentar"
      ? [A.respondio, A.noResponde, A.reescribir] : [A.respondio, A.noResponde];
    // Después de visitar lo natural es negociar; convertir es el cierre.
    case "visitado":            return [A.negociar, A.convertir, A.visita];
    case "negociacion":         return [A.convertir, A.presentar, A.visita];
    default:                    return [A.visita];
  }
}
