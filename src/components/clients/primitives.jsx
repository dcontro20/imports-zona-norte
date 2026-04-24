// Primitivas de UI compartidas entre Clients.jsx y HistoryModal.

import { T, pickAvatarColor } from "../../theme.js";
import { monthLabel } from "./helpers.js";

export const Sparkline = ({ data, width = 200, height = 50, color = T.primary }) => {
  if (!data || data.length < 2) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.textMuted }}>No hay datos suficientes</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  const min = 0;
  const range = max - min || 1;
  const n = data.length;
  const points = data.map((d, i) => {
    const x = (i / (n - 1)) * (width - 20) + 10;
    const y = height - 10 - ((d.value - min) / range) * (height - 20);
    return [x, y];
  });
  const path = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const area = `${path} L${points[points.length - 1][0]},${height - 10} L${points[0][0]},${height - 10} Z`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkGrad)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 3.5 : 2} fill={color} />
      ))}
      {data.map((d, i) => (
        <text key={`l-${i}`} x={points[i][0]} y={height - 2} textAnchor="middle" fontSize="9" fill={T.textMuted} fontFamily="inherit">
          {monthLabel(d.key)}
        </text>
      ))}
    </svg>
  );
};

export const Avatar = ({ name, id, size = 40 }) => {
  const { bg, fg } = pickAvatarColor(id || name);
  const initial = String(name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg, color: fg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: size * 0.42, flexShrink: 0,
      fontFamily: T.fontDisplay, letterSpacing: "-0.02em",
    }}>{initial}</div>
  );
};

export const SummaryStat = ({ label, value, sub, color = T.text }) => (
  <div style={{
    background: T.surface2, border: `1px solid ${T.borderSoft}`, borderRadius: 10,
    padding: "12px 14px",
  }}>
    <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: T.fontDisplay, marginTop: 3, letterSpacing: "-0.01em" }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{sub}</div>}
  </div>
);
