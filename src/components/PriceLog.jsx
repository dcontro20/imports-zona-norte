import { useState, useMemo } from "react";
import { formatMoney, formatDate } from "../helpers.js";
import { Card, Btn, Input, Table, Badge } from "./UI.jsx";
import { BRAND_COLORS } from "../constants.js";

// -- PRICE LOG --
export const PriceLog = ({ priceLog, products, setProducts, logPrice, exchangeRate }) => {
  const getProduct = (id) => products.find(p => p.id === id);
  const [editMode, setEditMode] = useState(false);
  const [newPrices, setNewPrices] = useState({});

  // Get current prices by model
  const modelPrices = useMemo(() => {
    const map = {};
    products.forEach(p => {
      const key = `${p.brand}|||${p.model}`;
      if (!map[key]) map[key] = { key, brand: p.brand, model: p.model, puffs: p.puffs, priceUSD: p.priceUSD, count: 0, inStock: 0 };
      map[key].count++;
      if (p.stock > 0) map[key].inStock++;
    });
    return Object.values(map).sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
  }, [products]);

  const startEdit = () => {
    const prices = {};
    modelPrices.forEach(m => { prices[m.key] = m.priceUSD; });
    setNewPrices(prices);
    setEditMode(true);
  };

  const saveAll = () => {
    let changes = 0;
    setProducts(prev => prev.map(p => {
      const key = `${p.brand}|||${p.model}`;
      const newPrice = Number(newPrices[key]);
      if (newPrice && newPrice !== p.priceUSD) {
        if (changes === 0 || p.priceUSD !== newPrice) {
          logPrice(p.id, p.priceUSD, newPrice, "USD");
        }
        changes++;
        return { ...p, priceUSD: newPrice };
      }
      return p;
    }));
    setEditMode(false);
    setNewPrices({});
  };

  const cancelEdit = () => { setEditMode(false); setNewPrices({}); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>Precios</h2>
        {editMode ? (
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="success" onClick={saveAll}>✅ Guardar todo</Btn>
            <Btn variant="secondary" onClick={cancelEdit}>Cancelar</Btn>
          </div>
        ) : (
          <Btn onClick={startEdit}>✏️ Editar precios</Btn>
        )}
      </div>

      {editMode && (
        <Card style={{ marginBottom: 14, background: "#6366f111", border: "1px solid #6366f144" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>✏️</span>
            <span style={{ color: "#6366f1", fontSize: 13, fontWeight: 600 }}>
              Editando precios — Cambiá el precio USD de cada modelo y dale "Guardar todo". El precio ARS se calcula automáticamente con el blue (${exchangeRate}). Los cambios se aplican a todos los sabores del modelo.
            </span>
          </div>
        </Card>
      )}

      {/* Price editor / viewer */}
      <Card style={{ marginBottom: 14 }}>
        <h4 style={{ color: "#6366f1", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>Precios por modelo</h4>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Marca", "Modelo", "Puffs", "Precio USD", "Precio ARS", "Sabores"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, color: "#6b7280", textTransform: "uppercase", borderBottom: "1px solid #e2e4e9", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modelPrices.map(m => {
                const currentPrice = editMode ? (Number(newPrices[m.key]) || m.priceUSD) : m.priceUSD;
                const arsPrice = Math.round(currentPrice * exchangeRate);
                const changed = editMode && Number(newPrices[m.key]) !== m.priceUSD && newPrices[m.key] !== undefined;
                return (
                  <tr key={m.key} style={{ background: changed ? "#a855f711" : "transparent" }}>
                    <td style={{ padding: "10px 12px", fontSize: 13, color: "#4b5563", borderBottom: "1px solid #edf0f2" }}>
                      <Badge color={BRAND_COLORS[m.brand] || "#6366f1"}>{m.brand}</Badge>
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 13, color: "#1a1a2e", borderBottom: "1px solid #edf0f2", fontWeight: 600 }}>{m.model}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13, color: "#6b7280", borderBottom: "1px solid #edf0f2" }}>{Number(m.puffs).toLocaleString("es-AR")}</td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #edf0f2" }}>
                      {editMode ? (
                        <input type="number" value={newPrices[m.key] ?? m.priceUSD}
                          onChange={e => setNewPrices(prev => ({ ...prev, [m.key]: e.target.value }))}
                          style={{
                            width: 80, padding: "6px 10px",
                            background: changed ? "#6366f122" : "#f7f8fa",
                            border: `1px solid ${changed ? "#6366f1" : "#e2e4e9"}`,
                            borderRadius: 6, color: "#1a1a2e", fontSize: 14, fontWeight: 700, textAlign: "center"
                          }} />
                      ) : (
                        <span style={{ color: "#00b894", fontWeight: 700, fontSize: 15 }}>{formatMoney(m.priceUSD, "USD")}</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 14, color: changed ? "#6366f1" : "#4b5563", borderBottom: "1px solid #edf0f2", fontWeight: 600 }}>
                      {formatMoney(arsPrice)}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 13, color: "#6b7280", borderBottom: "1px solid #edf0f2" }}>
                      {m.inStock}/{m.count}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Price change history */}
      <Card>
        <h4 style={{ color: "#fdcb6e", margin: "0 0 14px", fontSize: 14, textTransform: "uppercase" }}>Historial de cambios</h4>
        {(!priceLog || priceLog.length === 0) ? (
          <div style={{ textAlign: "center", padding: 20 }}>
            <span style={{ color: "#9ca3af", fontSize: 13 }}>Todavía no hay cambios de precio registrados. Cuando edites precios, va a aparecer acá.</span>
          </div>
        ) : (
          <Table columns={[
            { key: "date", label: "Fecha", render: r => formatDate(r.date) },
            { key: "product", label: "Producto", render: r => {
              const p = getProduct(r.productId);
              return p ? `${p.brand} ${p.model}` : "?";
            }},
            { key: "change", label: "Cambio", render: r => (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#e74c3c", fontSize: 13 }}>{formatMoney(r.oldPrice, "USD")}</span>
                <span style={{ color: "#6666aa" }}>→</span>
                <span style={{ color: "#00b894", fontSize: 13, fontWeight: 700 }}>{formatMoney(r.newPrice, "USD")}</span>
                {r.newPrice > r.oldPrice 
                  ? <Badge color="#e74c3c">+{formatMoney(r.newPrice - r.oldPrice, "USD")}</Badge>
                  : <Badge color="#00b894">{formatMoney(r.newPrice - r.oldPrice, "USD")}</Badge>
                }
              </div>
            )},
          ]} data={priceLog} emptyMsg="Sin cambios" />
        )}
      </Card>
    </div>
  );
};
