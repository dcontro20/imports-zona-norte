import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { uid } from "../../helpers.js";
import { useResponsive } from "../../App.jsx";
import { Card, Btn, StatCard, Modal } from "../UI.jsx";
import { buildProductSalesStats } from "../../productIntelligence.js";
import {
  processSpreadsheetFile,
  processPdfFile,
  enrichItems,
} from "./processHelpers.js";
import { parseTextLines } from "../../lib/supplierParser.js";
import {
  activeProfiles,
  computeSupplierStats,
  buildAlias,
  upsertAlias,
  buildListEntry,
  priceHistoryForProductInSupplier,
} from "../../lib/supplierProfiles.js";
import { ItemRow } from "./ItemRow.jsx";
import { AddNewProductModal } from "./AddNewProductModal.jsx";
import { SupplierProfileCard } from "./SupplierProfileCard.jsx";
import { SupplierProfileModal } from "./SupplierProfileModal.jsx";
import { SupplierBadge } from "./Sparkline.jsx";

// Tab 1: Procesar una lista de proveedor.
//
// El usuario:
//   1. Elige un perfil (o crea uno)
//   2. Carga lista (Excel/PDF/texto)
//   3. Sistema enriquece con aliases conocidos y fuzzy match
//   4. Revisa, corrige, ajusta qty
//   5. Decide acción: crear Purchase, exportar Excel/PDF, WhatsApp
//
// Aprendizaje automático:
//   - Cuando el usuario acepta un match alternativo → se crea alias
//   - Cuando agrega producto nuevo al catálogo → se crea alias
//   - Cuando se crea Purchase → se guarda lista en historial
export function ProcessTab({
  products,
  setProducts,
  purchases,
  setPurchases,
  sales = [],
  exchangeRate,
  currentUser,
  logAudit,
  supplierProfiles = [],
  setSupplierProfiles,
  supplierAliases = [],
  setSupplierAliases,
  supplierLists = [],
  setSupplierLists,
  showToast,
}) {
  const { isMobile } = useResponsive();
  const profiles = useMemo(() => activeProfiles(supplierProfiles), [supplierProfiles]);

  // ----- State principal -----
  const [activeProfileId, setActiveProfileId] = useState("");
  const [mode, setMode] = useState("spreadsheet");
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [parsedItems, setParsedItems] = useState([]);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [editedQty, setEditedQty] = useState({});
  const [addNewIndex, setAddNewIndex] = useState(null);
  const [createProfileOpen, setCreateProfileOpen] = useState(false);

  // Filtros tabla
  const [filterConfidence, setFilterConfidence] = useState("");
  const [filterText, setFilterText] = useState("");
  const [filterOnlyWithSuggestion, setFilterOnlyWithSuggestion] = useState(false);

  const fileInputRef = useRef(null);

  const activeProfile = useMemo(
    () => profiles.find(p => p.id === activeProfileId) || null,
    [profiles, activeProfileId]
  );

  const purchaseLeadDays = activeProfile?.defaultLeadDays || 30;

  // Stats S15
  const productStats = useMemo(
    () => buildProductSalesStats(products, sales, exchangeRate),
    [products, sales, exchangeRate]
  );

  // Auto-seleccionar primer perfil si hay uno solo
  useEffect(() => {
    if (profiles.length === 1 && !activeProfileId) {
      setActiveProfileId(profiles[0].id);
    }
  }, [profiles, activeProfileId]);

  // ----- Procesamiento -----
  const processItems = useCallback((items) => {
    const enriched = enrichItems(items, products, supplierAliases, activeProfileId);
    setParsedItems(enriched);

    // Auto-seleccionar items con sugerencia >0 o ya conocidos (alias) + high confidence
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
      if ((it.confidence === "high" || it.fromAlias) && (suggested > 0)) {
        auto.add(idx);
      }
    });
    setSelectedIndices(auto);
    setEditedQty(qtyMap);

    const aliasCount = enriched.filter(i => i.fromAlias).length;
    const highCount = enriched.filter(i => i.confidence === "high" && !i.fromAlias).length;
    const medCount = enriched.filter(i => i.confidence === "medium").length;
    const newCount = enriched.filter(i => i.confidence === "low").length;
    const parts = [];
    if (aliasCount) parts.push(`🧠 ${aliasCount} aprendidos`);
    if (highCount) parts.push(`🟢 ${highCount} OK`);
    if (medCount) parts.push(`🟡 ${medCount} a revisar`);
    if (newCount) parts.push(`🔴 ${newCount} nuevos`);
    showToast?.(`✅ ${enriched.length} items detectados: ${parts.join(" · ")}`);
  }, [products, productStats, purchaseLeadDays, supplierAliases, activeProfileId, showToast]);

  const handleSpreadsheetFile = useCallback(async (file) => {
    setProcessing(true);
    try {
      const items = await processSpreadsheetFile(file);
      processItems(items);
    } catch (e) {
      console.error(e);
      showToast?.("❌ No pude leer el archivo", "#E03E3E");
    } finally {
      setProcessing(false);
    }
  }, [processItems, showToast]);

  const handlePdfFile = useCallback(async (file) => {
    setProcessing(true);
    try {
      const knownBrands = Array.from(new Set(products.map(p => p.brand).filter(Boolean)));
      const items = await processPdfFile(file, knownBrands);
      processItems(items);
    } catch (e) {
      console.error(e);
      showToast?.("❌ No pude leer el PDF", "#E03E3E");
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
    }
  }, [mode, handleSpreadsheetFile, handlePdfFile]);

  const handleProcessText = useCallback(() => {
    if (!rawText.trim()) {
      showToast?.("Pegá el texto del proveedor primero", "#CB912F");
      return;
    }
    setProcessing(true);
    try {
      const knownBrands = Array.from(new Set(products.map(p => p.brand).filter(Boolean)));
      const items = parseTextLines(rawText, { knownBrands });
      if (items.length === 0) {
        showToast?.("No detecté ítems. Revisá el formato.", "#CB912F");
        return;
      }
      processItems(items);
    } finally {
      setProcessing(false);
    }
  }, [rawText, products, processItems, showToast]);

  // ----- Items handlers + APRENDIZAJE -----
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
    const item = parsedItems[index];
    setParsedItems(prev => prev.map((it, i) => {
      if (i !== index) return it;
      const newTop = [alt, ...it.topMatches.filter(m => m.product.id !== alt.product.id)];
      return {
        ...it,
        topMatches: newTop,
        bestMatch: alt,
        confidence: "high",
        fromAlias: true, // ahora es conocido
      };
    }));
    // APRENDIZAJE: guardar alias
    if (item && item.raw && alt.product.id) {
      const alias = buildAlias(activeProfileId || null, item.raw, alt.product.id);
      setSupplierAliases(prev => upsertAlias(prev, alias));
      showToast?.(`🧠 Aprendí: "${item.raw}" → ${alt.product.flavor}`);
    }
  }, [parsedItems, activeProfileId, setSupplierAliases, showToast]);

  const handleAddNewProduct = useCallback((newProduct) => {
    setProducts(prev => [...prev, newProduct]);
    const item = parsedItems[addNewIndex];
    // APRENDIZAJE: el raw del proveedor ahora apunta al producto nuevo
    if (item && item.raw) {
      const alias = buildAlias(activeProfileId || null, item.raw, newProduct.id);
      setSupplierAliases(prev => upsertAlias(prev, alias));
    }
    setParsedItems(prev => prev.map((it, i) => {
      if (i !== addNewIndex) return it;
      const newMatch = { product: newProduct, score: 1, confidence: "high", breakdown: {} };
      return {
        ...it,
        topMatches: [newMatch],
        bestMatch: newMatch,
        confidence: "high",
        fromAlias: true,
      };
    }));
    setSelectedIndices(prev => new Set([...prev, addNewIndex]));
    setAddNewIndex(null);
    if (logAudit) logAudit("create", "product", newProduct.id, `Producto creado desde Monitor: ${newProduct.brand} ${newProduct.model} ${newProduct.flavor}`);
    showToast?.(`✅ ${newProduct.flavor} agregado al catálogo y aprendido`);
  }, [addNewIndex, setProducts, logAudit, parsedItems, activeProfileId, setSupplierAliases, showToast]);

  // ----- Selección -----
  const selectedRows = useMemo(() => {
    return Array.from(selectedIndices)
      .map(idx => ({ idx, item: parsedItems[idx], qty: editedQty[idx] || 0 }))
      .filter(r => r.item && r.qty > 0);
  }, [selectedIndices, parsedItems, editedQty]);

  const totals = useMemo(() => {
    const totalUnits = selectedRows.reduce((s, r) => s + r.qty, 0);
    const totalUSD = selectedRows.reduce((s, r) => s + r.qty * (r.item.priceUSD || 0), 0);
    const totalMargin = selectedRows.reduce((s, r) => {
      const cost = r.item.priceUSD || 0;
      const sale = r.item.bestMatch?.product?.priceUSD || 0;
      return s + Math.max(0, (sale - cost) * r.qty);
    }, 0);
    return { totalUnits, totalUSD, totalMargin };
  }, [selectedRows]);

  // ----- Filtros aplicados a la tabla -----
  const filteredItems = useMemo(() => {
    return parsedItems.map((it, idx) => ({ ...it, _idx: idx })).filter(it => {
      if (filterConfidence) {
        if (filterConfidence === "alias" && !it.fromAlias) return false;
        if (filterConfidence !== "alias" && (it.fromAlias ? "high" : it.confidence) !== filterConfidence && filterConfidence !== "all") {
          if (filterConfidence === "high" && (it.fromAlias || it.confidence === "high")) return true;
          return false;
        }
      }
      if (filterText) {
        const t = filterText.toLowerCase();
        const haystack = `${it.brand || ""} ${it.bestMatch?.product?.flavor || ""} ${it.raw || ""}`.toLowerCase();
        if (!haystack.includes(t)) return false;
      }
      if (filterOnlyWithSuggestion) {
        const stat = it.bestMatch ? productStats[it.bestMatch.product.id] : null;
        const velocity = stat?.velocity30dPerDay || 0;
        const stock = stat?.product?.stock || 0;
        const suggested = velocity > 0 ? Math.max(0, Math.ceil(velocity * (purchaseLeadDays + 30 + 7)) - stock) : 0;
        if (suggested <= 0) return false;
      }
      return true;
    });
  }, [parsedItems, filterConfidence, filterText, filterOnlyWithSuggestion, productStats, purchaseLeadDays]);

  // ----- Acciones -----
  const createPurchase = useCallback(() => {
    if (selectedRows.length === 0) {
      showToast?.("No hay items seleccionados", "#CB912F");
      return;
    }
    if (!activeProfile) {
      showToast?.("Elegí un proveedor primero", "#CB912F");
      return;
    }
    const proceed = confirm(
      `Crear orden de compra para "${activeProfile.name}"?\n\n` +
      `${selectedRows.length} items · ${totals.totalUnits} unidades · ~USD ${totals.totalUSD.toFixed(2)}\n\n` +
      `Estado: "Pedido". No descuenta stock hasta marcar como Verificado.`
    );
    if (!proceed) return;

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
        name: prod.flavor, qty, productId: prod.id, isNew: false,
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

    // Costos extras pre-cargados del perfil
    const supplierCommUSDT = Math.round(productsUSDT * (activeProfile.defaultSupplierCommPercent / 100) * 100) / 100;
    const totalUSDTwithComm = productsUSDT + supplierCommUSDT;
    const paseroARS = Math.round(totalUSDTwithComm * (exchangeRate || 1) * (activeProfile.defaultPaseroPercent / 100));
    const envioARS = Number(activeProfile.defaultEnvioCostARS) || 0;
    const totalCostARS = Math.round(totalUSDTwithComm * (exchangeRate || 1)) + paseroARS + envioARS;

    const newId = uid();
    const newPurchase = {
      id: newId,
      supplier: activeProfile.name,
      loteNumber: "",
      date: new Date().toISOString().slice(0, 10),
      status: "pedido",
      groups, items,
      totalItems: totals.totalUnits,
      totalUSDT: productsUSDT,
      supplierCommPercent: activeProfile.defaultSupplierCommPercent,
      supplierCommUSDT,
      totalUSDTpaid: totalUSDTwithComm,
      paseroPercent: activeProfile.defaultPaseroPercent,
      paseroCostARS: paseroARS,
      envioCostARS: envioARS,
      totalCostARS,
      notes: "Generado desde Monitor de Proveedores",
      statusHistory: [{
        status: "pedido",
        timestamp: new Date().toISOString(),
        note: "Creado desde Monitor",
        user: currentUser?.name || "?",
      }],
      createdBy: currentUser?.name || "",
    };
    setPurchases(prev => [newPurchase, ...prev]);

    // Guardar la lista en historial
    const listEntry = buildListEntry(
      activeProfile.id, activeProfile.name,
      parsedItems, mode, fileName
    );
    listEntry.saved = true;
    listEntry.purchaseId = newId;
    setSupplierLists(prev => [listEntry, ...prev]);

    if (logAudit) logAudit("create", "purchase", newId, `Pedido desde Monitor: ${activeProfile.name} · ${totals.totalUnits}u`);
    showToast?.(`✅ Pedido creado para ${activeProfile.name}. Mirá en Compras para gestionar.`);

    // Reset
    setSelectedIndices(new Set());
    setParsedItems([]);
    setRawText("");
    setFileName("");
  }, [selectedRows, activeProfile, totals, exchangeRate, currentUser, setPurchases, logAudit, parsedItems, mode, fileName, setSupplierLists, showToast]);

  const exportExcel = useCallback(() => {
    if (selectedRows.length === 0) { showToast?.("Sin items", "#CB912F"); return; }
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
      "Cantidad": totals.totalUnits, "Precio USD": "",
      "Subtotal USD": totals.totalUSD.toFixed(2),
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedido");
    const dateStr = new Date().toISOString().slice(0, 10);
    const safeName = (activeProfile?.name || "Proveedor").replace(/[^a-zA-Z0-9_-]/g, "_");
    XLSX.writeFile(wb, `Pedido_${safeName}_${dateStr}.xlsx`);
    showToast?.("✅ Excel descargado");
  }, [selectedRows, totals, activeProfile, showToast]);

  const exportPdf = useCallback(() => {
    if (selectedRows.length === 0) { showToast?.("Sin items", "#CB912F"); return; }
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const margin = 15;
    let y = margin;

    // Header con marca
    doc.setFillColor(94, 106, 210);
    doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("IMPORTS ZONA NORTE", margin, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Orden de Compra", margin, 22);
    y = 38;

    doc.setTextColor(55, 53, 47);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Proveedor: ${activeProfile?.name || "—"}`, margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-AR")}`, margin, y);
    y += 4;
    if (activeProfile?.contactName) {
      doc.text(`Contacto: ${activeProfile.contactName}`, margin, y);
      y += 4;
    }
    doc.text(`${selectedRows.length} items · ${totals.totalUnits} unidades`, margin, y);
    y += 10;

    // Header de tabla
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y - 5, 180, 7, "F");
    doc.setFontSize(9);
    doc.text("Marca", margin + 1, y);
    doc.text("Modelo", margin + 30, y);
    doc.text("Sabor", margin + 55, y);
    doc.text("Puffs", margin + 115, y);
    doc.text("Cant", margin + 135, y);
    doc.text("$U", margin + 150, y);
    doc.text("Subt.", margin + 165, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    selectedRows.forEach(({ item, qty }, i) => {
      if (y > 270) { doc.addPage(); y = margin; }
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
    doc.setFontSize(11);
    doc.text(`TOTAL: ${totals.totalUnits} unidades · USD ${totals.totalUSD.toFixed(2)}`, margin, y);

    const dateStr = new Date().toISOString().slice(0, 10);
    const safeName = (activeProfile?.name || "Proveedor").replace(/[^a-zA-Z0-9_-]/g, "_");
    doc.save(`Pedido_${safeName}_${dateStr}.pdf`);
    showToast?.("✅ PDF descargado");
  }, [selectedRows, totals, activeProfile, showToast]);

  const copyForWhatsApp = useCallback(async () => {
    if (selectedRows.length === 0) { showToast?.("Sin items", "#CB912F"); return; }
    const lines = [`Hola${activeProfile?.contactName ? ` ${activeProfile.contactName}` : ""}! Necesito pedirte:`, ""];
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

    // Si hay teléfono del contacto, abrir wa.me directo
    if (activeProfile?.contactPhone) {
      const cleanPhone = activeProfile.contactPhone.replace(/[^\d]/g, "");
      const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank");
      showToast?.("✅ Abriendo WhatsApp...");
    } else {
      try {
        await navigator.clipboard.writeText(text);
        showToast?.("✅ Copiado al portapapeles");
      } catch {
        prompt("Copiá esto:", text);
      }
    }
  }, [selectedRows, totals, activeProfile, showToast]);

  // ----- Render -----
  return (
    <div>
      {/* Si no hay perfil activo, mostrar selector */}
      {!activeProfile && profiles.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#37352F", marginBottom: 10 }}>
            👋 Elegí el proveedor para esta lista
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? "240px" : "280px"}, 1fr))`, gap: 10 }}>
            {profiles.map(p => (
              <div key={p.id} onClick={() => setActiveProfileId(p.id)}>
                <SupplierProfileCard profile={p} purchases={purchases} lists={supplierLists} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, textAlign: "center" }}>
            <button
              onClick={() => setCreateProfileOpen(true)}
              style={{
                background: "transparent", border: "1px dashed #5E6AD2", color: "#5E6AD2",
                padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >➕ Crear nuevo proveedor</button>
          </div>
        </Card>
      )}

      {!activeProfile && profiles.length === 0 && (
        <Card>
          <div style={{ textAlign: "center", padding: isMobile ? 24 : 40 }}>
            <div style={{ fontSize: isMobile ? 48 : 64, marginBottom: 12 }}>🏭</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#37352F", marginBottom: 6 }}>
              Empezá creando tu primer proveedor
            </div>
            <div style={{ fontSize: 13, color: "#8C8A82", maxWidth: 480, margin: "0 auto 16px" }}>
              Cada proveedor guarda sus costos típicos (comisión, pasero, envío), contacto y un diccionario que el sistema va aprendiendo lista tras lista.
            </div>
            <Btn onClick={() => setCreateProfileOpen(true)}>➕ Crear proveedor</Btn>
          </div>
        </Card>
      )}

      {activeProfile && (
        <>
          {/* Profile card activo (compact) */}
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <SupplierBadge name={activeProfile.name} color={activeProfile.color} />
                <span style={{ fontSize: 11, color: "#8C8A82" }}>
                  Lead {activeProfile.defaultLeadDays}d · Comisión {activeProfile.defaultSupplierCommPercent}% · Pasero {activeProfile.defaultPaseroPercent}%
                </span>
              </div>
              <button
                onClick={() => setActiveProfileId("")}
                style={{
                  background: "transparent", border: "1px solid #E8E7E3", color: "#555247",
                  padding: "5px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer",
                  fontWeight: 600, fontFamily: "inherit",
                }}
              >Cambiar</button>
            </div>
          </Card>

          {/* Inputs */}
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {[
                { key: "spreadsheet", label: "📊 Excel/CSV", desc: "Lista estructurada" },
                { key: "pdf", label: "📄 PDF", desc: "Catálogo PDF" },
                { key: "text", label: "📝 Texto", desc: "Pegado WhatsApp" },
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
                  }}
                >
                  <div>{m.label}</div>
                  <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 500, marginTop: 2 }}>{m.desc}</div>
                </button>
              ))}
            </div>

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
                    background: "#F5F4F0", border: "2px dashed #B1AFA7",
                    borderRadius: 12, textAlign: "center", cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: isMobile ? 28 : 36, marginBottom: 6 }}>📁</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#555247" }}>
                    {fileName ? fileName : `Click o arrastrá ${mode === "spreadsheet" ? ".xlsx/.csv" : ".pdf"}`}
                  </div>
                  <div style={{ fontSize: 12, color: "#8C8A82", marginTop: 4 }}>
                    El sistema aplica el diccionario aprendido de {activeProfile.name} automáticamente
                  </div>
                </div>
              </div>
            )}

            {mode === "text" && (
              <div>
                <textarea
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  placeholder={`Pegá la lista de ${activeProfile.name}...\n\n- Elfbar TE Açai Banana x20 $18\n- Lost Mary BM6000 Cherry Cola (15u) $14`}
                  style={{
                    width: "100%", minHeight: isMobile ? 140 : 180,
                    padding: 14, background: "#FAFAF9", border: "1px solid #E8E7E3",
                    borderRadius: 10, color: "#37352F", fontSize: 14,
                    outline: "none", boxSizing: "border-box",
                    fontFamily: "'SF Mono', Monaco, monospace", resize: "vertical",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 11, color: "#8C8A82", flex: 1, minWidth: 200 }}>
                    💡 Si está muy desordenado, usá Claude para convertirlo a CSV y pegalo acá
                  </div>
                  <Btn onClick={handleProcessText} disabled={processing || !rawText.trim()}>
                    {processing ? "Procesando..." : "Procesar texto"}
                  </Btn>
                </div>
              </div>
            )}
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
              {/* Stats summary */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <StatCard label="Items" value={parsedItems.length} color="#5E6AD2" icon="📦" />
                {parsedItems.filter(i => i.fromAlias).length > 0 && (
                  <StatCard label="🧠 Aprendidos" value={parsedItems.filter(i => i.fromAlias).length} color="#5E6AD2" />
                )}
                <StatCard label="🟢 OK" value={parsedItems.filter(i => i.confidence === "high" && !i.fromAlias).length} color="#0F7B6C" />
                <StatCard label="🟡 Revisar" value={parsedItems.filter(i => i.confidence === "medium").length} color="#CB912F" />
                <StatCard label="🔴 Nuevos" value={parsedItems.filter(i => i.confidence === "low").length} color="#E03E3E" />
              </div>

              {/* Filtros + acciones bulk */}
              <Card style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      value={filterText}
                      onChange={e => setFilterText(e.target.value)}
                      placeholder="🔍 Buscar..."
                      style={{
                        padding: "8px 12px", background: "#FAFAF9", border: "1px solid #E8E7E3",
                        borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "inherit",
                        minWidth: 160,
                      }}
                    />
                    <select
                      value={filterConfidence}
                      onChange={e => setFilterConfidence(e.target.value)}
                      style={{
                        padding: "8px 12px", background: "#FAFAF9", border: "1px solid #E8E7E3",
                        borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "inherit",
                      }}
                    >
                      <option value="">Todos</option>
                      <option value="alias">🧠 Aprendidos</option>
                      <option value="high">🟢 OK</option>
                      <option value="medium">🟡 Revisar</option>
                      <option value="low">🔴 Nuevos</option>
                    </select>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555247", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={filterOnlyWithSuggestion}
                        onChange={e => setFilterOnlyWithSuggestion(e.target.checked)}
                        style={{ accentColor: "#5E6AD2" }}
                      />
                      Solo con sugerencia ⭐
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
                    <button
                      onClick={() => {
                        const auto = new Set();
                        parsedItems.forEach((it, idx) => {
                          const stat = it.bestMatch ? productStats[it.bestMatch.product.id] : null;
                          const v = stat?.velocity30dPerDay || 0;
                          const s = stat?.product?.stock || 0;
                          const sug = v > 0 ? Math.max(0, Math.ceil(v * (purchaseLeadDays + 30 + 7)) - s) : 0;
                          if (sug > 0 && it.confidence !== "low") auto.add(idx);
                        });
                        setSelectedIndices(auto);
                      }}
                      style={btn("#5E6AD2")}
                    >⭐ Sugeridos</button>
                    <button onClick={() => setSelectedIndices(new Set(filteredItems.map(i => i._idx)))} style={btn()}>Todos</button>
                    <button onClick={() => setSelectedIndices(new Set())} style={btn()}>Ninguno</button>
                  </div>
                </div>
              </Card>

              {/* Items */}
              <div style={{ marginBottom: 16 }}>
                {filteredItems.map(item => {
                  const idx = item._idx;
                  const stat = item.bestMatch ? productStats[item.bestMatch.product.id] : null;
                  const velocity = stat?.velocity30dPerDay || 0;
                  const stock = stat?.product?.stock || 0;
                  const suggested = velocity > 0
                    ? Math.max(0, Math.ceil(velocity * (purchaseLeadDays + 30 + 7)) - stock)
                    : 0;
                  const matchedId = item.bestMatch?.product?.id;
                  const history = matchedId
                    ? priceHistoryForProductInSupplier(supplierLists, activeProfile.id, matchedId)
                    : [];
                  return (
                    <ItemRow
                      key={idx}
                      item={item}
                      index={idx}
                      selected={selectedIndices.has(idx)}
                      qty={editedQty[idx] ?? (suggested || item.qty || 0)}
                      suggested={suggested}
                      stat={stat}
                      priceHistory={history}
                      onToggle={toggleSelect}
                      onQtyChange={updateQty}
                      onAddNew={i => setAddNewIndex(i)}
                      onAcceptAlt={acceptAltMatch}
                    />
                  );
                })}
              </div>

              {/* Sticky action bar */}
              {selectedRows.length > 0 && (
                <Card style={{
                  position: isMobile ? "sticky" : "static",
                  bottom: isMobile ? 0 : "auto",
                  zIndex: 10,
                  boxShadow: isMobile ? "0 -4px 16px rgba(0,0,0,0.1)" : "none",
                  background: "linear-gradient(135deg, #DDEDEA 0%, #FFFFFF 100%)",
                  border: "1px solid #B6D4CC",
                }}>
                  <div style={{ marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Items</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#37352F" }}>{selectedRows.length}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Unidades</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#37352F" }}>{totals.totalUnits}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Costo</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#37352F" }}>USD {totals.totalUSD.toFixed(0)}</div>
                    </div>
                    {totals.totalMargin > 0 && (
                      <div>
                        <div style={{ fontSize: 10, color: "#8C8A82", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Ganancia proyectada</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#0F7B6C" }}>USD {totals.totalMargin.toFixed(0)}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <Btn onClick={createPurchase} style={{ flex: isMobile ? "1 1 100%" : "0 1 auto" }}>
                      💾 Crear Pedido
                    </Btn>
                    <Btn variant="secondary" onClick={exportExcel}>📥 Excel</Btn>
                    <Btn variant="secondary" onClick={exportPdf}>📄 PDF</Btn>
                    <Btn variant="secondary" onClick={copyForWhatsApp}>
                      {activeProfile.contactPhone ? "📲 WhatsApp" : "📋 Copiar"}
                    </Btn>
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* Modales */}
      <AddNewProductModal
        open={addNewIndex !== null}
        item={addNewIndex !== null ? parsedItems[addNewIndex] : null}
        onClose={() => setAddNewIndex(null)}
        onSave={handleAddNewProduct}
        exchangeRate={exchangeRate}
      />
      <SupplierProfileModal
        open={createProfileOpen}
        profile={null}
        existingProfiles={supplierProfiles}
        onClose={() => setCreateProfileOpen(false)}
        onSave={(newProfile) => {
          setSupplierProfiles(prev => [newProfile, ...prev]);
          setActiveProfileId(newProfile.id);
          setCreateProfileOpen(false);
          showToast?.(`✅ ${newProfile.name} creado`);
        }}
      />
    </div>
  );
}

const btn = (color = "#555247") => ({
  background: "transparent", border: "1px solid #E8E7E3", color,
  padding: "6px 10px", borderRadius: 8, fontSize: 12, cursor: "pointer",
  fontWeight: 600, fontFamily: "inherit",
});
