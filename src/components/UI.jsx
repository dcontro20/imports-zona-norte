import { useState, useEffect } from "react";
import { useResponsive } from "../App.jsx";

// Mobile-first: altura mínima 44px en todo lo tocable (Apple HIG).
// padding: 12px vertical + 14px horizontal + fontSize: 14 ≈ 44px.

export const Modal = ({ open, onClose, title, children }) => {
  const { isMobile } = useResponsive();

  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex",
      alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
      zIndex: 1000, padding: isMobile ? 0 : "16px",
    }} onClick={onClose}>
      <div style={{
        background: "#FFFFFF",
        borderRadius: isMobile ? "16px 16px 0 0" : 16,
        padding: isMobile ? "16px" : "24px",
        maxWidth: isMobile ? "100%" : 520,
        width: "100%",
        maxHeight: isMobile ? "92vh" : "85vh",
        overflowY: "auto",
        border: isMobile ? "none" : "1px solid #E8E7E3",
        boxShadow: "0 24px 48px rgba(15,15,15,0.14)",
        boxSizing: "border-box",
        ...(isMobile ? { paddingBottom: "max(24px, env(safe-area-inset-bottom))" } : {}),
      }} onClick={e => e.stopPropagation()}>
        {/* Mobile drag handle */}
        {isMobile && (
          <div style={{
            width: 40, height: 4, borderRadius: 2, background: "#E8E7E3",
            margin: "0 auto 14px", flexShrink: 0,
          }} />
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 10 }}>
          <h3 style={{
            margin: 0, color: "#37352F",
            fontSize: isMobile ? 17 : 18, fontWeight: 700,
            flex: 1, minWidth: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{title}</h3>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: "transparent", border: "none", color: "#8C8A82",
            fontSize: 22, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const Card = ({ children, style }) => {
  const { isMobile } = useResponsive();
  return (
    <div style={{
      background: "#FFFFFF",
      borderRadius: isMobile ? 12 : 14,
      padding: isMobile ? "14px" : "20px",
      border: "1px solid #E8E7E3",
      boxSizing: "border-box",
      ...style,
    }}>{children}</div>
  );
};

export const Btn = ({ children, variant = "primary", ...props }) => {
  const { isMobile } = useResponsive();

  const styles = {
    primary: { background: "#5E6AD2", color: "#fff" },
    secondary: { background: "#F5F4F0", color: "#555247", border: "1px solid #E8E7E3" },
    danger: { background: "#FBE4E4", color: "#E03E3E", border: "1px solid #F1B8B6" },
    success: { background: "#DDEDEA", color: "#0F7B6C", border: "1px solid #B6D4CC" },
  };
  return (
    <button {...props} style={{
      padding: isMobile ? "11px 16px" : "10px 20px",
      minHeight: isMobile ? 44 : 40,
      border: "none", borderRadius: 10,
      fontSize: isMobile ? 14 : 14, fontWeight: 600,
      cursor: "pointer", transition: "all 0.15s",
      fontFamily: "inherit", boxSizing: "border-box",
      ...styles[variant], ...props.style,
    }}>{children}</button>
  );
};

export const Input = ({ label, ...props }) => {
  const { isMobile } = useResponsive();
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <label style={{
          display: "block", fontSize: 11, color: "#8C8A82", marginBottom: 6,
          fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
        }}>{label}</label>
      )}
      <input {...props} style={{
        width: "100%",
        padding: isMobile ? "12px 14px" : "10px 12px",
        minHeight: isMobile ? 44 : 38,
        background: "#FAFAF9", border: "1px solid #E8E7E3",
        borderRadius: 10, color: "#37352F",
        fontSize: isMobile ? 16 : 14,  // 16 en mobile previene zoom de iOS
        outline: "none", boxSizing: "border-box",
        fontFamily: "inherit",
        ...props.style,
      }} />
    </div>
  );
};

export const Select = ({ label, options, ...props }) => {
  const { isMobile } = useResponsive();
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <label style={{
          display: "block", fontSize: 11, color: "#8C8A82", marginBottom: 6,
          fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
        }}>{label}</label>
      )}
      <select {...props} style={{
        width: "100%",
        padding: isMobile ? "12px 14px" : "10px 12px",
        minHeight: isMobile ? 44 : 38,
        background: "#FAFAF9", border: "1px solid #E8E7E3",
        borderRadius: 10, color: "#37352F",
        fontSize: isMobile ? 16 : 14,
        outline: "none", boxSizing: "border-box",
        fontFamily: "inherit",
        ...props.style,
      }}>
        <option value="">Seleccionar...</option>
        {options.map(o => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>
          {typeof o === "string" ? o : o.label}
        </option>)}
      </select>
    </div>
  );
};

