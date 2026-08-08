// EmbudoOperativo.jsx — la pestaña 🎯 Embudo: dónde está parado todo.
//
// Rediseño 2026-08-07, después de prospectar de verdad. La versión anterior
// tenía una columna por etapa operativa (7) y cards sin acciones. Dos cosas no
// funcionaron en el uso real:
//   1. Siete columnas angostas no narran un flujo — son una pared. Ahora el
//      tablero son **4 FASES COMERCIALES** (Entrada → Contactando → En juego →
//      Clientes) que sí se ven angostar. Nada se pierde: cada card muestra su
//      etapa operativa real en un chip, y la etapa sigue siendo la verdad.
//   2. "Panorámico" se volvió "no puedo hacer nada desde acá". Las cards
//      recuperan su ACCIÓN PRIMARIA (la misma que propone la cola: leen
//      `accionesDeEtapa`). La diferencia con Hoy ya no es poder actuar, sino el
//      foco: Hoy te da UNA cola —la siguiente acción—; el Embudo te muestra
//      todo junto.
//
// La ficha se abre desde cualquier card, incluidas las de la fase Clientes:
// esos ya salieron del CRM y su ficha vive en Kioscos, así que se navega hasta
// allá (`onOpenKiosco`). "Siempre tiene que ser fácil entrar a la ficha" es
// regla del módulo, no una cortesía de esta pantalla.
import { useMemo } from "react";
import { useResponsive } from "../../App.jsx";
import { Btn, MiniBtn, Badge, downloadCSV } from "../UI.jsx";
import { T } from "../../theme.js";
import {
  FASES_COMERCIALES, ETAPAS_OPERATIVAS, etapaOperativa, faseDeEtapa, subEstadoEspera,
} from "../../lib/prospectEtapas.js";
import { prospectsToCSV } from "../../lib/wholesaleExport.js";
import { ProspectMapsLine } from "./ProspectMapsLine.jsx";
import { PRIORIDAD_COLOR, accionesDeEtapa } from "./ColasProspectos.jsx";

const ETAPA = Object.fromEntries(ETAPAS_OPERATIVAS.map(e => [e.key, e]));

