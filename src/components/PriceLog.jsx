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
    // 1. Collect price change logs BEFORE updating state
    const priceLogs = [];
    const loggedKeys = new Set();
    products.forEach(p => {
      const key = `${p.brand}|||${p.model}`;
      const np = Number(newPrices[key]);
      if (np && np !== p.priceUSD && !loggedKeys.has(key)) {
        priceLogs.push({ productId: p.id, oldPrice: p.priceUSD, newPrice: np });
        loggedKeys.add(key);
      }
    });

    // 2. Build updated products array
    const updatedProducts = products.map(p => {
      const key = `${p.brand}|||${p.model}`;
      const np = Number(newPrices[key]);
      const nc = Number(newCosts[key]) || 0;
      let changed = false;
      const updates = {};
      if (np && np !== p.priceUSD) {
        updates.priceUSD = np;
        changed = true;
      }
      if (nc !== (p.costUSDT || 0)) {
        updates.costUSDT = nc;
        changed = true;
      }
      return changed ? { ...p, ...updates } : p;
    });

    // 3. Update React state (smartSave in App.jsx syncs to Firestore)
    setProducts(updatedProducts);

    // 4. Log price changes
    priceLogs.forEach(({ productId, oldPrice, newPrice }) => {
      logPrice(productId, oldPrice, newPrice, "USD");
    });

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
          <h2 style={{ color: "#1E2B4A", margin: 0, fontSize: isMobile ? 20 : 22, fontWeight: 800 }}>Precios</h2>
          <div style={{ fontSize: 12, color: "#9AA2B3", marginTop: 2 }}>
            Blue: <strong style={{ color: "#1E2B4A" }}>${exchangeRate.toLocaleString("es-AR")}</strong>
          </div>
        </div>
        {editMode ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {changesCount > 0 && (
              <Badge color="#CB912F">{changesCount} cambio{changesCount > 1 ? "s" : ""}</Badge>
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
          { label: "Modelos", value: stats.totalModels, color: "#1E2B4A" },
          { label: "Precio prom.", value: `US$${stats.avgPrice}`, color: "#00b894" },
          { label: "Stock total", value: `${stats.totalStock} uds`, color: "#CB912F" },
          { label: "Valor stock", value: formatMoney(stats.stockValue, "USD"), color: "#0F7B6C" },
          ...(stats.avgMargin ? [{ label: "Margen prom.", value: `${stats.avgMargin}%`, color: "#a855f7" }] : []),
        ].map(s => (
          <div key={s.label} style={{
            flex: isMobile ? "1 1 calc(50% - 5px)" : "1 1 0",
            minWidth: 0, background: "#FFFFFF", borderRadius: 10, padding: isMobile ? "10px 12px" : "12px 14px",
            border: "1px solid #E5DAC2", overflow: "hidden",
          }}>
            <div style={{ fontSize: 11, color: "#6B7794", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</div>
            <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: s.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Edit mode toolbar */}
      {editMode && (
        <Card style={{ marginBottom: 14, background: "#f0f1ff", border: "1px solid #1E2B4A33" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#1E2B4A", fontWeight: 600, flex: 1, minWidth: 0 }}>
              Editando precios — usá +/− o escribí el valor. ARS se calcula con blue (${exchangeRate}).
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
          padding: "6px 14px", borderRadius: 20, border: brandFilter === "all" ? "2px solid #1E2B4A" : "1px solid #E5DAC2",
          background: brandFilter === "all" ? "#1E2B4A" : "#F8F2E7",
          color: brandFilter === "all" ? "#fff" : "#6B7794",
          fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s"
        }}>
          Todas ({Object.values(modelsByBrand).flat().length})
        </button>
        {brands.map(b => {
          const c = BRAND_COLORS[b] || "#1E2B4A";
          const active = brandFilter === b;
          const count = (modelsByBrand[b] || []).length;
          return (
            <button key={b} onClick={() => setBrandFilter(active ? "all" : b)} style={{
              padding: "6px 14px", borderRadius: 20,
              border: active ? `2px solid ${c}` : "1px solid #E5DAC2",
              background: active ? c : "#F8F2E7", color: active ? "#fff" : c,
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
        const brandColor = BRAND_COLORS[brand] || "#1E2B4A";
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
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1E2B4A" }}>{brand}</div>
                  <div style={{ fontSize: 11, color: "#9AA2B3" }}>
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
                <span style={{ color: "#9AA2B3", fontSize: 16, transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)" }}>
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
                      <tr style={{ background: "#F8F2E7" }}>
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
                            fontSize: 10, color: "#9AA2B3", textTransform: "uppercase", letterSpacing: 0.5,
                            fontWeight: 700, borderBottom: "1px solid #E5DAC2"
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
                            <td style={{ padding: "10px 16px", fontSize: 14, color: "#1E2B4A", fontWeight: 700, borderBottom: "1px solid #E5DAC2" }}>
                              {m.model}
                            </td>
                            <td style={{ padding: "10px 16px", fontSize: 12, color: "#9AA2B3", borderBottom: "1px solid #E5DAC2" }}>
                              {Number(m.puffs).toLocaleString("es-AR")}
                            </td>
                            {editMode ? (
                              <>
                                <td style={{ padding: "8px 16px", borderBottom: "1px solid #E5DAC2" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <button onClick={() => adjustPrice(m.key, -1)} style={{
                                      width: 28, height: 28, borderRadius: 6, border: "1px solid #E5DAC2",
                                      background: "#F8F2E7", color: "#6B7794", fontSize: 16, cursor: "pointer",
                                      display: "flex", alignItems: "center", justifyContent: "center"
                                    }}>−</button>
                                    <input type="number" value={newPrices[m.key] ?? m.priceUSD}
                                      onChange={e => setNewPrices(prev => ({ ...prev, [m.key]: e.target.value }))}
                                      style={{
                                        width: 60, padding: "5px 4px", textAlign: "center",
                                        background: priceChanged ? "#F1F2FD" : "#F8F2E7",
                                        border: `1px solid ${priceChanged? "#1E2B4A" : "#E5DAC2"}`,
                                        borderRadius: 6, color: "#1E2B4A", fontSize: 15, fontWeight: 800
                                      }} />
                                    <button onClick={() => adjustPrice(m.key, 1)} style={{
                                      width: 28, height: 28, borderRadius: 6, border: "1px solid #E5DAC2",
                                      background: "#F8F2E7", color: "#6B7794", fontSize: 16, cursor: "pointer",
                                      display: "flex", alignItems: "center", justifyContent: "center"
                                    }}>+</button>
                                  </div>
                                </td>
                                <td style={{ padding: "8px 4px", borderBottom: "1px solid #E5DAC2", fontSize: 11, color: "#9AA2B3" }}>
                                  {priceChanged && (
                                    <span style={{ color: Number(newPrices[m.key]) > m.priceUSD ? "#E03E3E" : "#00b894", fontWeight: 700 }}>
                                      {Number(newPrices[m.key]) > m.priceUSD ? "+" : ""}{Number(newPrices[m.key]) - m.priceUSD}
                                    </span>
                                  )}
                                </td>
                              </>
                            ) : (
                              <td style={{ padding: "10px 16px", borderBottom: "1px solid #E5DAC2" }}>
                                <span style={{ color: "#00b894", fontWeight: 800, fontSize: 16 }}>US${m.priceUSD}</span>
                              </td>
                            )}
                            <td style={{ padding: "10px 16px", fontSize: 14, color: "#3A4868", borderBottom: "1px solid #E5DAC2", fontWeight: 600 }}>
                              ${arsPrice.toLocaleString("es-AR")}
                            </td>
                            {showCostCol && (
                              <td style={{ padding: "8px 16px", borderBottom: "1px solid #E5DAC2" }}>
                                          {editMode && costMode ? (
                                  <input type="number" step="0.5" value={newCosts[m.key] ?? (m.costUSDT || "")}
                                    placeholder="0.00"
                                    onChange={e => setNewCosts(prev => ({ ...prev, [m.key]: e.target.value }))}
                                    style={{
                                      width: 70, padding: "5px 6px", textAlign: "center",
                                      background: costChanged ? "#a855f715" : "#F8F2E7",
                                      border: `1px solid ${costChanged ? "#a855f7" : "#E5DAC2"}`,
                                      borderRadius: 6, color: "#1E2B4A", fontSize: 13, fontWeight: 600
                                    }} />
                                ) : (
                                  <span style={{ fontSize: 13, color: currentCost > 0 ? "#6B7794" : "#6B7794", fontWeight: 600 }}>
                                    {currentCost > 0 ? `₮${currentCost.toFixed(1)}` : "—"}
                                  </span>
                                )}
                              </td>
                            )}
                            {showMarginCol && (
                              <td style={{ padding: "10px 16px", borderBottom: "1px solid #E5DAC2" }}>
                                {margin ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{
                                      padding: "2px 8px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                                      background: Number(margin.pct) > 40 ? "#DDEDEA" : Number(margin.pct) > 20 ? "#FDECC8" : "#FBE4E4",
                                      color: Number(margin.pct) > 40 ? "#0F7B6C" : Number(margin.pct) > 20 ? "#CB912F" : "#E03E3E"
                                    }}>
                                      {margin.pct}%
                                    </span>
                                    <span style={{ fontSize: 11, color: "#9AA2B3" }}>
                                      +${margin.margin.toFixed(1)}
                                    </span>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: 12, color: "#6B7794" }}>—</span>
                                )}
                              </td>
                            )}
                            <td style={{ padding: "10px 16px", borderBottom: "1px solid #E5DAC2", textAlign: "center" }}>
                              <span style={{
                                padding: "3px 10px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                                background: m.totalStock > 10 ? "#DDEDEA" : m.totalStock > 0 ? "#FDECC8" : "#E5DAC2",
                                color: m.totalStock > 10 ? "#0F7B6C" : m.totalStock > 0 ? "#CB912F" : "#9AA2B3"
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
                          padding: "12px 0", borderBottom: "1px solid #E5DAC2",
                          background: priceChanged ? "#f5f3ff" : "transparent"
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#1E2B4A" }}>{m.model}</div>
                              <div style={{ fontSize: 11, color: "#9AA2B3" }}>{Number(m.puffs).toLocaleString("es-AR")} puffs · {m.totalStock} uds</div>
                            </div>
                            {!editMode && (
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 17, fontWeight: 800, color: "#00b894" }}>US${m.priceUSD}</div>
                                <div style={{ fontSize: 12, color: "#6B7794" }}>${arsPrice.toLocaleString("es-AR")}</div>
                              </div>
                            )}
                          </div>
                          {editMode && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                              <button onClick={() => adjustPrice(m.key, -1)} style={{
                                width: 36, height: 36, borderRadius: 8, border: "1px solid #E5DAC2",
                                background: "#F8F2E7", color: "#6B7794", fontSize: 18, cursor: "pointer"
                              }}>−</button>
                              <div style={{ flex: 1, textAlign: "center" }}>
                                <input type="number" value={newPrices[m.key] ?? m.priceUSD}
                                  onChange={e => setNewPrices(prev => ({ ...prev, [m.key]: e.target.value }))}
                                  style={{
                                    width: 70, padding: "6px", textAlign: "center",
                                    background: priceChanged ? "#F1F2FD" : "#F8F2E7",
                                    border: `1px solid ${priceChanged ? "#1E2B4A" : "#E5DAC2"}`,
                                    borderRadius: 8, fontSize: 18, fontWeight: 800, color: "#1E2B4A"
                                  }} />
                                <div style={{ fontSize: 11, color: "#9AA2B3", marginTop: 2 }}>${arsPrice.toLocaleString("es-AR")}</div>
                              </div>
                              <button onClick={() => adjustPrice(m.key, 1)} style={{
                                width: 36, height: 36, borderRadius: 8, border: "1px solid #E5DAC2",
                                background: "#F8F2E7", color: "#6B7794", fontSize: 18, cursor: "pointer"
                              }}>+</button>
                              {priceChanged && (
                                <span style={{
                                  fontSize: 12, fontWeight: 700, minWidth: 30,
                                  color: Number(newPrices[m.key]) > m.priceUSD ? "#E03E3E" : "#00b894"
                                }}>
                                  {Number(newPrices[m.key]) > m.priceUSD ? "+" : ""}{Number(newPrices[m.key]) - m.priceUSD}
                                </span>
                              )}
                            </div>
                          )}
                          {editMode && costMode && (
                            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 11, color: "#9AA2B3", fontWeight: 600 }}>Costo USDT:</span>
                              <input type="number" step="0.5" value={newCosts[m.key] ?? (m.costUSDT || "")}
                                placeholder="0.00"
                                onChange={e => setNewCosts(prev => ({ ...prev, [m.key]: e.target.value }))}
                                style={{
                                  width: 70, padding: "4px 6px", textAlign: "center",
                                  background: "#F8F2E7", border: "1px solid #E5DAC2",
                                  borderRadius: 6, fontSize: 13, fontWeight: 600
                                }} />
                              {margin && (
                                <span style={{
                                  padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                                  background: Number(margin.pct) > 40 ? "#DDEDEA" : "#FDECC8",
                                  color: Number(margin.pct) > 40 ? "#0F7B6C" : "#CB912F"
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
                                background: Number(margin.pct) > 40 ? "#DDEDEA" : Number(margin.pct) > 20 ? "#FDECC8" : "#FBE4E4",
                                color: Number(margin.pct) > 40 ? "#0F7B6C" : Number(margin.pct) > 20 ? "#CB912F" : "#E03E3E"
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
            <h4 style={{ color: "#CB912F", margin: 0, fontSize: 14, textTransform: "uppercase" }}>
              Historial de cambios
            </h4>
            {priceLog && priceLog.length > 0 && (
              <Badge color="#CB912F">{priceLog.length}</Badge>
            )}
          </div>
          <span style={{ color: "#9AA2B3", fontSize: 14, transition: "transform 0.2s", transform: historyExpanded ? "rotate(0)" : "rotate(-90deg)" }}>▼</span>
        </div>
        {historyExpanded && (
          <div style={{ marginTop: 14 }}>
            {(!priceLog || priceLog.length === 0) ? (
              <div style={{ textAlign: "center", padding: 20 }}>
                <span style={{ color: "#9AA2B3", fontSize: 13 }}>Cuando edites precios, los cambios van a aparecer aca.</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...priceLog].reverse().slice(0, 20).map((r, i) => {
                  const p = getProduct(r.productId);
                  const isUp = r.newPrice > r.oldPrice;
                  return (
                    <div key={r.id || i} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                      background: "#F8F2E7", borderRadius: 8, flexWrap: "wrap"
                    }}>
                      <span style={{ fontSize: 11, color: "#9AA2B3", minWidth: 80 }}>{formatDate(r.date)}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1E2B4A", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p ? `${p.brand} ${p.model}` : "?"}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, color: "#9AA2B3" }}>US${r.oldPrice}</span>
                        <span style={{ color: isUp ? "#E03E3E" : "#0F7B6C", fontWeight: 700 }}>{isUp ? "▲" : "▼"}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1E2B4A" }}>US${r.newPrice}</span>
                        <span style={{
                          padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                          background: isUp ? "#FBE4E4" : "#DDEDEA",
                          color: isUp ? "#E03E3E" : "#0F7B6C"
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
            <div style={{ fontSize: 13, color: "#6B7794" }}>
              Ingresa un porcentaje para ajustar {bulkModal === "all" ? "todos los precios" : `los precios de ${bulkModal}`}.
              Usa numeros positivos para subir y negativos para bajar.
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="number" value={bulkPercent} onChange={e => setBulkPercent(e.target.value)}
                placeholder="ej: 5 o -10"
                style={{
                  flex: 1, padding: "12px", fontSize: 20, fontWeight: 800, textAlign: "center",
                  background: "#F8F2E7", border: "1px solid #E5DAC2", borderRadius: 10, color: "#1E2B4A"
                }} />
              <span style={{ fontSize: 24, fontWeight: 800, color: "#1E2B4A" }}>%</span>
            </div>
            {bulkPercent && (
              <div style={{ padding: "10px 14px", background: "#F8F2E7", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "#6B7794", marginBottom: 6 }}>Vista previa:</div>
                {Object.values(modelsByBrand).flat()
                  .filter(m => bulkModal === "all" || m.brand === bulkModal)
                  .slice(0, 5)
                  .map(m => {
                    const current = Number(newPrices[m.key]) || m.priceUSD;
                    const next = Math.max(1, Math.round(current * (1 + Number(bulkPercent) / 100)));
                    return (
                      <div key={m.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
                        <span style={{ color: "#3A4868" }}>{m.brand} {m.model}</span>
                        <span>
                          <span style={{ color: "#9AA2B3" }}>US${current}</span>
                          <span style={{ color: "#1E2B4A", margin: "0 4px" }}>→</span>
                          <span style={{ fontWeight: 700, color: next > current ? "#E03E3E" : "#0F7B6C" }}>US${next}</span>
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
