import { useState } from "react";

export const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px",
      backdropFilter: "blur(4px)"
    }} onClick={onClose}>
      <div style={{
        background: "#1a1a2e", borderRadius: 16, padding: "24px", maxWidth: 520,
        width: "100%", maxHeight: "85vh", overflowY: "auto", border: "1px solid #2a2a4a",
        boxShadow: "0 24px 48px rgba(0,0,0,0.4)"
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: "#e0e0ff", fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const Card = ({ children, style }) => (
  <div style={{
    background: "#1a1a2e", borderRadius: 14, padding: "20px", border: "1px solid #2a2a4a",
    ...style
  }}>{children}</div>
);

export const Btn = ({ children, variant = "primary", ...props }) => {
  const styles = {
    primary: { background: "linear-gradient(135deg, #6c5ce7, #a855f7)", color: "#fff" },
    secondary: { background: "#2a2a4a", color: "#c0c0e0" },
    danger: { background: "#e74c3c33", color: "#e74c3c", border: "1px solid #e74c3c55" },
    success: { background: "#00b89433", color: "#00b894", border: "1px solid #00b89455" },
  };
  return (
    <button {...props} style={{
      padding: "10px 20px", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600,
      cursor: "pointer", transition: "all 0.2s", ...styles[variant], ...props.style
    }}>{children}</button>
  );
};

export const Input = ({ label, ...props }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ display: "block", fontSize: 12, color: "#8888aa", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>}
    <input {...props} style={{
      width: "100%", padding: "10px 12px", background: "#12122a", border: "1px solid #2a2a4a",
      borderRadius: 8, color: "#e0e0ff", fontSize: 14, outline: "none", boxSizing: "border-box",
      ...props.style
    }} />
  </div>
);

export const Select = ({ label, options, ...props }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ display: "block", fontSize: 12, color: "#8888aa", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>}
    <select {...props} style={{
      width: "100%", padding: "10px 12px", background: "#12122a", border: "1px solid #2a2a4a",
      borderRadius: 8, color: "#e0e0ff", fontSize: 14, outline: "none", boxSizing: "border-box"
    }}>
      <option value="">Seleccionar...</option>
      {options.map(o => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>
        {typeof o === "string" ? o : o.label}
      </option>)}
    </select>
  </div>
);

export const Table = ({ columns, data, onRowClick, emptyMsg = "Sin datos" }) => (
  <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {columns.map(c => (
            <th key={c.key} style={{
              textAlign: "left", padding: "10px 12px", fontSize: 11, color: "#6666aa",
              textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #2a2a4a",
              fontWeight: 700
            }}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr><td colSpan={columns.length} style={{ padding: 32, textAlign: "center", color: "#555" }}>{emptyMsg}</td></tr>
        ) : data.map((row, i) => (
          <tr key={row.id || i} onClick={() => onRowClick?.(row)} style={{
            cursor: onRowClick ? "pointer" : "default", transition: "background 0.15s"
          }} onMouseEnter={e => e.currentTarget.style.background = "#1f1f3a"}
             onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            {columns.map(c => (
              <td key={c.key} style={{ padding: "10px 12px", fontSize: 13, color: "#c0c0e0", borderBottom: "1px solid #1a1a30" }}>
                {c.render ? c.render(row) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const StatCard = ({ label, value, sub, color = "#a855f7", icon }) => (
  <Card style={{ flex: 1, minWidth: 150 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div style={{ fontSize: 12, color: "#8888aa", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: "#6666aa", marginTop: 6 }}>{sub}</div>}
      </div>
      {icon && <div style={{ fontSize: 28, opacity: 0.5 }}>{icon}</div>}
    </div>
  </Card>
);

export const Badge = ({ children, color = "#a855f7" }) => (
  <span style={{
    background: `${color}22`, color, padding: "3px 10px", borderRadius: 20,
    fontSize: 11, fontWeight: 700, textTransform: "uppercase"
  }}>{children}</span>
);

export const SearchBar = ({ value, onChange, placeholder = "Buscar..." }) => (
  <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
    padding: "10px 16px", background: "#12122a", border: "1px solid #2a2a4a", borderRadius: 10,
    color: "#e0e0ff", fontSize: 14, outline: "none", width: "100%", maxWidth: 300, boxSizing: "border-box"
  }} />
);