export const Table = ({ columns, data, onRowClick, emptyMsg = "Sin datos", mobileColumns }) => {
  const { isMobile } = useResponsive();
  const displayColumns = mobileColumns ? columns.filter(c => mobileColumns.includes(c.key)) : columns;

  // Mobile: Card-based layout
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "#B1AFA7", fontSize: 14 }}>{emptyMsg}</div>
        ) : (
          data.map((row, i) => (
            <div
              key={row.id || i}
              onClick={() => onRowClick?.(row)}
              style={{
                background: "#FFFFFF", borderRadius: 10, padding: "14px",
                border: "1px solid #E8E7E3",
                cursor: onRowClick ? "pointer" : "default",
                transition: "background 0.15s",
                WebkitTapHighlightColor: "rgba(94,106,210,0.1)",
                boxSizing: "border-box",
              }}
            >
              {displayColumns.map(c => (
                <div key={c.key} style={{
                  marginBottom: 8, display: "flex",
                  justifyContent: "space-between", alignItems: "flex-start", gap: 10,
                }}>
                  <div style={{
                    fontSize: 11, color: "#8C8A82",
                    textTransform: "uppercase", letterSpacing: 0.4,
                    fontWeight: 700, flexShrink: 0,
                  }}>{c.label}</div>
                  <div style={{
                    fontSize: 13, color: "#37352F", textAlign: "right",
                    flex: 1, minWidth: 0,
                    wordBreak: "break-word",
                  }}>{c.render ? c.render(row) : row[c.key]}</div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    );
  }

  // Desktop: table
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} style={{
                textAlign: "left", padding: "10px 12px", fontSize: 11, color: "#8C8A82",
                textTransform: "uppercase", letterSpacing: 0.5,
                borderBottom: "1px solid #E8E7E3", fontWeight: 700,
                whiteSpace: "nowrap",
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ padding: 32, textAlign: "center", color: "#B1AFA7" }}>{emptyMsg}</td></tr>
          ) : data.map((row, i) => (
            <tr key={row.id || i} onClick={() => onRowClick?.(row)} style={{
              cursor: onRowClick ? "pointer" : "default", transition: "background 0.15s",
            }} onMouseEnter={e => e.currentTarget.style.background = "#FAFAF9"}
               onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {columns.map(c => (
                <td key={c.key} style={{
                  padding: "10px 12px", fontSize: 13, color: "#37352F",
                  borderBottom: "1px solid #F0EFEB",
                }}>{c.render ? c.render(row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const StatCard = ({ label, value, sub, color = "#5E6AD2", icon }) => {
  const { isMobile } = useResponsive();
  return (
    <Card style={{ flex: 1, minWidth: isMobile ? 100 : 150, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: isMobile ? 10 : 12, color: "#8C8A82",
            textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
            fontWeight: 600,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{label}</div>
          <div style={{
            fontSize: isMobile ? 20 : 26, fontWeight: 800, color, lineHeight: 1,
            letterSpacing: "-0.02em",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{value}</div>
          {sub && (
            <div style={{
              fontSize: isMobile ? 11 : 12, color: "#8C8A82", marginTop: 6,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{sub}</div>
          )}
        </div>
        {icon && <div style={{ fontSize: isMobile ? 22 : 28, opacity: 0.5, flexShrink: 0 }}>{icon}</div>}
      </div>
    </Card>
  );
};

export const Badge = ({ children, color = "#5E6AD2" }) => (
  <span style={{
    background: `${color}22`, color, padding: "3px 10px", borderRadius: 20,
    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    whiteSpace: "nowrap", display: "inline-block",
  }}>{children}</span>
);

export const SearchBar = ({ value, onChange, placeholder = "Buscar...", debounceMs = 200 }) => {
  const { isMobile } = useResponsive();
  const [local, setLocal] = useState(value || "");

  // Mantener el input local en sincronía si el padre pisa value externamente
  useEffect(() => { setLocal(value || ""); }, [value]);

  // Propagar con debounce para evitar filtrar en cada keystroke con listas grandes
  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), debounceMs);
    return () => clearTimeout(t);
  }, [local, debounceMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input value={local} onChange={e => setLocal(e.target.value)} placeholder={placeholder} style={{
      padding: isMobile ? "12px 16px" : "10px 16px",
      minHeight: isMobile ? 44 : 40,
      background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10,
      color: "#37352F", fontSize: isMobile ? 16 : 14,
      outline: "none", width: "100%",
      maxWidth: isMobile ? "100%" : 300,
      boxSizing: "border-box", fontFamily: "inherit",
    }} />
  );
};

// FormRow helper — apila 2 inputs en mobile, los pone lado a lado en desktop
export const FormRow = ({ children, style }) => {
  const { isMobile } = useResponsive();
  return (
    <div style={{
      display: "flex", gap: 10,
      flexDirection: isMobile ? "column" : "row",
      ...style,
    }}>{children}</div>
  );
};
