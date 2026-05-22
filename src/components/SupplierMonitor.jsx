import { useState, useMemo, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { uid, formatMoney } from "../helpers.js";
import { useResponsive } from "../App.jsx";
import { Card, Btn, Input, Modal, Badge, StatCard } from "./UI.jsx";
import { BRANDS, BRAND_COLORS } from "../constants.js";
import { buildProductSalesStats } from "../productIntelligence.js";
import { matchProduct, confidenceMeta } from "../lib/fuzzyMatch.js";
import {
  parseSpreadsheetRows,
  parseTextLines,
  parsePdfText,
  enrichWithMatches,
} from "../lib/supplierParser.js";

// pdfjs-dist se carga solo cuando hace falta (modo PDF), via dynamic import,
// para no engordar el chunk inicial. El worker se setea con la URL
// resoluble por Vite en build.
async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }
  return pdfjs;
}

// Card de un item en la lista de revisión. Render compacto pero con toda
// la info: estado match, producto, tu stock, velocity, sugerencia, qty editable.
function ItemRow({ item, index, selected, qty, suggested, stat, onToggle, onQtyChange, onAddNew, onAcceptAlt }) {
  const { isMobile } = useResponsive();
  const meta = confidenceMeta(item.confidence);
  const isNew = item.confidence === "low";
  const matchedProduct = item.bestMatch?.product;

  const stockActual = stat?.product?.stock || 0;
  const velocity = stat?.velocity30dPerDay || 0;
  const daysUntilEmpty = velocity > 0 ? Math.floor(stockActual / velocity) : null;

  return (
    <div style={{
      background: selected ? "#EEF0FC" : "#FFFFFF",
      border: `1px solid ${selected ? "#5E6AD2" : "#E8E7E3"}`,
      borderRadius: 12,
      padding: isMobile ? 12 : 14,
      marginBottom: 10,
      transition: "background 0.15s, border 0.15s",
      boxSizing: "border-box",
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(index)}
          style={{
            marginTop: 2, width: 20, height: 20, accentColor: "#5E6AD2",
            cursor: "pointer", flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Línea 1: estado + producto */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: meta.color,
              padding: "2px 8px", borderRadius: 6,
              background: `${meta.color}22`,
            }}>{meta.emoji} {meta.label}</span>
            {matchedProduct ? (
              <span style={{ fontSize: 13, fontWeight: 600, color: "#37352F" }}>
                {matchedProduct.brand} {matchedProduct.model} · {matchedProduct.flavor}
              </span>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 600, color: "#E03E3E", fontStyle: "italic" }}>
                {item.brand ? item.brand + " " : ""}{item.raw}
              </span>
            )}
          </div>

          {/* Línea 2: detección bruta y candidato (solo medium) */}
          {item.confidence === "medium" && item.topMatches.length > 1 && (
            <div style={{ fontSize: 12, color: "#8C8A82", marginBottom: 6 }}>
              Proveedor: <span style={{ color: "#555247", fontStyle: "italic" }}>"{item.raw}"</span>
              {" · "}
              {item.topMatches.slice(1, 3).map((m, i) => (
                <span key={i}>
                  <button
                    onClick={() => onAcceptAlt(index, m)}
                    style={{
                      background: "none", border: "1px dashed #B1AFA7", color: "#5E6AD2",
                      padding: "1px 6px", borderRadius: 4, fontSize: 11, cursor: "pointer",
                      marginLeft: 4, fontFamily: "inherit",
                    }}
                    title={`Cambiar al match: ${m.product.flavor} (${Math.round(m.score * 100)}%)`}
                  >
                    {m.product.flavor} ({Math.round(m.score * 100)}%)
                  </button>
                </span>
              ))}
            </div>
          )}
          {isNew && (
            <div style={{ fontSize: 12, color: "#8C8A82", marginBottom: 6 }}>
              No está en tu catálogo. <button
                onClick={() => onAddNew(index)}
                style={{
                  background: "#E03E3E22", border: "1px solid #F1B8B6", color: "#E03E3E",
                  padding: "2px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                  marginLeft: 4, fontWeight: 600, fontFamily: "inherit",
                }}
              >+ Agregar al catálogo</button>
            </div>
          )}

          {/* Línea 3: stats stock/velocity + sugerencia */}
          <div style={{ display: "flex", gap: isMobile ? 8 : 14, flexWrap: "wrap", fontSize: 11, color: "#8C8A82" }}>
            <span><strong style={{ color: "#37352F" }}>Proveedor:</strong> {item.qty || "?"} u {item.priceUSD ? `· $${item.priceUSD}` : ""}</span>
            {matchedProduct && (
              <>
                <span><strong style={{ color: stockActual === 0 ? "#E03E3E" : "#37352F" }}>Tu stock: {stockActual}u</strong></span>
                {velocity > 0 && (
                  <span>Vel: <strong style={{ color: "#37352F" }}>{velocity.toFixed(1)}/d</strong>{daysUntilEmpty != null && daysUntilEmpty <= 7 ? ` (${daysUntilEmpty}d)` : ""}</span>
                )}
              </>
            )}
            {suggested > 0 && (
              <span style={{ color: "#5E6AD2", fontWeight: 700 }}>⭐ Pedir {suggested}u</span>
            )}
          </div>

          {/* Línea 4: input qty (visible solo si seleccionado) */}
          {selected && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              <label style={{ fontSize: 11, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase" }}>Pedir:</label>
              <input
                type="number"
                min="0"
                value={qty}
                onChange={e => onQtyChange(index, e.target.value)}
                style={{
                  width: 80, padding: "6px 10px", border: "1px solid #E8E7E3", borderRadius: 8,
                  fontSize: 14, fontFamily: "inherit", textAlign: "center", outline: "none",
                  background: "#FAFAF9", color: "#37352F",
                }}
              />
              <span style={{ fontSize: 12, color: "#8C8A82" }}>unidades</span>
              {item.priceUSD > 0 && (
                <span style={{ fontSize: 12, color: "#0F7B6C", fontWeight: 600 }}>
                  = USD {(qty * item.priceUSD).toFixed(2)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Modal para crear producto nuevo en el catálogo (precargado con datos del proveedor)
function AddNewProductModal({ open, item, onClose, onSave, exchangeRate }) {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [flavor, setFlavor] = useState("");
  const [puffs, setPuffs] = useState("");
  const [priceUSD, setPriceUSD] = useState(0);
  const [costUSDT, setCostUSDT] = useState(0);

  // Precargar cuando abre
  const itemRef = useRef(null);
  if (open && item && itemRef.current !== item) {
    itemRef.current = item;
    setBrand(item.brand || "");
    setModel(item.model || "");
    setFlavor(item.flavor || item.raw || "");
    setPuffs(item.puffs || "");
    setPriceUSD(0);
    setCostUSDT(item.priceUSD || 0);
  }

  const handleSave = () => {
    if (!brand || !flavor) return;
    const newProduct = {
      id: uid(),
      brand: brand.trim(),
      model: model.trim() || "—",
      flavor: flavor.trim(),
      puffs: puffs || "0",
      stock: 0,
      priceUSD: Number(priceUSD) || 0,
      priceARS: Math.round((Number(priceUSD) || 0) * (exchangeRate || 1)),
      costUSDT: Number(costUSDT) || 0,
    };
    onSave(newProduct);
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="➕ Agregar producto al catálogo">
      <p style={{ color: "#8C8A82", fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        Te precargamos los datos detectados del proveedor. Revisá y confirmá.
      </p>
      <div>
        <label style={{ fontSize: 11, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Marca</label>
        <select value={brand} onChange={e => setBrand(e.target.value)}
          style={{
            width: "100%", padding: "12px 14px", marginTop: 6, marginBottom: 12,
            background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10,
            color: "#37352F", fontSize: 16, outline: "none", boxSizing: "border-box",
            fontFamily: "inherit",
          }}>
          <option value="">— Elegir marca —</option>
          {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <Input label="Modelo" value={model} onChange={e => setModel(e.target.value)} placeholder="Ej: TE, BM6000, Pulse" />
        <Input label="Sabor" value={flavor} onChange={e => setFlavor(e.target.value)} placeholder="Ej: Watermelon Ice" />
        <Input label="Puffs" value={puffs} onChange={e => setPuffs(e.target.value)} placeholder="Ej: 30000" />
        <Input label="Precio venta USD" type="number" step="0.01" value={priceUSD} onChange={e => setPriceUSD(e.target.value)} placeholder="0" />
        <Input label="Costo USDT (compra)" type="number" step="0.01" value={costUSDT} onChange={e => setCostUSDT(e.target.value)} placeholder="0" />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Btn variant="secondary" onClick={onClose} style={{ flex: 1 }}>Cancelar</Btn>
        <Btn onClick={handleSave} style={{ flex: 1 }} disabled={!brand || !flavor}>Agregar y mantener en pedido</Btn>
      </div>
    </Modal>
  );
}

export const SupplierMonitor = ({
  products, setProducts,
  purchases, setPurchases,
  sales = [],
  exchangeRate,
  logStock,
  currentUser,
  logAudit,
}) => {
  const { isMobile } = useResponsive();

  // -------- Estado principal --------
  const [supplier, setSupplier] = useState("");
  const [mode, setMode] = useState("spreadsheet"); // "spreadsheet" | "pdf" | "text"
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [parsedItems, setParsedItems] = useState([]);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [editedQty, setEditedQty] = useState({}); // { index: number }
  const [addNewIndex, setAddNewIndex] = useState(null); // index del item para abrir modal
  const [toast, setToast] = useState(null); // { msg, color }
  const [purchaseLeadDays, setPurchaseLeadDays] = useState(30);

  const fileInputRef = useRef(null);

  // Lista de proveedores ya usados (autocompletar)
  const knownSuppliers = useMemo(() => {
    const counts = {};
    (purchases || []).forEach(p => {
      if (!p.supplier || p.isDeleted) return;
      counts[p.supplier] = (counts[p.supplier] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }, [purchases]);

  // Stats de productos (velocity, etc) — reusa S15
  const productStats = useMemo(
    () => buildProductSalesStats(products, sales, exchangeRate),
    [products, sales, exchangeRate]
  );

  // -------- Procesar archivos / texto --------
  const showToast = useCallback((msg, color = "#0F7B6C") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const processItems = useCallback((items) => {
    const knownBrands = Array.from(new Set(products.map(p => p.brand).filter(Boolean)));
    // Reproc para inferir brand en items de texto que no la tienen
    const processed = items.map(it => {
      if (it.brand) return it;
      // Buscar brand como substring del raw
      const matched = knownBrands.find(b => {
        const normB = b.toLowerCase().replace(/\s+/g, "");
        return (it.raw || "").toLowerCase().replace(/\s+/g, "").includes(normB);
      });
      return matched ? { ...it, brand: matched } : it;
    });
    const enriched = enrichWithMatches(processed, products.filter(p => !p.isDeleted), matchProduct);
    setParsedItems(enriched);

    // Auto-seleccionar items con confidence high y que tengan algo de demanda
    const auto = new Set();
    const qtyMap = {};
    enriched.forEach((it, idx) => {
      const stat = it.bestMatch ? productStats[it.bestMatch.product.id] : null;
      const velocity = stat?.velocity30dPerDay || 0;
      const stock = stat?.product?.stock || 0;
      const suggested = velocity > 0
        ? Math.max(0, Math.ceil(velocity * (purchaseLeadDays + 30 + 7)) - stock)
        : 0;
      qtyMap[idx] = suggested > 0 ? suggested : (it.qty || 0);
      if (it.confidence === "high" && (suggested > 0 || velocity > 0)) {
        auto.add(idx);
      }
    });
    setSelectedIndices(auto);
    setEditedQty(qtyMap);
    const highCount = enriched.filter(i => i.confidence === "high").length;
    const medCount = enriched.filter(i => i.confidence === "medium").length;
    const newCount = enriched.filter(i => i.confidence === "low").length;
    showToast(`✅ Detecté ${enriched.length} items: ${highCount} OK · ${medCount} a revisar · ${newCount} nuevos`);
  }, [products, productStats, purchaseLeadDays, showToast]);

  const handleSpreadsheetFile = useCallback(async (file) => {
    setProcessing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const items = parseSpreadsheetRows(rows);
      if (items.length === 0) {
        // Si no devolvió nada (sin headers), reintentamos como array of arrays
        const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        const fallback = parseSpreadsheetRows(rawRows);
        processItems(fallback);
      } else {
        processItems(items);
      }
    } catch (e) {
      console.error("[SupplierMonitor] Error procesando Excel:", e);
      showToast("❌ No pude leer el archivo. Verificá que sea .xlsx o .csv válido.", "#E03E3E");
    } finally {
      setProcessing(false);
    }
  }, [processItems, showToast]);

  const handlePdfFile = useCallback(async (file) => {
    setProcessing(true);
    try {
      const pdfjs = await loadPdfJs();
      const buf = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(it => it.str).join(" ");
        fullText += pageText + "\n";
      }
      const knownBrands = Array.from(new Set(products.map(p => p.brand).filter(Boolean)));
      const items = parsePdfText(fullText, { knownBrands });
      processItems(items);
    } catch (e) {
      console.error("[SupplierMonitor] Error procesando PDF:", e);
      showToast("❌ No pude leer el PDF. Probá copiar el texto y pegarlo en modo Texto.", "#E03E3E");
    } finally {
      setProcessing(false);
    }
  }, [processItems, showToast, products]);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (mode === "spreadsheet" || /\.(xlsx?|csv)$/i.test(file.name)) {
      handleSpreadsheetFile(file);
    } else if (mode === "pdf" || /\.pdf$/i.test(file.name)) {
      handlePdfFile(file);
    } else {
      showToast("❌ Formato no reconocido. Subí .xlsx, .csv o .pdf", "#E03E3E");
    }
  }, [mode, handleSpreadsheetFile, handlePdfFile, showToast]);

  const handleProcessText = useCallback(() => {
    if (!rawText.trim()) {
      showToast("Pegá el texto del proveedor primero", "#CB912F");
      return;
    }
    setProcessing(true);
    try {
      const knownBrands = Array.from(new Set(products.map(p => p.brand).filter(Boolean)));
      const items = parseTextLines(rawText, { knownBrands });
      if (items.length === 0) {
        showToast("No detecté ítems. Revisá el formato del texto.", "#CB912F");
        return;
      }
      processItems(items);
    } finally {
      setProcessing(false);
    }
  }, [rawText, products, processItems, showToast]);

  // -------- Handlers de items --------
  const toggleSelect = useCallback((index) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const updateQty = useCallback((index, val) => {
    setEditedQty(prev => ({ ...prev, [index]: Number(val) || 0 }));
  }, []);

  const acceptAltMatch = useCallback((index, alt) => {
    setParsedItems(prev => prev.map((it, i) => {
      if (i !== index) return it;
      // Reordenar topMatches con alt al frente
      const newTop = [alt, ...it.topMatches.filter(m => m.product.id !== alt.product.id)];
      return {
        ...it,
        topMatches: newTop,
        bestMatch: alt,
        confidence: "high", // si el usuario confirma manualmente, lo marcamos high
      };
    }));
  }, []);

  const handleAddNewProduct = useCallback((newProduct) => {
    setProducts(prev => [...prev, newProduct]);
    // Reemplazar el item nuevo con un match high al producto recién creado
    setParsedItems(prev => prev.map((it, i) => {
      if (i !== addNewIndex) return it;
      return {
        ...it,
        topMatches: [{ product: newProduct, score: 1, confidence: "high", breakdown: {} }],
        bestMatch: { product: newProduct, score: 1, confidence: "high", breakdown: {} },
        confidence: "high",
      };
    }));
    // Marcar como seleccionado
    setSelectedIndices(prev => new Set([...prev, addNewIndex]));
    setAddNewIndex(null);
    if (logAudit) logAudit("create", "product", newProduct.id, `Producto creado desde SupplierMonitor: ${newProduct.brand} ${newProduct.model} ${newProduct.flavor}`);
    showToast(`✅ ${newProduct.flavor} agregado al catálogo`);
  }, [addNewIndex, setProducts, logAudit, showToast]);

  // -------- Items seleccionados (resumen y export) --------
  const selectedRows = useMemo(() => {
    return Array.from(selectedIndices)
      .map(idx => ({ idx, item: parsedItems[idx], qty: editedQty[idx] || 0 }))
      .filter(r => r.item && r.qty > 0);
  }, [selectedIndices, parsedItems, editedQty]);

  const totals = useMemo(() => {
    const totalUnits = selectedRows.reduce((s, r) => s + r.qty, 0);
    const totalUSD = selectedRows.reduce((s, r) => s + r.qty * (r.item.priceUSD || 0), 0);
    return { totalUnits, totalUSD };
  }, [selectedRows]);

  // -------- Acciones --------
  const createPurchase = useCallback(() => {
    if (selectedRows.length === 0) {
      showToast("No hay items seleccionados", "#CB912F");
      return;
    }
    if (!supplier.trim()) {
      showToast("Indicá el nombre del proveedor", "#CB912F");
      return;
    }
    // Confirmación
    const proceed = confirm(
      `Crear orden de compra para "${supplier}"?\n\n` +
      `${selectedRows.length} items · ${totals.totalUnits} unidades · ~USD ${totals.totalUSD.toFixed(2)}\n\n` +
      `La compra se creará en estado "Pedido" y NO descontará stock todavía.`
    );
    if (!proceed) return;

    // Armar groups (estructura compatible con Purchases.jsx)
    const groupsMap = {};
    selectedRows.forEach(({ item, qty }) => {
      const prod = item.bestMatch?.product;
      if (!prod) return;
      const key = `${prod.brand}|||${prod.model}|||${prod.puffs}`;
      if (!groupsMap[key]) {
        groupsMap[key] = {
          brand: prod.brand, model: prod.model, puffs: prod.puffs,
          modelKey: key, unitCostUSDT: item.priceUSD || prod.costUSDT || 0,
          flavors: [],
        };
      }
      groupsMap[key].flavors.push({
        name: prod.flavor,
        qty,
        productId: prod.id,
        isNew: false,
      });
    });
    const groups = Object.values(groupsMap);
    const items = selectedRows
      .filter(r => r.item.bestMatch?.product)
      .map(r => ({
        productId: r.item.bestMatch.product.id,
        qty: r.qty,
        unitCostUSDT: r.item.priceUSD || r.item.bestMatch.product.costUSDT || 0,
      }));
    const productsUSDT = items.reduce((s, i) => s + i.qty * Number(i.unitCostUSDT || 0), 0);

    const newId = uid();
    const newPurchase = {
      id: newId,
      supplier: supplier.trim(),
      loteNumber: "",
      date: new Date().toISOString().slice(0, 10),
      status: "pedido",
      groups,
      items,
      totalItems: totals.totalUnits,
      totalUSDT: productsUSDT,
      totalUSDTpaid: productsUSDT,
      totalCostARS: Math.round(productsUSDT * (exchangeRate || 1)),
      supplierCommUSDT: 0,
      paseroCostARS: 0,
      envioCostARS: 0,
      notes: `Generado desde Monitor de Proveedores`,
      statusHistory: [{
        status: "pedido",
        timestamp: new Date().toISOString(),
        note: "Creado desde Monitor de Proveedores",
        user: currentUser?.name || "?",
      }],
      createdBy: currentUser?.name || "",
    };
    setPurchases(prev => [newPurchase, ...prev]);
    if (logAudit) logAudit("create", "purchase", newId, `Pedido creado desde Monitor: ${supplier} · ${totals.totalUnits} unidades`);
    showToast(`✅ Pedido creado para ${supplier}. Andá a Compras para ver el detalle.`);
    // Reset
    setSelectedIndices(new Set());
    setParsedItems([]);
    setRawText("");
    setFileName("");
  }, [selectedRows, supplier, totals, exchangeRate, currentUser, setPurchases, logAudit, showToast]);

  const exportExcel = useCallback(() => {
    if (selectedRows.length === 0) {
      showToast("No hay items seleccionados", "#CB912F");
      return;
    }
    const rows = selectedRows.map(({ item, qty }) => {
      const p = item.bestMatch?.product;
      return {
        "Marca": p?.brand || item.brand || "",
        "Modelo": p?.model || item.model || "",
        "Sabor": p?.flavor || item.raw || "",
        "Puffs": p?.puffs || item.puffs || "",
        "Cantidad": qty,
        "Precio USD": item.priceUSD || "",
        "Subtotal USD": (qty * (item.priceUSD || 0)).toFixed(2),
      };
    });
    rows.push({
      "Marca": "", "Modelo": "", "Sabor": "TOTAL", "Puffs": "",
      "Cantidad": totals.totalUnits, "Precio USD": "", "Subtotal USD": totals.totalUSD.toFixed(2),
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedido");
    const dateStr = new Date().toISOString().slice(0, 10);
    const safeSupplier = (supplier || "Proveedor").replace(/[^a-zA-Z0-9_-]/g, "_");
    XLSX.writeFile(wb, `Pedido_${safeSupplier}_${dateStr}.xlsx`);
    showToast("✅ Excel descargado");
  }, [selectedRows, totals, supplier, showToast]);

  const exportPdf = useCallback(() => {
    if (selectedRows.length === 0) {
      showToast("No hay items seleccionados", "#CB912F");
      return;
    }
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const margin = 15;
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("ORDEN DE COMPRA", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Proveedor: ${supplier || "—"}`, margin, y);
    y += 4;
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-AR")}`, margin, y);
    y += 4;
    doc.text(`Items: ${selectedRows.length} · Total unidades: ${totals.totalUnits}`, margin, y);
    y += 8;

    // Header de tabla
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y - 5, 180, 7, "F");
    doc.text("Marca", margin + 1, y);
    doc.text("Modelo", margin + 30, y);
    doc.text("Sabor", margin + 55, y);
    doc.text("Puffs", margin + 115, y);
    doc.text("Cant", margin + 135, y);
    doc.text("$U", margin + 150, y);
    doc.text("Subtotal", margin + 165, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    selectedRows.forEach(({ item, qty }, i) => {
      if (y > 270) {
        doc.addPage();
        y = margin;
      }
      const p = item.bestMatch?.product;
      const subtotal = (qty * (item.priceUSD || 0)).toFixed(2);
      if (i % 2 === 1) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, y - 4, 180, 6, "F");
      }
      doc.text((p?.brand || item.brand || "").slice(0, 14), margin + 1, y);
      doc.text((p?.model || item.model || "").slice(0, 12), margin + 30, y);
      doc.text((p?.flavor || item.raw || "").slice(0, 32), margin + 55, y);
      doc.text(String(p?.puffs || item.puffs || ""), margin + 115, y);
      doc.text(String(qty), margin + 135, y);
      doc.text(item.priceUSD ? `$${item.priceUSD}` : "—", margin + 150, y);
      doc.text(`$${subtotal}`, margin + 165, y);
      y += 6;
    });

    y += 4;
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL: ${totals.totalUnits} unidades · USD ${totals.totalUSD.toFixed(2)}`, margin, y);

    const dateStr = new Date().toISOString().slice(0, 10);
    const safeSupplier = (supplier || "Proveedor").replace(/[^a-zA-Z0-9_-]/g, "_");
    doc.save(`Pedido_${safeSupplier}_${dateStr}.pdf`);
    showToast("✅ PDF descargado");
  }, [selectedRows, totals, supplier, showToast]);

  const copyForWhatsApp = useCallback(async () => {
    if (selectedRows.length === 0) {
      showToast("No hay items seleccionados", "#CB912F");
      return;
    }
    const lines = [`Hola! Necesito pedirte:`, ""];
    const grouped = {};
    selectedRows.forEach(({ item, qty }) => {
      const p = item.bestMatch?.product;
      const brand = p?.brand || item.brand || "?";
      if (!grouped[brand]) grouped[brand] = [];
      grouped[brand].push({
        name: `${p?.model || ""} ${p?.flavor || item.raw || ""}`.trim(),
        qty,
      });
    });
    for (const [brand, items] of Object.entries(grouped)) {
      lines.push(`*${brand}*`);
      items.forEach(({ name, qty }) => lines.push(`• ${qty}x ${name}`));
      lines.push("");
    }
    lines.push(`Total: ${totals.totalUnits} unidades${totals.totalUSD > 0 ? ` · ~USD ${totals.totalUSD.toFixed(0)}` : ""}`);
    lines.push("");
    lines.push("Gracias!");
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("✅ Copiado al portapapeles — pegalo en WhatsApp");
    } catch (e) {
      // Fallback: mostrar el texto en un alert (no ideal pero funciona)
      console.error(e);
      prompt("Copiá esto:", text);
    }
  }, [selectedRows, totals, showToast]);

  // -------- Render --------
  return (
    <div style={{ padding: isMobile ? "12px" : "20px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: "#37352F", margin: 0, letterSpacing: "-0.5px" }}>
          📋 Monitor de Proveedores
        </h1>
        <p style={{ color: "#8C8A82", fontSize: 13, margin: "6px 0 0" }}>
          Subí la lista de stock de tu proveedor (Excel, PDF o texto) y el sistema te dice qué te conviene pedir.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 70, right: 16, zIndex: 200,
          padding: "10px 16px", borderRadius: 10,
          background: "#FFFFFF", border: `1px solid ${toast.color}`,
          color: toast.color, fontSize: 13, fontWeight: 600,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          maxWidth: isMobile ? "calc(100vw - 32px)" : 400,
        }}>{toast.msg}</div>
      )}

      {/* Inputs principales */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12, alignItems: isMobile ? "stretch" : "flex-end" }}>
          {/* Proveedor */}
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Proveedor</label>
            <input
              list="known-suppliers"
              value={supplier}
              onChange={e => setSupplier(e.target.value)}
              placeholder="Ej: Paraguay 1, Pesos Online…"
              style={{
                width: "100%", padding: isMobile ? "12px 14px" : "10px 12px",
                minHeight: isMobile ? 44 : 38,
                background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10,
                color: "#37352F", fontSize: isMobile ? 16 : 14,
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
            <datalist id="known-suppliers">
              {knownSuppliers.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          {/* Lead days */}
          <div style={{ width: isMobile ? "100%" : 160 }}>
            <label style={{ fontSize: 11, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }} title="Días que tarda en llegar el envío. Afecta la qty sugerida.">Lead time (días)</label>
            <input
              type="number"
              min="1"
              value={purchaseLeadDays}
              onChange={e => setPurchaseLeadDays(Number(e.target.value) || 30)}
              style={{
                width: "100%", padding: isMobile ? "12px 14px" : "10px 12px",
                minHeight: isMobile ? 44 : 38,
                background: "#FAFAF9", border: "1px solid #E8E7E3", borderRadius: 10,
                color: "#37352F", fontSize: isMobile ? 16 : 14,
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
          </div>
        </div>

        {/* Selector de modo */}
        <div style={{ display: "flex", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
          {[
            { key: "spreadsheet", label: "📊 Excel/CSV", desc: "Lista estructurada" },
            { key: "pdf", label: "📄 PDF", desc: "Catálogo PDF" },
            { key: "text", label: "📝 Texto", desc: "Pegado de WhatsApp" },
          ].map(m => (
            <button
              key={m.key}
              onClick={() => { setMode(m.key); setFileName(""); setRawText(""); setParsedItems([]); }}
              style={{
                flex: isMobile ? "1 1 40%" : "0 0 auto",
                padding: "10px 16px",
                background: mode === m.key ? "#5E6AD2" : "transparent",
                color: mode === m.key ? "#FFFFFF" : "#555247",
                border: `1px solid ${mode === m.key ? "#5E6AD2" : "#E8E7E3"}`,
                borderRadius: 10, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              <div>{m.label}</div>
              <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 500, marginTop: 2 }}>{m.desc}</div>
            </button>
          ))}
        </div>

        {/* Input según modo */}
        <div style={{ marginTop: 14 }}>
          {(mode === "spreadsheet" || mode === "pdf") && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept={mode === "spreadsheet" ? ".xlsx,.xls,.csv" : ".pdf"}
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); }}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) {
                    setFileName(f.name);
                    if (mode === "spreadsheet") handleSpreadsheetFile(f);
                    else handlePdfFile(f);
                  }
                }}
                style={{
                  padding: isMobile ? "20px 14px" : "32px 20px",
                  background: "#F5F4F0",
                  border: "2px dashed #B1AFA7",
                  borderRadius: 12,
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
              >
                <div style={{ fontSize: isMobile ? 28 : 36, marginBottom: 6 }}>📁</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#555247" }}>
                  {fileName ? fileName : `Click o arrastrá un archivo ${mode === "spreadsheet" ? ".xlsx/.csv" : ".pdf"}`}
                </div>
                <div style={{ fontSize: 12, color: "#8C8A82", marginTop: 4 }}>
                  {mode === "spreadsheet"
                    ? "El sistema detecta automáticamente las columnas (marca, modelo, sabor, cant, precio)"
                    : "Extraemos el texto del PDF y matcheamos con tu catálogo"}
                </div>
              </div>
            </div>
          )}

          {mode === "text" && (
            <div>
              <textarea
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder={`Pegá acá el texto del proveedor. Ej:\n\n- Elfbar TE Açai Banana x20 $18\n- Lost Mary BM6000 Cherry Cola (15u) $14\n- Geek Bar Pulse Mango Ice x10 $20\n`}
                style={{
                  width: "100%", minHeight: isMobile ? 140 : 180,
                  padding: 14, background: "#FAFAF9", border: "1px solid #E8E7E3",
                  borderRadius: 10, color: "#37352F", fontSize: 14,
                  outline: "none", boxSizing: "border-box",
                  fontFamily: "'SF Mono', Monaco, monospace", resize: "vertical",
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 11, color: "#8C8A82" }}>
                  💡 Si el mensaje del proveedor está muy desordenado, podés usar Claude (web/app) para convertirlo a CSV primero, después pegalo acá.
                </div>
                <Btn onClick={handleProcessText} disabled={processing || !rawText.trim()}>
                  {processing ? "Procesando..." : "Procesar texto"}
                </Btn>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Resultados */}
      {processing && (
        <Card>
          <div style={{ textAlign: "center", padding: 20 }}>
            <span style={{ color: "#5E6AD2", fontSize: 14, fontWeight: 600 }}>Procesando...</span>
          </div>
        </Card>
      )}

      {!processing && parsedItems.length > 0 && (
        <>
          {/* Stats */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <StatCard label="Items detectados" value={parsedItems.length} color="#5E6AD2" icon="📦" />
            <StatCard label="Coincide" value={parsedItems.filter(i => i.confidence === "high").length} color="#0F7B6C" icon="🟢" />
            <StatCard label="A revisar" value={parsedItems.filter(i => i.confidence === "medium").length} color="#CB912F" icon="🟡" />
            <StatCard label="Nuevos" value={parsedItems.filter(i => i.confidence === "low").length} color="#E03E3E" icon="🔴" />
          </div>

          {/* Filtros rápidos */}
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#37352F" }}>
                Revisá y elegí qué pedir ({selectedRows.length} seleccionados · {totals.totalUnits}u · USD {totals.totalUSD.toFixed(2)})
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    // Auto-select de productos con sugerencia >0
                    const auto = new Set();
                    parsedItems.forEach((it, idx) => {
                      const stat = it.bestMatch ? productStats[it.bestMatch.product.id] : null;
                      const velocity = stat?.velocity30dPerDay || 0;
                      const stock = stat?.product?.stock || 0;
                      const suggested = velocity > 0
                        ? Math.max(0, Math.ceil(velocity * (purchaseLeadDays + 30 + 7)) - stock)
                        : 0;
                      if (suggested > 0 && it.confidence !== "low") auto.add(idx);
                    });
                    setSelectedIndices(auto);
                  }}
                  style={{
                    background: "transparent", border: "1px solid #E8E7E3", color: "#5E6AD2",
                    padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                    fontWeight: 600, fontFamily: "inherit",
                  }}
                >⭐ Sugeridos por IA</button>
                <button
                  onClick={() => setSelectedIndices(new Set(parsedItems.map((_, i) => i)))}
                  style={{
                    background: "transparent", border: "1px solid #E8E7E3", color: "#555247",
                    padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                    fontWeight: 600, fontFamily: "inherit",
                  }}
                >Todos</button>
                <button
                  onClick={() => setSelectedIndices(new Set())}
                  style={{
                    background: "transparent", border: "1px solid #E8E7E3", color: "#555247",
                    padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                    fontWeight: 600, fontFamily: "inherit",
                  }}
                >Ninguno</button>
              </div>
            </div>
          </Card>

          {/* Items */}
          <div style={{ marginBottom: 16 }}>
            {parsedItems.map((item, idx) => {
              const stat = item.bestMatch ? productStats[item.bestMatch.product.id] : null;
              const stock = stat?.product?.stock || 0;
              const velocity = stat?.velocity30dPerDay || 0;
              const suggested = velocity > 0
                ? Math.max(0, Math.ceil(velocity * (purchaseLeadDays + 30 + 7)) - stock)
                : 0;
              return (
                <ItemRow
                  key={idx}
                  item={item}
                  index={idx}
                  selected={selectedIndices.has(idx)}
                  qty={editedQty[idx] ?? (suggested || item.qty || 0)}
                  suggested={suggested}
                  stat={stat}
                  onToggle={toggleSelect}
                  onQtyChange={updateQty}
                  onAddNew={i => setAddNewIndex(i)}
                  onAcceptAlt={acceptAltMatch}
                />
              );
            })}
          </div>

          {/* Acciones finales */}
          {selectedRows.length > 0 && (
            <Card style={{ position: isMobile ? "sticky" : "static", bottom: isMobile ? 0 : "auto", zIndex: 10, boxShadow: isMobile ? "0 -4px 16px rgba(0,0,0,0.1)" : "none" }}>
              <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 700, color: "#37352F" }}>
                ⚡ Listo para enviar al proveedor
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <Btn onClick={createPurchase} style={{ flex: isMobile ? "1 1 100%" : "0 1 auto" }}>
                  💾 Crear Pedido en Compras
                </Btn>
                <Btn variant="secondary" onClick={exportExcel}>
                  📥 Excel
                </Btn>
                <Btn variant="secondary" onClick={exportPdf}>
                  📄 PDF
                </Btn>
                <Btn variant="secondary" onClick={copyForWhatsApp}>
                  📋 Copiar para WhatsApp
                </Btn>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Modal agregar producto nuevo */}
      <AddNewProductModal
        open={addNewIndex !== null}
        item={addNewIndex !== null ? parsedItems[addNewIndex] : null}
        onClose={() => setAddNewIndex(null)}
        onSave={handleAddNewProduct}
        exchangeRate={exchangeRate}
      />
    </div>
  );
};
