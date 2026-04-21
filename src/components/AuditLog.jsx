import { useState, useMemo } from "react";
import { formatDate } from "../helpers.js";

const ACTION_LABELS = {
  create: { label: "Creó", color: "#22C55E", bg: "#22C55E18" },
  update: { label: "Editó", color: "#F59E0B", bg: "#F59E0B18" },
  delete: { label: "Eliminó", color: "#EF4444", bg: "#EF444418" },
  restore: { label: "Restauró", color: "#6366f1", bg: "#6366f120" },
};

const ENTITY_LABELS = {
  product: "Producto",
  sale: "Venta",
  purchase: "Compra",
  expense: "Gasto",
  cashMovement: "Mov. Caja",
  withdrawal: "Merma",
  partnerWithdrawal: "Retiro Socio",
  closure: "Cierre",
};

export function AuditLog({ auditLog = [], products = [] }) {
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterEntity, setFilterEntity] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const filtered = useMemo(() => {
    return auditLog.filter(entry => {
      if (filterAction && entry.action !== filterAction) return false;
      if (filterEntity && entry.entityType !== filterEntity) return false;
      if (filterUser && entry.user !== filterUser) return false;
      if (filterDateFrom && entry.timestamp < filterDateFrom) return false;
      if (filterDateTo && entry.timestamp < filterDateTo + "T23:59:59") return false;
      if (search) {
        const q = search.toLowerCase();
        return (entry.description || "").toLowerCase().includes(q) ||
               (entry.user || "").toLowerCase().includes(q) ||
               (entry.entityType || "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [auditLog, search, filterAction, filterEntity, filterUser, filterDateFrom, filterDateTo]);

  const users = useMemo(() => [...new Set(auditLog.map(e => e.user))], [auditLog]);

  const inputStyle = {
    padding: "7px 12px", background: "#0F172A", border: "1px solid #334155",
    borderRadius: 8, color: "#F8FAFC", fontSize: 13, outline: "none"
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#F8FAFC", margin: 0 }}>Registro de Auditoría</h2>
          <p style={{ color: "#64748B", fontSize: 13, margin: "4px 0 0" }}>{filtered.length} registros</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." style={{ ...inputStyle, width: 180 }} />
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={inputStyle}>
          <option value="">Todas las acciones</option>
          <option value="create">Creaciones</option>
          <option value="update">Ediciones</option>
          <option value="delete">Eliminaciones</option>
          <option value="restore">Restauraciones</option>
        </select>
        <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} style={inputStyle}>
          <option value="">Todos los tipos</option>
          {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterUser} onChange={e => setFilterUser(e.target.value)} style={inputStyle}>
          <option value="">Todos los usuarios</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={inputStyle} />
        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={inputStyle} />
      </div>

      {/* Log entries */}
      <div style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 12, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#64748B", fontSize: 14 }}>
            No hay registros de auditoría
          </div>
        ) : (
          filtered.slice(0, 200).map((entry, i) => {
            const actionInfo = ACTION_LABELS[entry.action] || { label: entry.action, color: "#94A3B8", bg: "#0F172A" };
            const entityLabel = ENTITY_LABELS[entry.entityType] || entry.entityType;
            const date = new Date(entry.timestamp);
            const timeStr = date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

            return (
              <div key={entry.id || i} style={{
                display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px",
                borderBottom: i < filtered.length - 1 ? "1px solid #334155" : "none",
              }}>
                {/* Action badge */}
                <div style={{
                  padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: actionInfo.bg, color: actionInfo.color, whiteSpace: "nowrap", marginTop: 2
                }}>
                  {actionInfo.label}
                </div>

                {/* Content */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#F8FAFC", fontWeight: 500 }}>
                    <span style={{ fontWeight: 700 }}>{entry.user}</span>
                    {" "}{actionInfo.label.toLowerCase()}{" "}
                    <span style={{ color: "#6366f1", fontWeight: 600 }}>{entityLabel}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{entry.description}</div>
                  {entry.details && entry.details.changes && (
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 4, fontFamily: "monospace" }}>
                      {Object.entries(entry.details.changes).map(([field, vals]) => (
                        <div key={field}>
                          {field}: <span style={{ color: "#EF4444", textDecoration: "line-through" }}>{vals.old}</span> → <span style={{ color: "#22C55E" }}>{vals.new}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <div style={{ fontSize: 11, color: "#64748B", whiteSpace: "nowrap", textAlign: "right" }}>
                  <div>{formatDate(entry.timestamp)}</div>
                  <div>{timeStr}</div>
                </div>
              </div>
            );
          })
        )}
        {filtered.length > 200 && (
          <div style={{ padding: 12, textAlign: "center", color: "#64748B", fontSize: 12, borderTop: "1px solid #334155" }}>
            Mostrando 200 de {filtered.length} registros
          </div>
        )}
      </div>
    </div>
  );
}