export function EmbudoOperativo({
  prospects = [], clients = [], visits = [], ranking,
  onOpenFicha, onOpenKiosco, onNuevo, acciones, onVisita, onPresentar,
}) {
  const { isMobile } = useResponsive();

  const mayoristas = useMemo(
    () => clients.filter(c => c && !c.isDeleted && c.type === "mayorista"),
    [clients],
  );

  // Cada prospecto en UNA fase, ordenado por el ranking del engine (el mismo
  // orden que dentro de las colas: una sola idea de "qué conviene más").
  const porFase = useMemo(() => {
    const mapa = Object.fromEntries(FASES_COMERCIALES.map(f => [f.key, []]));
    for (const p of prospects) {
      if (!p || p.isDeleted || p.convertedClientId) continue;
      const etapa = etapaOperativa(p, { visits });
      mapa[faseDeEtapa(etapa)].push({ p, etapa });
    }
    for (const key of Object.keys(mapa)) {
      mapa[key].sort((a, b) =>
        (ranking?.porId[a.p.id]?.posicion ?? Infinity) - (ranking?.porId[b.p.id]?.posicion ?? Infinity));
    }
    return mapa;
  }, [prospects, visits, ranking]);

  const enJuego = FASES_COMERCIALES
    .filter(f => f.key !== "clientes")
    .reduce((n, f) => n + porFase[f.key].length, 0);

  const cantidadDe = (fase) => fase.key === "clientes" ? mayoristas.length : porFase[fase.key].length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: T.text, margin: 0, fontSize: 18 }}>Embudo de captación</h2>
          <div style={{ fontSize: 11, color: T.textFaint, marginTop: 2 }}>
            {enJuego} en juego · {mayoristas.length} cerrados
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {enJuego > 0 && (
            <Btn variant="secondary" onClick={() => downloadCSV(
              `prospectos_${new Date().toISOString().slice(0, 10)}.csv`, prospectsToCSV(prospects))}>
              📥 CSV
            </Btn>
          )}
          <Btn onClick={onNuevo}>+ Nuevo prospecto</Btn>
        </div>
      </div>

      {/* 4 columnas en compu; apiladas en el celu (nada de scroll lateral) */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        {FASES_COMERCIALES.map(fase => {
          const items = porFase[fase.key];
          const esClientes = fase.key === "clientes";
          const n = cantidadDe(fase);
          return (
            <div key={fase.key} style={{
              background: T.bg, border: `1px solid ${esClientes ? T.greenBorder : T.borderSoft}`,
              borderRadius: 12, padding: 10, minHeight: isMobile ? 0 : 90,
            }}>
              <div style={{
                fontSize: 12, fontWeight: 800, color: esClientes ? T.green : T.textSub,
                marginBottom: isMobile && n === 0 ? 0 : 10, display: "flex",
                justifyContent: "space-between", alignItems: "center", gap: 4,
                minHeight: isMobile ? 28 : undefined,
              }}>
                <span style={{ minWidth: 0 }}>{fase.icono} {fase.etiqueta}</span>
                <span style={{ color: T.textFaint, flexShrink: 0 }}>{n}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {esClientes
                  ? mayoristas.map(c => (
                    <CardCliente key={c.id} c={c} onOpenKiosco={onOpenKiosco} />
                  ))
                  : items.map(({ p, etapa }) => (
                    <CardProspecto
                      key={p.id} p={p} etapa={etapa} item={ranking?.porId[p.id]}
                      onOpenFicha={onOpenFicha}
                      handlers={{ acciones, onVisita, onPresentar }}
                    />
                  ))}
                {n === 0 && !isMobile && (
                  <div style={{ fontSize: 11, color: T.textFaint, textAlign: "center", padding: 8 }}>—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Card de prospecto: nombre + etapa REAL + prioridad + datos de Maps + su
// acción primaria. Tocar el cuerpo abre la Ficha.
function CardProspecto({ p, etapa, item, onOpenFicha, handlers }) {
  const info = ETAPA[etapa];
  const espera = etapa === "esperando_respuesta" ? subEstadoEspera(p) : "";
  // Solo la PRIMARIA en el tablero: acá se empuja el trabajo, no se despacha
  // (para eso está la cola, con todas las acciones de la etapa).
  const primaria = accionesDeEtapa(etapa, p, { espera })[0];
  return (
    <div style={{
      background: T.card, border: `1px solid ${espera === "reintentar" ? T.redBorder : T.border}`,
      borderRadius: 10, padding: 10,
    }}>
      <div onClick={() => onOpenFicha?.(p.id)} title="Abrir ficha" style={{ cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
          <div style={{ fontWeight: 700, color: T.text, fontSize: 13, flex: 1, minWidth: 0 }}>
            {p.businessName || p.name}
            {/* espacio duro: el chevron nunca se separa del nombre al envolver */}
            <span style={{ color: T.textFaint, fontWeight: 400 }}>{" ›"}</span>
          </div>
          {item?.chip && (
            <span style={{ flexShrink: 0 }}>
              <Badge color={PRIORIDAD_COLOR[item.chip.prioridad] ?? T.textFaint}>{item.chip.etiqueta}</Badge>
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
          {p.zone || "sin zona"}{p.contactName ? ` · ${p.contactName}` : ""}
        </div>
        {/* La etapa operativa no se pierde al agrupar en fases: viaja en la card */}
        <div style={{ fontSize: 10, color: T.textFaint, marginTop: 3, display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <span>{info?.icono} {info?.etiqueta}</span>
          {espera === "reintentar" && <span style={{ color: T.red, fontWeight: 700 }}>· reintentar</span>}
        </div>
        <ProspectMapsLine prospect={p} style={{ marginTop: 3 }} />
      </div>
      {primaria && (
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          <MiniBtn color={primaria.color} onClick={() => primaria.run(p, handlers)}>{primaria.label}</MiniBtn>
        </div>
      )}
    </div>
  );
}

// Card de cliente cerrado: el final del embudo. No se gestiona acá (vive en
// Kioscos), pero SÍ se abre desde acá — la ficha tiene que estar a un tap
// desde cualquier lugar.
function CardCliente({ c, onOpenKiosco }) {
  return (
    <div onClick={() => onOpenKiosco?.(c.id)} title="Abrir ficha en Kioscos"
      style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10, cursor: "pointer" }}>
      <div style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>
        {c.businessName || c.name}
        <span style={{ color: T.textFaint, fontWeight: 400 }}>{" ›"}</span>
      </div>
      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
        {c.zone || "sin zona"}
      </div>
    </div>
  );
}
