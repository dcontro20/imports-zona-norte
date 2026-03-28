import { useState } from "react";

export const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px",
      backdropFilter: "blur(4px)"
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "24px", maxWidth: 520,
        width: "100%", maxHeight: "85vh", overflowY: "auto", border: "1px solid #e2e4e9",
        boxShadow: "0 24px 48px rgba(0,0,0,0.12)"
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: "#1a1a2e", fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 22, cursor: "pointer" }}>â</button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const Card = ({ children, style }) => (
  <div style={{
    background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid #e2e4e9",
    ...style
  }}>{children}</div>
);

export const Btn = ({ children, variant = "primary", ...props }) => {
  const styles = {
    primary: { background: "#6366f1", color: "#fff" },
    secondary: { background: "#f0f1f5", color: "#4b5563" },
    danger: { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" },
    success: { background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" },
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
    {label && <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>}
    <input {...props} style={{
      width: "100%", padding: "10px 12px", background: "#f7f8fa", border: "1px solid #e2e4e9",
      borderRadius: 8, color: "#1a1a2e", fontSize: 14, outline: "none", boxSizing: "border-box",
      ...props.style
    }} />
  </div>
);

export const Select = ({ label, options, ...props }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>}
    <select {...props} style={{
      width: "100%", padding: "10px 12px", background: "#f7f8fa", border: "1px solid #e2e4e9",
      borderRadius: 8, color: "#1a1a2e", fontSize: 14, outline: "none", boxSizing: "border-box"
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
              textAlign: "left", padding: "10px 12px", fontSize: 11, color: "#6b7280",
              textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #e2e4e9",
              fontWeight: 700
            }}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr><td colSpan={columns.length} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>{emptyMsg}</td></tr>
        ) : data.map((row, i) => (
          <tr key={row.id || i} onClick={() => onRowClick?.(row)} style={{
            cursor: onRowClick ? "pointer" : "default", transition: "background 0.15s"
          }} onMouseEnter={e => e.currentTarget.style.background = "#f7f8fa"}
             onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            {columns.map(c => (
              <td key={c.key} style={{ padding: "10px 12px", fontSize: 13, color: "#4b5563", borderBottom: "1px solid #edf0f2" }}>
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
        <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{sub}</div>}
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
    padding: "10px 16px", background: "#f7f8fa", border: "1px solid #e2e4e9", borderRadius: 10,
    color: "#1a1a2e", fontSize: 14, outline: "none", width: "100%", maxWidth: 300, boxSizing: "border-box"
  }} />
);

