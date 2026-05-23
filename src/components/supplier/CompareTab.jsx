import { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { useResponsive } from "../../App.jsx";
import { Card, Btn, StatCard, Modal } from "../UI.jsx";
import { formatMoney } from "../../helpers.js";
import { SupplierBadge } from "./Sparkline.jsx";
import {
  buildComparisonMatrix,
  computeOptimalSplit,
  buildSupplierSummary,
  topSpreadProducts,
} from "../../lib/supplierComparison.js";
import {
  processSpreadsheetFile,
  processPdfFile,
  enrichItems,
} from "./processHelpers.js";
import {
  parseTextLines,
} from "../../lib/supplierParser.js";
import { activeProfiles } from "../../lib/supplierProfiles.js";

// Tab 2: Comparar 2+ listas de proveedores en simultáneo.
//
// Flujo:
//   1. Usuario agrega varias listas (cada una con su proveedor asignado)
//   2. Sistema arma matriz comparativa
//   3. Muestra:
//      - Resumen por proveedor (chips con stats)
//      - Top spreads (mejores oportunidades)
//      - Matriz completa (heatmap-style, mejor precio en verde)
//      - Sugerencia de demanda total a pedir + split óptimo
//      - 3 botones: crear N pedidos / exportar comparativa / refrescar

export function CompareTab({
  products = [],
  supplierProfiles = [],
  supplierAliases = [],
  exchangeRate,
  onCreatePurchasesFromSplit,
  onAddProfile,
  showToast,
}) {
  const { isMobile } = useResponsive();
  const activeProfilesList = useMemo(() => activeProfiles(supplierProfiles), [supplierProfiles]);

  // Cada "loaded list" es: { supplierId, supplierName, color, items, fileName, mode }
  const [loadedLists, setLoadedLists] = useState([]);
  const [showAddListModal, setShowAddListModal] = useState(false);
  const [busy, setBusy] = useState(false);

  // Demanda por producto (qty deseada total, el sistema reparte al óptimo)
  const [demand, setDemand] = useState({}); // { [productId]: qty }

  // Matriz computada
  const matrix = useMemo(
    () => buildComparisonMatrix(loadedLists, products),
    [loadedLists, products]
  );

  const summaries = useMemo(() => buildSupplierSummary(matrix), [matrix]);
  const topSpreads = useMemo(() => topSpreadProducts(matrix, 8), [matrix]);
  const split = useMemo(() => computeOptimalSplit(matrix, demand), [matrix, demand]);

  // Estado UX: filtros
  const [filterBrand, setFilterBrand] = useState("");
  const [filterText, setFilterText] = useState("");
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);

  const filteredProducts = useMemo(() => {
    return matrix.products.filter(p => {
      if (filterBrand && p.brand !== filterBrand) return false;
      if (filterText) {
        const t = filterText.toLowerCase();
        if (!`${p.brand} ${p.model} ${p.flavor}`.toLowerCase().includes(t)) return false;
      }
      if (showOnlyAvailable) {
        const someAvailable = matrix.suppliers.some(s => matrix.cells[p.productId]?.[s.supplierId]?.available);
        if (!someAvailable) return false;
      }
      return true;
    });
  }, [matrix, filterBrand, filterText, showOnlyAvailable]);

  const brandsInMatrix = useMemo(
    () => Array.from(new Set(matrix.products.map(p => p.brand).filter(Boolean))).sort(),
    [matrix.products]
  );

  // ----- Add list (importa una lista de un proveedor) -----
  const addListFromFile = async (file, profile, mode) => {
    setBusy(true);
    try {
      let rawItems = [];
      if (mode === "spreadsheet") {
        rawItems = await processSpreadsheetFile(file);
      } else if (mode === "pdf") {
        const knownBrands = Array.from(new Set(products.map(p => p.brand).filter(Boolean)));
        rawItems = await processPdfFile(file, knownBrands);
      }
      const enriched = enrichItems(rawItems, products, supplierAliases, profile.id);
      addList(profile, enriched, file.name, mode);
    } catch (e) {
      console.error(e);
      showToast?.("❌ Error procesando el archivo", "#E03E3E");
    } finally {
      setBusy(false);
    }
  };

  const addListFromText = (text, profile) => {
    setBusy(true);
    try {
      const knownBrands = Array.from(new Set(products.map(p => p.brand).filter(Boolean)));
      const rawItems = parseTextLines(text, { knownBrands });
      const enriched = enrichItems(rawItems, products, supplierAliases, profile.id);
      addList(profile, enriched, "", "text");
    } finally {
      setBusy(false);
    }
  };

  const addList = (profile, items, fileName, mode) => {
    setLoadedLists(prev => {
      const filtered = prev.filter(l => l.supplierId !== profile.id);
      return [...filtered, {
        supplierId: profile.id,
        supplierName: profile.name,
        color: profile.color,
        items: items.map(it => ({
          ...it,
          matchedProductId: it.bestMatch?.product?.id || null,
        })),
        fileName,
        mode,
        loadedAt: new Date().toISOString(),
      }];
    });
    setShowAddListModal(false);
    showToast?.(`✅ Lista de ${profile.name}: ${items.length} items cargados`);
  };

  const removeList = (supplierId) => {
    setLoadedLists(prev => prev.filter(l => l.supplierId !== supplierId));
  };

  // Auto-fill demand: para todos los productos con best price, usar el qty del proveedor que más tiene
  const autoFillDemand = (mode = "best") => {
    const next = {};
    matrix.products.forEach(p => {
      // Modo "best": agarrar el qty disponible del proveedor con mejor precio
      // Modo "max": agarrar el máximo qty disponible entre todos
      if (mode === "best") {
        const best = matrix.bestBy[p.productId];
        if (best) {
          const cell = matrix.cells[p.productId][best.supplierId];
          next[p.productId] = Math.min(20, cell?.qty || 0);
        }
      } else {
        let maxQty = 0;
        matrix.suppliers.forEach(s => {
          const cell = matrix.cells[p.productId]?.[s.supplierId];
          if (cell?.qty > maxQty) maxQty = cell.qty;
        });
        next[p.productId] = Math.min(20, maxQty);
      }
    });
    setDemand(next);
  };

  const handleCreatePurchases = () => {
    if (Object.values(split.bySupplier).every(s => s.totalUnits === 0)) {
      showToast?.("Definí qty a pedir primero", "#CB912F");
      return;
    }
    onCreatePurchasesFromSplit?.(split, loadedLists);
  };

  const exportComparison = () => {
    if (matrix.products.length === 0) {
      showToast?.("Sin datos para exportar", "#CB912F");
      return;
    }
    const rows = matrix.products.map(p => {
      const row = { Marca: p.brand, Modelo: p.model, Sabor: p.flavor, Puffs: p.puffs || "" };
      matrix.suppliers.forEach(s => {
        const cell = matrix.cells[p.productId]?.[s.supplierId];
        row[s.supplierName] = cell ? (cell.available ? `$${cell.priceUSD}` : "Sin stock") : "—";
      });
      const best = matrix.bestBy[p.productId];
      row["Mejor"] = best ? `${matrix.suppliers.find(s => s.supplierId === best.supplierId)?.supplierName} ($${best.priceUSD})` : "—";
      row["Diff %"] = matrix.diffPct[p.productId] ?? "";
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Comparativa");
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Comparativa_Proveedores_${dateStr}.xlsx`);
    showToast?.("✅ Excel exportado");
  };

  // ----- Render -----
  return (
    <div>
      {/* Top: chips de listas cargadas + botón add */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#37352F" }}>
            {loadedLists.length === 0 ? "Empezá agregando listas" : `${loadedLists.length} ${loadedLists.length === 1 ? "lista cargada" : "listas cargadas"}`}
          </div>
          <Btn onClick={() => setShowAddListModal(true)} disabled={activeProfilesList.length === 0}>
            ➕ Agregar lista
          </Btn>
        </div>
        {activeProfilesList.length === 0 && (
          <div style={{ padding: 16, background: "#FDECC8", border: "1px solid #F2D59A", borderRadius: 10, fontSize: 13, color: "#CB912F" }}>
            ⚠️ Primero creá proveedores en la tab "Proveedores"
          </div>
        )}
        {loadedLists.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {loadedLists.map(l => (
              <div
                key={l.supplierId}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 12px",
                  background: `${l.color}18`,
                  border: `1px solid ${l.color}40`,
                  borderRadius: 10,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: l.color }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: l.color }}>{l.supplierName}</span>
                <span style={{ fontSize: 11, color: "#8C8A82" }}>· {l.items.length} items</span>
                <button
                  onClick={() => removeList(l.supplierId)}
                  aria-label="Quitar"
                  style={{
                    background: "none", border: "none", color: "#8C8A82",
                    cursor: "pointer", fontSize: 13, padding: "0 0 0 4px",
                    fontFamily: "inherit",
                  }}
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {loadedLists.length === 0 && !busy && (
        <Card>
          <div style={{ textAlign: "center", padding: isMobile ? 24 : 48, color: "#8C8A82" }}>
            <div style={{ fontSize: isMobile ? 48 : 64, marginBottom: 12 }}>🔀</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#37352F", marginBottom: 6 }}>
              Compará proveedores lado a lado
            </div>
            <div style={{ fontSize: 13, maxWidth: 500, margin: "0 auto" }}>
              Cargá 2+ listas de proveedores y el sistema te dice cuál te conviene para cada producto.
              Te calcula el split óptimo, el ahorro vs pedir todo al peor, y arma los pedidos automáticamente.
            </div>
          </div>
        </Card>
      )}

      {loadedLists.length === 1 && (
        <Card style={{ marginBottom: 16, background: "#FDECC8", border: "1px solid #F2D59A" }}>
          <div style={{ fontSize: 13, color: "#CB912F" }}>
            💡 Agregá al menos una segunda lista para ver la comparativa
          </div>
        </Card>
      )}

      {loadedLists.length >= 2 && (
        <>
          {/* Resumen por proveedor */}
          <div style={{ marginBottom: 16 }}>
            <SectionTitle>📊 Resumen por proveedor</SectionTitle>
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? "240px" : "260px"}, 1fr))`,
              gap: 12,
            }}>
              {summaries.map(s => {
                const isBest = s.bestPriceCount > 0 && s.bestPriceCount === Math.max(...summaries.map(x => x.bestPriceCount));
                return (
                  <div key={s.supplierId} style={{
                    padding: 14,
                    background: "#FFFFFF",
                    border: `1px solid ${s.color}40`,
                    borderRadius: 12,
                    position: "relative",
                  }}>
                    <div style={{
                      position: "absolute", top: 0, left: 0, right: 0, height: 3,
                      background: s.color, borderRadius: "12px 12px 0 0",
                    }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 4, marginBottom: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#37352F" }}>{s.supplierName}</div>
                      {isBest && <Badge label="🏆 Líder" color="#0F7B6C" />}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <Mini label="Productos" value={s.totalProductsListed} />
                      <Mini label="Disponibles" value={s.availableCount} color="#0F7B6C" />
                      <Mini label="Mejor precio" value={s.bestPriceCount} color={isBest ? "#0F7B6C" : "#555247"} bold={isBest} />
                      <Mini label="Exclusivos" value={s.exclusiveCount} color="#5E6AD2" />
                    </div>
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #F0EFEB" }}>
                      <div style={{ fontSize: 10, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                        Premium vs el mejor precio
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: s.avgPremiumVsBest > 5 ? "#E03E3E" : s.avgPremiumVsBest > 0 ? "#CB912F" : "#0F7B6C" }}>
                        {s.avgPremiumVsBest === 0 ? "$0 — sos vos el mejor" : `+${s.avgPremiumVsBest}%`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top opportunities (mayor spread) */}
          {topSpreads.length > 0 && (
            <Card style={{ marginBottom: 16, background: "linear-gradient(135deg, #EEF0FC 0%, #FFFFFF 100%)", border: "1px solid #5E6AD240" }}>
              <SectionTitle style={{ marginTop: 0 }}>💎 Top oportunidades (mayor diferencia entre proveedores)</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {topSpreads.map(p => {
                  const bestSup = matrix.suppliers.find(s => s.supplierId === p.best.supplierId);
                  const worstSup = matrix.suppliers.find(s => s.supplierId === p.worst.supplierId);
                  return (
                    <div key={p.productId} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: 10, padding: "8px 12px",
                      background: "#FFFFFF", borderRadius: 8, border: "1px solid #E8E7E3",
                      flexWrap: "wrap",
                    }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#37352F",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.brand} {p.model} · {p.flavor}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <SupplierBadge name={bestSup?.supplierName || "?"} color={bestSup?.color} size="sm" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F7B6C" }}>${p.best.priceUSD}</span>
                        <span style={{ fontSize: 11, color: "#8C8A82" }}>vs</span>
                        <SupplierBadge name={worstSup?.supplierName || "?"} color={worstSup?.color} size="sm" />
                        <span style={{ fontSize: 13, color: "#8C8A82", textDecoration: "line-through" }}>${p.worst.priceUSD}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 800, color: "#FFFFFF",
                          background: "#0F7B6C", padding: "2px 8px", borderRadius: 6,
                        }}>−{p.diffPct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Filtros */}
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <input
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                placeholder="🔍 Buscar producto..."
                style={{
                  padding: "8px 12px", background: "#FAFAF9",
                  border: "1px solid #E8E7E3", borderRadius: 8,
                  fontSize: 13, outline: "none", fontFamily: "inherit",
                  minWidth: 180, flex: isMobile ? "1 1 100%" : "0 1 auto",
                }}
              />
              <select
                value={filterBrand}
                onChange={e => setFilterBrand(e.target.value)}
                style={{
                  padding: "8px 12px", background: "#FAFAF9",
                  border: "1px solid #E8E7E3", borderRadius: 8,
                  fontSize: 13, outline: "none", fontFamily: "inherit",
                }}
              >
                <option value="">Todas las marcas</option>
                {brandsInMatrix.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555247", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={showOnlyAvailable}
                  onChange={e => setShowOnlyAvailable(e.target.checked)}
                  style={{ accentColor: "#5E6AD2" }}
                />
                Solo disponibles
              </label>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  onClick={() => autoFillDemand("best")}
                  style={{
                    background: "transparent", border: "1px solid #E8E7E3", color: "#5E6AD2",
                    padding: "6px 10px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                    fontWeight: 600, fontFamily: "inherit",
                  }}
                >✨ Auto-completar qty</button>
                <button
                  onClick={() => setDemand({})}
                  style={{
                    background: "transparent", border: "1px solid #E8E7E3", color: "#555247",
                    padding: "6px 10px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                    fontWeight: 600, fontFamily: "inherit",
                  }}
                >Limpiar</button>
              </div>
            </div>
          </Card>

          {/* Matriz */}
          <Card style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
            <SectionTitle style={{ padding: "14px 16px 8px" }}>🔀 Matriz comparativa</SectionTitle>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead>
                  <tr style={{ background: "#FAFAF9" }}>
                    <th style={th()}>Producto</th>
                    {matrix.suppliers.map(s => (
                      <th key={s.supplierId} style={{ ...th(), textAlign: "center", minWidth: 100 }}>
                        <div style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                        }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
                          <span style={{ color: s.color }}>{s.supplierName}</span>
                        </div>
                      </th>
                    ))}
                    <th style={{ ...th(), textAlign: "center" }}>Pedir</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(p => {
                    const best = matrix.bestBy[p.productId];
                    return (
                      <tr key={p.productId} style={{ borderBottom: "1px solid #F0EFEB" }}>
                        <td style={td()}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#37352F" }}>
                            {p.brand} {p.model}
                          </div>
                          <div style={{ fontSize: 11, color: "#8C8A82" }}>{p.flavor}</div>
                        </td>
                        {matrix.suppliers.map(s => {
                          const cell = matrix.cells[p.productId]?.[s.supplierId];
                          const isBest = best?.supplierId === s.supplierId;
                          if (!cell) {
                            return <td key={s.supplierId} style={{ ...td(), textAlign: "center", color: "#B1AFA7" }}>—</td>;
                          }
                          return (
                            <td key={s.supplierId} style={{
                              ...td(),
                              textAlign: "center",
                              background: isBest ? "#DDEDEA" : "#FFFFFF",
                            }}>
                              {cell.available ? (
                                <div>
                                  <div style={{
                                    fontSize: 13, fontWeight: 800,
                                    color: isBest ? "#0F7B6C" : "#37352F",
                                  }}>${cell.priceUSD}</div>
                                  <div style={{ fontSize: 10, color: "#8C8A82" }}>{cell.qty}u</div>
                                </div>
                              ) : (
                                <span style={{ fontSize: 11, color: "#B1AFA7", fontStyle: "italic" }}>Sin stock</span>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ ...td(), textAlign: "center" }}>
                          <input
                            type="number" min="0"
                            value={demand[p.productId] || ""}
                            onChange={e => {
                              const v = Math.max(0, Number(e.target.value) || 0);
                              setDemand(d => ({ ...d, [p.productId]: v }));
                            }}
                            placeholder="0"
                            style={{
                              width: 60, padding: "5px 8px", border: "1px solid #E8E7E3",
                              borderRadius: 6, fontSize: 13, textAlign: "center",
                              outline: "none", fontFamily: "inherit", background: "#FFFFFF",
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Split óptimo */}
          {split.totalCost > 0 && (
            <Card style={{
              marginBottom: 16,
              background: "linear-gradient(135deg, #DDEDEA 0%, #FFFFFF 100%)",
              border: "1px solid #B6D4CC",
            }}>
              <SectionTitle style={{ marginTop: 0 }}>⚡ Pedidos óptimos</SectionTitle>
              <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <StatCard
                  label="Costo total óptimo"
                  value={`USD ${split.totalCost.toFixed(0)}`}
                  color="#0F7B6C"
                  icon="💰"
                />
                <StatCard
                  label="Ahorro vs el peor"
                  value={`USD ${split.savingsVsWorst.toFixed(0)}`}
                  sub={split.savingsVsWorst > 0 ? `${formatMoney(split.savingsVsWorst * (exchangeRate || 0))}` : "—"}
                  color="#5E6AD2"
                  icon="💎"
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? "100%" : "260px"}, 1fr))`, gap: 10 }}>
                {Object.entries(split.bySupplier).filter(([, v]) => v.itemCount > 0).map(([supId, agg]) => {
                  const sup = matrix.suppliers.find(s => s.supplierId === supId);
                  return (
                    <div key={supId} style={{
                      padding: 12,
                      background: "#FFFFFF",
                      border: `1px solid ${sup?.color || "#E8E7E3"}40`,
                      borderRadius: 10,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <SupplierBadge name={sup?.supplierName || "?"} color={sup?.color} />
                      </div>
                      <div style={{ fontSize: 11, color: "#8C8A82", marginBottom: 4 }}>
                        {agg.itemCount} productos · {agg.totalUnits} unidades
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#37352F" }}>
                        USD {agg.totalUSD.toFixed(0)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                <Btn onClick={handleCreatePurchases} style={{ flex: isMobile ? "1 1 100%" : "0 1 auto" }}>
                  💾 Crear {Object.values(split.bySupplier).filter(s => s.itemCount > 0).length} pedidos
                </Btn>
                <Btn variant="secondary" onClick={exportComparison}>📥 Exportar comparativa</Btn>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Add list modal */}
      <AddListModal
        open={showAddListModal}
        profiles={activeProfilesList}
        onClose={() => setShowAddListModal(false)}
        onFile={addListFromFile}
        onText={addListFromText}
        busy={busy}
      />
    </div>
  );
}

function AddListModal({ open, profiles, onClose, onFile, onText, busy }) {
  const [profileId, setProfileId] = useState("");
  const [mode, setMode] = useState("spreadsheet");
  const [rawText, setRawText] = useState("");
  const fileInputRef = useRef(null);

  if (!open) return null;
  const selectedProfile = profiles.find(p => p.id === profileId);

  const handleProcess = () => {
    if (!selectedProfile) return;
    if (mode === "text") {
      onText(rawText, selectedProfile);
      setRawText("");
    } else {
      fileInputRef.current?.click();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="➕ Cargar lista de proveedor">
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Proveedor</label>
        <select
          value={profileId}
          onChange={e => setProfileId(e.target.value)}
          style={{
            width: "100%", padding: "12px 14px",
            background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10,
            color: "#37352F", fontSize: 16, outline: "none", boxSizing: "border-box",
            fontFamily: "inherit",
          }}
        >
          <option value="">— Elegir proveedor —</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Formato</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { key: "spreadsheet", label: "📊 Excel/CSV" },
            { key: "pdf", label: "📄 PDF" },
            { key: "text", label: "📝 Texto" },
          ].map(m => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              style={{
                padding: "8px 14px",
                background: mode === m.key ? "#5E6AD2" : "transparent",
                color: mode === m.key ? "#FFFFFF" : "#555247",
                border: `1px solid ${mode === m.key ? "#5E6AD2" : "#E8E7E3"}`,
                borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >{m.label}</button>
          ))}
        </div>
      </div>

      {mode === "text" ? (
        <textarea
          value={rawText}
          onChange={e => setRawText(e.target.value)}
          placeholder="Pegá la lista del proveedor..."
          style={{
            width: "100%", minHeight: 140, padding: 12,
            background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10,
            color: "#37352F", fontSize: 13, outline: "none", boxSizing: "border-box",
            fontFamily: "'SF Mono', Monaco, monospace", resize: "vertical",
            marginBottom: 12,
          }}
        />
      ) : (
        <div style={{ fontSize: 12, color: "#8C8A82", marginBottom: 12 }}>
          Hacé click en "Cargar archivo" y elegí el {mode === "spreadsheet" ? "Excel/CSV" : "PDF"} de tu proveedor.
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={mode === "spreadsheet" ? ".xlsx,.xls,.csv" : ".pdf"}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f && selectedProfile) onFile(f, selectedProfile, mode);
        }}
        style={{ display: "none" }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <Btn variant="secondary" onClick={onClose} style={{ flex: 1 }}>Cancelar</Btn>
        <Btn onClick={handleProcess} disabled={!profileId || busy || (mode === "text" && !rawText.trim())} style={{ flex: 1 }}>
          {busy ? "Procesando..." : (mode === "text" ? "Procesar" : "Cargar archivo")}
        </Btn>
      </div>
    </Modal>
  );
}

// ----- Helpers de estilo internos -----

const th = () => ({
  textAlign: "left", padding: "10px 12px", fontSize: 11, color: "#8C8A82",
  textTransform: "uppercase", letterSpacing: 0.5,
  borderBottom: "1px solid #E8E7E3", fontWeight: 700,
  whiteSpace: "nowrap",
});

const td = () => ({
  padding: "10px 12px", fontSize: 13, color: "#37352F",
  borderBottom: "1px solid #F0EFEB",
});

function SectionTitle({ children, style }) {
  return (
    <div style={{
      fontSize: 12, color: "#8C8A82", fontWeight: 700,
      textTransform: "uppercase", letterSpacing: 0.6,
      marginBottom: 10, marginTop: 16,
      ...style,
    }}>{children}</div>
  );
}

function Badge({ label, color = "#5E6AD2" }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: "#FFFFFF",
      background: color, padding: "2px 8px", borderRadius: 6,
    }}>{label}</span>
  );
}

function Mini({ label, value, color = "#37352F", bold = false }) {
  return (
    <div style={{
      padding: "6px 8px",
      background: "#FAFAF9", borderRadius: 6, border: "1px solid #F0EFEB",
    }}>
      <div style={{ fontSize: 9, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: bold ? 800 : 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}
