import { useState, useMemo } from "react";
import { useResponsive } from "../App.jsx";
import { formatMoney, formatDate } from "../helpers.js";
import { Card, Btn, Badge, Modal } from "./UI.jsx";
import { BRAND_COLORS } from "../constants.js";

// -- PRICE MANAGEMENT --
export const PriceLog = ({ priceLog, products, setProducts, logPrice, exchangeRate }) => {
  const { isMobile } = useResponsive();
  const [editMode, setEditMode] = useState(false);
  const [newPrices, setNewPrices] = useState({});
  const [newCosts, setNewCosts] = useState({});
  const [brandFilter, setBrandFilter] = useState("all");
  const [collapsed, setCollapsed] = useState({});
  const [bulkModal, setBulkModal] = useState(null); // null or brand name or "all"
  const [bulkPercent, setBulkPercent] = useState("");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [costMode, setCostMode] = useState(false);

  // Get unique brands
  const brands = useMemo(() => {
    const set = new Set();
    products.forEach(p => set.add(p.brand));
    return [...set].sort();
  }, [products]);

  // Get current prices by model, grouped by brand
  const modelsByBrand = useMemo(() => {
    const map = {};
    products.forEach(p => {
      const key = `${p.brand}|||${p.model}`;
      if (!map[key]) map[key] = {
        key, brand: p.brand, model: p.model, puffs: p.puffs,
        priceUSD: p.priceUSD, costUSDT: p.costUSDT || 0,
        count: 0, inStock: 0, totalStock: 0
      };
      map[key].count++;
      if (p.stock > 0) { map[key].inStock++; map[key].totalStock += p.stock; }
    });
    const models = Object.values(map).sort((a, b) => a.model.localeCompare(b.model));
    const grouped = {};
    models.forEach(m => {
      if (!grouped[m.brand]) grouped[m.brand] = [];
      grouped[m.brand].push(m);
    });
    return grouped;
  }, [products]);

  // Summary stats
  const stats = useMemo(() => {
    const allModels = Object.values(modelsByBrand).flat();
    const totalModels = allModels.length;
    const avgPrice = totalModels > 0 ? (allModels.reduce((s, m) => s + m.priceUSD, 0) / totalModels).toFixed(1) : 0;
    const totalStock = allModels.reduce((s, m) => s + m.totalStock, 0);
    const stockValue = allModels.reduce((s, m) => s + (m.totalStock * m.priceUSD), 0);
    const withCost = allModels.filter(m => m.costUSDT > 0);
    const avgMargin = withCost.length > 0
      ? (withCost.reduce((s, m) => s + ((m.priceUSD - m.costUSDT) / m.priceUSD * 100), 0) / withCost.length).toFixed(1)
      : null;
    return { totalModels, avgPrice, totalStock, stockValue, avgMargin };
  }, [modelsByBrand]);

  // Edit handlers
  const startEdit = () => {
    const prices = {}, costs = {};
    Object.values(modelsByBrand).flat().forEach(m => {
      prices[m.key] = m.priceUSD;
      costs[m.key] = m.costUSDT || "";
    });
    setNewPrices(prices);
    setNewCosts(costs);
    setEditMode(true);
    setCostMode(false);
  };

  const saveAll = () => {
    const changedModels = new Set();
    setProducts(prev => prev.map(p => {
      const key = `${p.brand}|||${p.model}`;
      const np = Number(newPrices[key]);
      const nc = Number(newCosts[key]) || 0;
      let changed = false;
      const updates = {};
      if (np && np !== p.priceUSD) {
        if (!changedModels.has(key + "_price")) {
          logPrice(p.id, p.priceUSD, np, "USD");
          changedModels.add(key + "_price");
        }
        updates.priceUSD = np;
        changed = true;
      }
      if (nc !== (p.costUSDT || 0)) {
        updates.costUSDT = nc;
        changed = true;
      }
      return changed ? { ...p, ...updates } : p;
    }));
    setEditMode(false);
    setNewPrices({});
    setNewCosts({});
  };

  const cancelEdit = () => { setEditMode(false); setNewPrices({}); setNewCosts({}); };

  // Quick price adjust +/- for a model
  const adjustPrice = (key, delta) => {
    setNewPrices(prev => {
      const current = Number(prev[key]) || 0;
      const next = Math.max(1, current + delta);
      return { ...prev, [key]: next };
    });
  };

  // Bulk adjust
  const applyBulk = () => {
    const pct = Number(bulkPercent);
    if (!pct || isNaN(pct)) return;
    setNewPrices(prev => {
      const next = { ...prev };
      Object.values(modelsByBrand).flat().forEach(m => {
        if (bulkModal === "all" || m.brand === bulkModal) {
          const current = Number(next[m.key]) || m.priceUSD;
          next[m.key] = Math.max(1, Math.round(current * (1 + pct / 100)));
        }
      });
      return next;
    });
    setBulkModal(null);
    setBulkPercent("");
  };

  // Margin calculation
  const getMargin = (priceUSD, costUSDT) => {
    if (!costUSDT || costUSDT <= 0) return null;
    const margin = priceUSD - costUSDT;
    const pct = (margin / priceUSD * 100).toFixed(1);
    return { margin, pct };
  };

  // Filtered brands
  const displayBrands = brandFilter === "all" ? brands : [brandFilter];

  const getProduct = (id) => products.find(p => p.id === id);

  // Count changes
  const changesCount = editMode ? Object.entries(newPrices).filter(([key, val]) => {
    const m = Object.values(modelsByBrand).flat().find(x => x.key === key);
    return m && Number(val) !== m.priceUSD;
  }).length + Object.entries(newCosts).filter(([key, val]) => {
    const m = Object.values(modelsByBrand).flat().find(x => x.key === key);
    return m && Number(val || 0) !== (m.costUSDT || 0);
  }).length : 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: isMobile ? 20 : 22, fontWeight: 800 }}>Precios</h2>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
            Blue: <strong style={{ color: "#6366f1" }}>${exchangeRate.toLocaleString("es-AR")}</strong>
          </div>
        </div>
        {editMode ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {changesCount > 0 && (
              <Badge color="#f59e0b">{changesCount} cambio{changesCount > 1 ? "s" : ""}</Badge>
            )}
            <Btn variant="success" onClick={saveAll} style={{ fontSize: 13, padding: "8px 16px" }}>
              Guardar todo
            </Btn>
            <Btn variant="secondary" onClick={cancelEdit} style={{ fontSize: 13, padding: "8px 16px" }}>
              Cancelar
            </Btn>
          </div>
        ) : (
          <Btn onClick={startEdit} style={{ fontSize: 13, padding: "8px 16px" }}>
            Editar precios
          </Btn>
        )}
      </div>

      {/* Summary stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "Modelos", value: stats.totalModels, color: "#6366f1" },
          { label: "Precio prom.", value: `US$${stats.avgPrice}`, color: "#00b894" },
          { label: "Stock total", value: `${stats.totalStock} uds`, color: "#f59e0b" },
          { label: "Valor stock", value: formatMoney(stats.stockValue, "USD"), color: "#10b981" },
          ...(stats.avgMargin ? [{ label: "Margen prom.", value: `${stats.avgMargin}%`, color: "#a855f7" }] : []),
        ].map(s => (
          <div key={s.label} style={{
            flex: isMobile ? "1 1 calc(50% - 6px)" : "1 1 0",
            minWidth: isMobile ? 120 : 100, background: "#fff", borderRadius: 10, padding: "12px 14px",
            border: "1px solid #e2e4e9"
          }}>
            <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Edit mode toolbar */}
      {editMode && (
        <Card style={{ marginBottom: 14, background: "#f0f1ff", border: "1px solid #6366f133" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#6366f1", fontWeight: 600, flex: 1, minWidth: 200 }}>
              Editando precios — Usa +/- o escribi directo. ARS se calcula con blue (${exchangeRate}).
            </span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Btn onClick={() => setCostMode(!costMode)} variant={costMode ? "primary" : "secondary"}
                style={{ fontSize: 11, padding: "5px 10px" }}>
                {costMode ? "Ocultar costos" : "Editar costos"}
              </Btn>
              <Btn onClick={() => { setBulkModal("all"); setBulkPercent(""); }} variant="secondary"
                style={{ fontSize: 11, padding: "5px 10px" }}>
                % Ajuste masivo
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {/* Brand filter chips */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={() => setBrandFilter("all")} style={{
          padding: "6px 14px", borderRadius: 20, border: brandFilter === "all" ? "2px solid #6366f1" : "1px solid #e2e4e9",
          background: brandFilter === "all" ? "#6366f1" : "#fff",
          color: brandFilter === "all" ? "#fff" : "#6b7280",
          fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s"
        }}>
          Todas ({Object.values(modelsByBrand).flat().length})
        </button>
        {brands.map(b => {
          const c = BRAND_COLORS[b] || "#6366f1";
          const active = brandFilter === b;
          const count = (modelsByBrand[b] || []).length;
          return (
            <button key={b} onClick={() => setBrandFilter(active ? "all" : b)} style={{
              padding: "6px 14px", borderRadius: 20,
              border: active ? `2px solid ${c}` : "1px solid #e2e4e9",
              background: active ? c : "#fff", color: active ? "#fff" : c,
              fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s"
            }}>
              {b} ({count})
            </button>
          );
        })}
      </div>

      {/* Brand cards */}
      {displayBrands.map(brand => {
        const models = modelsByBrand[brand] || [];
        if (models.length === 0) return null;
        const brandColor = BRAND_COLORS[brand] || "#6366f1";
        const isCollapsed = collapsed[brand];
        const brandStock = models.reduce((s, m) => s + m.totalStock, 0);

        return (
          <Card key={brand} style={{ marginBottom: 12, overflow: "hidden", padding: 0 }}>
            {/* Brand header */}
            <div onClick={() => setCollapsed(prev => ({ ...prev, [brand]: !prev[brand] }))}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: isMobile ? "12px 14px" : "14px 20px", cursor: "pointer",
                background: `${brandColor}08`, borderBottom: isCollapsed ? "none" : `1px solid ${brandColor}22`,
                transition: "all 0.2s"
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 6, height: 28, borderRadius: 3, background: brandColor
                }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1a1a2e" }}>{brand}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>
                    {models.length} modelo{models.length > 1 ? "s" : ""} · {brandStock} uds en stock
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {editMode && (
                  <button onClick={e => { e.stopPropagation(); setBulkModal(brand); setBulkPercent(""); }}
                    style={{
                      padding: "4px 10px", borderRadius: 6, border: `1px solid ${brandColor}44`,
                      background: `${brandColor}11`, color: brandColor, fontSize: 11, fontWeight: 700,
                      cursor: "pointer"
                    }}>
                    % {brand}
                  </button>
                )}
                <span style={{ color: "#9ca3af", fontSize: 16, transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)" }}>
                  ▼
                </span>
              </div>
            </div>

            {/* Models list */}
            {!isCollapsed && (
              <div style={{ padding: isMobile ? "0" : "0" }}>
                {/* Desktop: Table view */}
                {!isMobile ? (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        {[
                          "Modelo", "Puffs",
                          ...(editMode ? ["Precio USD", ""] : ["Precio USD"]),
                          "Precio ARS",
                          ...((editMode && costMode) || (!editMode && models.some(m => m.costUSDT > 0)) ? ["Costo USDT"] : []),
                          ...(models.some(m => m.costUSDT > 0) ? ["Margen"] : []),
                          "Stock"
                        ].map(h => (
                          <th key={h} style={{
                            textAlign: h === "Stock" ? "center" : "left", padding: "8px 16px",
                            fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5,
                            fontWeight: 700, borderBottom: "1px solid #f0f1f5"
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {models.map(m => {
                        const currentPrice = editMode ? (Number(newPrices[m.key]) || m.priceUSD) : m.priceUSD;
                        const currentCost = editMode ? (Number(newCosts[m.key]) || 0) : (m.costUSDT || 0);
                        const arsPrice = Math.round(currentPrice * exchangeRate);
                        const priceChanged = editMode && Number(newPrices[m.key]) !== m.priceUSD && newPrices[m.key] !== undefined;
                        const costChanged = editMode && Number(newCosts[m.key] || 0) !== (m.costUSDT || 0);
                        const margin = getMargin(currentPrice, currentCost);
                        const showCostCol = (editMode && costMode) || (!editMode && models.some(x => x.costUSDT > 0));
                        const showMarginCol = models.some(x => x.costUSDT > 0);

                        return (
                          <tr key={m.key} style={{
                            background: priceChanged || costChanged ? "#f5f3ff" : "transparent",
                            transition: "background 0.2s"
                          }}>
                            <td style={{ padding: "10px 16px", fontSize: 14, color: "#1a1a2e", fontWeight: 700, borderBottom: "1px solid #f0f1f5" }}>
                              {m.model}
                            </td>
                            <td style={{ padding: "10px 16px", fontSize: 12, color: "#9ca3af", borderBottom: "1px solid #f0f1f5" }}>
                              {Number(m.puffs).toLocaleString("es-AR")}
                            </td>
                            {editMode ? (
                              <>
                                <td style={{ padding: "8px 16px", borderBottom: "1px solid #f0f1f5" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <button onClick={() => adjustPrice(m.key, -1)} style={{
                                      width: 28, height: 28, borderRadius: 6, border: "1px solid #e2e4e9",
                                      background: "#f7f8fa", color: "#6b7280", fontSize: 16, cursor: "pointer",
                                      display: "flex", alignItems: "center", justifyContent: "center"
                                    }}>−</button>
                                    <input type="number" value={newPrices[m.key] ?? m.priceUSD}
                                      onChange={e => setNewPrices(prev => ({ ...prev, [m.key]: e.target.value }))}
                                      style={{
                                        width: 60, padding: "5px 4px", textAlign: "center",
                                        background: priceChanged ? "#6366f115" : "#f7f8fa",
                                        border: `1px solid ${priceChanged? "#6366f1" : "#e2e4e9"}`,
                                        borderRadius: 6, color: "#1a1a2e", fontSize: 15, fontWeight: 800
                                      }} />
                                    <button onClick={() => adjustPrice(m.key, 1)} style={{
                                      width: 28, height: 28, borderRadius: 6, border: "1px solid #e2e4e9",
                                      background: "#f7f8fa", color: "#6b7280", fontSize: 16, cursor: "pointer",
                                      display: "flex", alignItems: "center", justifyContent: "center"
                                    }}>+</button>
                                  </div>
                                </td>
                                <td style={{ padding: "8px 4px", borderBottom: "1px solid #f0f1f5", fontSize: 11, color: "#9ca3af" }}>
                                  {priceChanged && (
                                    <span style={{ color: Number(newPrices[m.key]) > m.priceUSD ? "#e74c3c" : "#00b894", fontWeight: 700 }}>
                                      {Number(newPrices[m.key]) > m.priceUSD ? "+" : ""}{Number(newPrices[m.key]) - m.priceUSD}
                                    </span>
                                  )}
                                </td>
                              </>
                            ) : (
                              <td style={{ padding: "10px 16px", borderBottom: "1px solid #f0f1f5" }}>
                                <span style={{ color: "#00b894", fontWeight: 800, fontSize: 16 }}>US${m.priceUSD}</span>
                              </td>
                            )}
                            <td style={{ padding: "10px 16px", fontSize: 14, color: "#4b5563", borderBottom: "1px solid #f0f1f5", fontWeight: 600 }}>
                              ${arsPrice.toLocaleString("es-AR")}
                            </td>
                            {showCostCol && (
                              <td style={{ padding: "8px 16px", borderBottom: "1px solid #f0f1f5" }}>
                                          {editMode && costMode ? (
                                  <input type="number" step="0.5" value={newCosts[m.key] ?? (m.costUSDT || "")}
                                    placeholder="0.00"
                                    onChange={e => setNewCosts(prev => ({ ...prev, [m.key]: e.target.value }))}
                                    style={{
                                      width: 70, padding: "5px 6px", textAlign: "center",
                                      background: costChanged ? "#a855f715" : "#f7f8fa",
                                      border: `1px solid ${costChanged ? "#a855f7" : "#e2e4e9"}`,
                                      borderRadius: 6, color: "#1a1a2e", fontSize: 13, fontWeight: 600
                                    }} />
                                ) : (
                                  <span style={{ fontSize: 13, color: currentCost > 0 ? "#6b7280" : "#d1d5db", fontWeight: 600 }}>
                                    {currentCost > 0 ? `₮${currentCost.toFixed(1)}` : "—"}
                                  </span>
                                )}
                              </td>
                            )}
                            {showMarginCol && (
                              <td style={{ padding: "10px 16px", borderBottom: "1px solid #f0f1f5" }}>
                                {margin ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{
                                      padding: "2px 8px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                                      background: Number(margin.pct) > 40 ? "#ecfdf5" : Number(margin.pct) > 20 ? "#fffbeb" : "#fef2f2",
                                      color: Number(margin.pct) > 40 ? "#10b981" : Number(margin.pct) > 20 ? "#f59e0b" : "#ef4444"
                                    }}>
                                      {margin.pct}%
                                    </span>
                                    <span style={{ fontSize: 11, color: "#9ca3af" }}>
                                      +${margin.margin.toFixed(1)}
                                    </span>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: 12, color: "#d1d5db" }}>—</span>
                                )}
                              </td>
                            )}
                            <td style={{ padding: "10px 16px", borderBottom: "1px solid #f0f1f5", textAlign: "center" }}>
                              <span style={{
                                padding: "3px 10px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                                background: m.totalStock > 10 ? "#ecfdf5" : m.totalStock > 0 ? "#fffbeb" : "#f3f4f6",
                                color: m.totalStock > 10 ? "#10b981" : m.totalStock > 0 ? "#f59e0b" : "#9ca3af"
                              }}>
                                {m.totalStock}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  /* Mobile: Card-based layout */
                  <div style={{ padding: "8px 12px" }}>
                    {models.map(m => {
                      const currentPrice = editMode ? (Number(newPrices[m.key]) || m.priceUSD) : m.priceUSD;
                      const currentCost = editMode ? (Number(newCosts[m.key]) || 0) : (m.costUSDT || 0);
                      const arsPrice = Math.round(currentPrice * exchangeRate);
                      const priceChanged = editMode && Number(newPrices[m.key]) !== m.priceUSD && newPrices[m.key] !== undefined;
                      const margin = getMargin(currentPrice, currentCost);

                      return (
                        <div key={m.key} style={{
                          padding: "12px 0", borderBottom: "1px solid #f0f1f5",
                          background: priceChanged ? "#f5f3ff" : "transparent"
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e" }}>{m.model}</div>
                              <div style={{ fontSize: 11, color: "#9ca3af" }}>{Number(m.puffs).toLocaleString("es-AR")} puffs · {m.totalStock} uds</div>
                            </div>
                            {!editMode && (
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 17, fontWeight: 800, color: "#00b894" }}>US${m.priceUSD}</div>
                                <div style={{ fontSize: 12, color: "#6b7280" }}>${arsPrice.toLocaleString("es-AR")}</div>
                              </div>
                            )}
                          </div>
                          {editMode && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                              <button onClick={() => adjustPrice(m.key, -1)} style={{
                                width: 36, height: 36, borderRadius: 8, border: "1px solid #e2e4e9",
                                background: "#f7f8fa", color: "#6b7280", fontSize: 18, cursor: "pointer"
                              }}>−</button>
                              <div style={{ flex: 1, textAlign: "center" }}>
                                <input type="number" value={newPrices[m.key] ?? m.priceUSD}
                                  onChange={e => setNewPrices(prev => ({ ...prev, [m.key]: e.target.value }))}
                                  style={{
                                    width: 70, padding: "6px", textAlign: "center",
                                    background: priceChanged ? "#6366f115" : "#f7f8fa",
                                    border: `1px solid ${priceChanged ? "#6366f1" : "#e2e4e9"}`,
                                    borderRadius: 8, fontSize: 18, fontWeight: 800, color: "#1a1a2e"
                                  }} />
                                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>${arsPrice.toLocaleString("es-AR")}</div>
                              </div>
                              <button onClick={() => adjustPrice(m.key, 1)} style={{
                                width: 36, height: 36, borderRadius: 8, border: "1px solid #e2e4e9",
                                background: "#f7f8fa", color: "#6b7280", fontSize: 18, cursor: "pointer"
                              }}>+</button>
                              {priceChanged && (
                                <span style={{
                                  fontSize: 12, fontWeight: 700, minWidth: 30,
                                  color: Number(newPrices[m.key]) > m.priceUSD ? "#e74c3c" : "#00b894"
                                }}>
                                  {Number(newPrices[m.key]) > m.priceUSD ? "+" : ""}{Number(newPrices[m.key]) - m.priceUSD}
                                </span>
                              )}
                            </div>
                          )}
                          {editMode && costMode && (
                            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>Costo USDT:</span>
                              <input type="number" step="0.5" value={newCosts[m.key] ?? (m.costUSDT || "")}
                                placeholder="0.00"
                                onChange={e => setNewCosts(prev => ({ ...prev, [m.key]: e.target.value }))}
                                style={{
                                  width: 70, padding: "4px 6px", textAlign: "center",
                                  background: "#f7f8fa", border: "1px solid #e2e4e9",
                                  borderRadius: 6, fontSize: 13, fontWeight: 600
                                }} />
                              {margin && (
                                <span style={{
                                  padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                                  background: Number(margin.pct) > 40 ? "#ecfdf5" : "#fffbeb",
                                  color: Number(margin.pct) > 40 ? "#10b981" : "#f59e0b"
                                }}>
                                  {margin.pct}%
                                </span>
                              )}
                            </div>
                          )}
                          {!editMode && margin && (
                            <div style={{ marginTop: 4 }}>
                              <span style={{
                                padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                                background: Number(margin.pct) > 40 ? "#ecfdf5" : Number(margin.pct) > 20 ? "#fffbeb" : "#fef2f2",
                                color: Number(margin.pct) > 40 ? "#10b981" : Number(margin.pct) > 20 ? "#f59e0b" : "#ef4444"
                              }}>
                                Margen: {margin.pct}% (+US${margin.margin.toFixed(1)})
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {/* Price change history */}
      <Card style={{ marginTop: 16 }}>
        <div onClick={() => setHistoryExpanded(!historyExpanded)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h4 style={{ color: "#f59e0b", margin: 0, fontSize: 14, textTransform: "uppercase" }}>
              Historial de cambios
            </h4>
            {priceLog && priceLog.length > 0 && (
              <Badge color="#f59e0b">{priceLog.length}</Badge>
            )}
          </div>
          <span style={{ color: "#9ca3af", fontSize: 14, transition: "transform 0.2s", transform: historyExpanded ? "rotate(0)" : "rotate(-90deg)" }}>▼</span>
        </div>
        {historyExpanded && (
          <div style={{ marginTop: 14 }}>
            {(!priceLog || priceLog.length === 0) ? (
              <div style={{ textAlign: "center", padding: 20 }}>
                <span style={{ color: "#9ca3af", fontSize: 13 }}>Cuando edites precios, los cambios van a aparecer aca.</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...priceLog].reverse().slice(0, 20).map((r, i) => {
                  const p = getProduct(r.productId);
                  const isUp = r.newPrice > r.oldPrice;
                  return (
                    <div key={r.id || i} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                      background: "#f9fafb", borderRadius: 8, flexWrap: "wrap"
                    }}>
                      <span style={{ fontSize: 11, color: "#9ca3af", minWidth: 80 }}>{formatDate(r.date)}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e", flex: 1, minWidth: 100 }}>
                        {p ? `${p.brand} ${p.model}` : "?"}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, color: "#9ca3af" }}>US${r.oldPrice}</span>
                        <span style={{ color: isUp ? "#e74c3c" : "#10b981", fontWeight: 700 }}>{isUp ? "▲" : "▼"}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>US${r.newPrice}</span>
                        <span style={{
                          padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                          background: isUp ? "#fef2f2" : "#ecfdf5",
                          color: isUp ? "#e74c3c" : "#10b981"
                        }}>
                          {isUp ? "+" : ""}{r.newPrice - r.oldPrice}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Bulk adjust modal */}
      {bulkModal && (
        <Modal open={true} onClose={() => { setBulkModal(null); setBulkPercent(""); }}
          title={`Ajuste masivo — ${bulkModal === "all" ? "Todos los modelos" : bulkModal}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Ingresa un porcentaje para ajustar {bulkModal === "all" ? "todos los precios" : `los precios de ${bulkModal}`}.
              Usa numeros positivos para subir y negativos para bajar.
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="number" value={bulkPercent} onChange={e => setBulkPercent(e.target.value)}
                placeholder="ej: 5 o -10"
                style={{
                  flex: 1, padding: "12px", fontSize: 20, fontWeight: 800, textAlign: "center",
                  background: "#f7f8fa", border: "1px solid #e2e4e9", borderRadius: 10, color: "#1a1a2e"
                }} />
              <span style={{ fontSize: 24, fontWeight: 800, color: "#6366f1" }}>%</span>
            </div>
            {bulkPercent && (
              <div style={{ padding: "10px 14px", background: "#f9fafb", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Vista previa:</div>
                {Object.values(modelsByBrand).flat()
                  .filter(m => bulkModal === "all" || m.brand === bulkModal)
                  .slice(0, 5)
                  .map(m => {
                    const current = Number(newPrices[m.key]) || m.priceUSD;
                    const next = Math.max(1, Math.round(current * (1 + Number(bulkPercent) / 100)));
                    return (
                      <div key={m.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
                        <span style={{ color: "#4b5563" }}>{m.brand} {m.model}</span>
                        <span>
                          <span style={{ color: "#9ca3af" }}>US${current}</span>
                          <span style={{ color: "#6366f1", margin: "0 4px" }}>→</span>
                          <span style={{ fontWeight: 700, color: next > current ? "#e74c3c" : "#10b981" }}>US${next}</span>
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={applyBulk} disabled={!bulkPercent} style={{ flex: 1 }}>
                Aplicar {bulkPercent ? `${Number(bulkPercent) > 0 ? "+" : ""}${bulkPercent}%` : ""}
              </Btn>
              <Btn variant="secondary" onClick={() => { setBulkModal(null); setBulkPercent(""); }}>
                Cancelar
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
