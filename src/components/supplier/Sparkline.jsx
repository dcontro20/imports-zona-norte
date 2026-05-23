// Sparkline mínimo, sin deps. Render SVG con polyline + fill area.
// Usado en cards de proveedor para mostrar 6m de gasto.
export function Sparkline({ data = [], width = 80, height = 28, color = "#5E6AD2", showDot = true }) {
  if (!data || data.length === 0) {
    return <div style={{ width, height, opacity: 0.2 }} />;
  }
  const values = data.map(d => Number(d) || 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = data.length > 1 ? width / (data.length - 1) : width;

  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y];
  });

  const polyPoints = points.map(([x, y]) => `${x},${y}`).join(" ");
  const areaPoints = `0,${height} ${polyPoints} ${width},${height}`;
  const last = points[points.length - 1];

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#spark-${color.replace("#", "")})`} />
      <polyline points={polyPoints} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {showDot && last && (
        <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} stroke="#FFFFFF" strokeWidth="1.5" />
      )}
    </svg>
  );
}

// Pill colorido con punto a la izquierda (badge de proveedor)
export function SupplierBadge({ name, color = "#5E6AD2", size = "md", onClick }) {
  const compact = size === "sm";
  return (
    <span
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: compact ? "2px 8px" : "4px 10px",
        background: `${color}18`,
        border: `1px solid ${color}40`,
        borderRadius: 999,
        fontSize: compact ? 10 : 12,
        fontWeight: 700,
        color: color,
        whiteSpace: "nowrap",
        cursor: onClick ? "pointer" : "default",
        fontFamily: "inherit",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {name}
    </span>
  );
}
