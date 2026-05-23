import { useState, useMemo, useCallback } from "react";
import { formatMoney } from "../helpers.js";
import { Card, Btn, StatCard } from "./UI.jsx";
import { BRAND_COLORS } from "../constants.js";
import { useAppContext } from "../AppContext.js";

// -- WHATSAPP MESSAGE GENERATOR --
const FLAVOR_EMOJIS = {
  "banana": "🍌", "coconut": "🥥", "water": "💦", "ice": "🧊", "strawberry": "🍓",
  "watermelon": "🍉", "dragon": "🐉", "grape": "🍇", "apple": "🍏", "mango": "🥭",
  "kiwi": "🥝", "pineapple": "🍍", "cherry": "🍒", "blueberry": "🫐", "blue": "💙",
  "razz": "🧊", "peach": "🍑", "mint": "🌿", "menthol": "❄️", "miami": "🌴",
  "melon": "🍈", "pomegranate": "🍷", "sour": "😝", "orange": "🍊", "raspberry": "🍹",
  "lemon": "🍋", "lime": "🍋", "grapefruit": "🍋", "passion": "🥭", "guava": "🥭",
  "tigers": "🐯", "blood": "🐯", "cool": "🌿", "icy": "🧊", "splash": "💦",
  "summer": "☀️", "fuse": "🍒", "lush": "🍉", "sweet": "🍭", "hawaiian": "🥤",
  "sakura": "🌸", "red": "❤️"
};

const getFlavorEmojis = (flavor) => {
  const words = flavor.toLowerCase().split(/[\s-]+/);
  const emojis = [];
  const seen = new Set();
  words.forEach(w => {
    const e = FLAVOR_EMOJIS[w];
    if (e && !seen.has(e)) { emojis.push(e); seen.add(e); }
  });
  return emojis.join("") || "💨";
};

// POC de migración props-drilling → AppContext.
// exchangeRate ahora se consume via useAppContext() en lugar de recibirse como prop.
// App.jsx mantiene el prop por compat pero se puede ignorar acá.
export const WhatsAppMessage = ({ products }) => {
  const { exchangeRate } = useAppContext();
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState("full"); // "full" | "short" | "custom"
  const [customTemplates, setCustomTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem("vapestock_waTemplates") || "[]"); } catch { return []; }
  });
  const [activeTemplateId, setActiveTemplateId] = useState(null);

  // Calculate dynamic ARS prices
  const productsWithDynamicARS = useMemo(() => 
    products.map(p => ({ ...p, priceARS: Math.round(p.priceUSD * exchangeRate) }))
  , [products, exchangeRate]);

  const generateMessage = useCallback(() => {
    const groups = {};
    productsWithDynamicARS.forEach(p => {
      const key = `${p.brand}|||${p.model}|||${p.puffs}|||${p.priceUSD}|||${p.priceARS}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });

    // Define the display order
    const brandOrder = ["Elfbar", "Geek Bar", "Ignite", "Lost Mary", "Nikbar", "Supreme"];
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const [brandA] = a.split("|||");
      const [brandB] = b.split("|||");
      const iA = brandOrder.indexOf(brandA);
      const iB = brandOrder.indexOf(brandB);
      if (iA !== iB) return (iA === -1 ? 999 : iA) - (iB === -1 ? 999 : iB);
      return a.localeCompare(b);
    });

    let msg = `🔥 IMPORTS ZONA NORTE 🔥\n`;
    msg += `*IG: @imports.zonanorte*\n\n`;
    msg += `📲 WhatsApp: 11 6872 5293 / 11 3698 4001\n\n`;
    msg += `*📥 Grupo exclusivo de promos y pedidos:* https://chat.whatsapp.com/D5Ar7LO7awNKNc98BChdzz\n\n`;
    msg += `💸 Todos los métodos de pago\n`;
    msg += `✅ Productos 100% originales e importados\n`;
    msg += `📦 Venta mayorista y minorista\n`;
    msg += `🔁 Stock nuevo TODAS las semanas\n`;
    msg += `🛠 Garantía de 48hs\n`;
    msg += `🚚 Envíos y retiros GRATIS en Nordelta y Pacheco\n`;
    msg += `✈️ Envíos a todo el país\n\n`;
    msg += `-----------------------------------------\n\n`;

    sortedKeys.forEach(key => {
      const [brand, model, puffs, priceUSD, priceARS] = key.split("|||");
      const items = groups[key];

      // Only show products with stock > 0
      const inStock = items.filter(p => p.stock > 0).sort((a, b) => a.flavor.localeCompare(b.flavor));
      
      // Skip entire model if nothing in stock
      if (inStock.length === 0) return;

      // Model header
      const puffsFormatted = Number(puffs).toLocaleString("es-AR");
      let iceTag = model.toLowerCase().includes("ice") ? " 🧊" : "";
      msg += `*${brand.toUpperCase()} ${model}${iceTag} – ${puffsFormatted} PUFFS* 💨\n`;
      msg += `💰 ${priceUSD} USD / $${Number(priceARS).toLocaleString("es-AR")}\n\n`;

      inStock.forEach(p => {
        const emojis = getFlavorEmojis(p.flavor);
        msg += `* ${p.flavor} ${emojis}\n`;
      });

      msg += `\n`;
    });

    return msg.trim();
  }, [productsWithDynamicARS]);

  const fullMessage = useMemo(() => generateMessage(), [generateMessage]);

  // Short version for IG stories / status
  const shortMessage = useMemo(() => {
    const groups = {};
    productsWithDynamicARS.filter(p => p.stock > 0).forEach(p => {
      const key = `${p.brand}|||${p.model}|||${p.puffs}|||${p.priceARS}`;
      if (!groups[key]) groups[key] = 0;
      groups[key] += p.stock;
    });
    let msg = `🔥 IMPORTS ZONA NORTE 🔥\n\n`;
    msg += `📦 STOCK DISPONIBLE:\n\n`;
    Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])).forEach(([key, stock]) => {
      const [brand, model, puffs, priceARS] = key.split("|||");
      msg += `✅ ${brand} ${model} ${Number(puffs).toLocaleString("es-AR")}p — $${Number(priceARS).toLocaleString("es-AR")} (${stock} uds)\n`;
    });
    msg += `\n📲 11 6872 5293 / 11 3698 4001\n`;
    msg += `📥 Envíos a todo el país\n`;
    msg += `IG: @imports.zonanorte`;
    return msg;
  }, [productsWithDynamicARS]);

  // Persiste templates custom en localStorage
  const persistTemplates = (next) => {
    setCustomTemplates(next);
    try { localStorage.setItem("vapestock_waTemplates", JSON.stringify(next)); } catch {}
  };
  const saveCurrentAsTemplate = () => {
    const name = prompt("Nombre del template (ej: 'Promo viernes'):");
    if (!name || !name.trim()) return;
    const baseMessage = mode === "short" ? shortMessage : fullMessage;
    const next = [...customTemplates, { id: Date.now().toString(36), name: name.trim(), body: baseMessage }];
    persistTemplates(next);
    setActiveTemplateId(next[next.length - 1].id);
    setMode("custom");
  };
  const deleteTemplate = (id) => {
    if (!confirm("¿Eliminar este template?")) return;
    persistTemplates(customTemplates.filter(t => t.id !== id));
    if (activeTemplateId === id) {
      setActiveTemplateId(null);
      setMode("full");
    }
  };
  const updateActiveTemplate = (newBody) => {
    if (!activeTemplateId) return;
    persistTemplates(customTemplates.map(t => t.id === activeTemplateId ? { ...t, body: newBody } : t));
  };
  const activeTemplate = customTemplates.find(t => t.id === activeTemplateId);
  const message = mode === "full" ? fullMessage
    : mode === "short" ? shortMessage
    : (activeTemplate?.body || fullMessage);

  const inStockCount = productsWithDynamicARS.filter(p => p.stock > 0).length;
  const outStockCount = products.filter(p => p.stock === 0).length;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = message;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ color: "#1E2B4A", margin: 0, fontSize: 22 }}>📲 Mensaje WhatsApp</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4, background: "#E5DAC2", borderRadius: 8, padding: 3 }}>
            <button onClick={() => setMode("full")} style={{
              padding: "5px 12px", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: mode === "full" ? "#FFFFFF" : "transparent", color: mode === "full" ? "#25d366" : "#6B7794",
              boxShadow: mode === "full" ? "0 1px 3px rgba(0,0,0,0.08)" : "none"
            }}>Completo</button>
            <button onClick={() => setMode("short")} style={{
              padding: "5px 12px", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: mode === "short" ? "#FFFFFF" : "transparent", color: mode === "short" ? "#e1306c" : "#6B7794",
              boxShadow: mode === "short" ? "0 1px 3px rgba(0,0,0,0.08)" : "none"
            }}>Stories</button>
          </div>
          <button onClick={saveCurrentAsTemplate} style={{
            padding: "5px 10px", borderRadius: 6, border: "1px solid #1E2B4A",
            background: "#1E2B4A15", color: "#1E2B4A", fontSize: 11, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }} title="Guardar mensaje actual como template reutilizable">★ Guardar template</button>
          <Btn onClick={copyToClipboard} style={{ background: copied ? "linear-gradient(135deg, #00b894, #00cec9)" : "linear-gradient(135deg, #25d366, #128c7e)" }}>
            {copied ? "✅ Copiado!" : "📋 Copiar"}
          </Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="En el mensaje" value={inStockCount} icon="✅" color="#00b894" />
        <StatCard label="Modelos activos" value={(() => {
          const models = new Set();
          productsWithDynamicARS.filter(p => p.stock > 0).forEach(p => models.add(`${p.brand}-${p.model}`));
          return models.size;
        })()} icon="📦" color="#1E2B4A" />
        <StatCard label="Unidades disponibles" value={productsWithDynamicARS.reduce((s, p) => s + (p.stock || 0), 0)} icon="🔥" color="#fdcb6e" />
      </div>

      <Card style={{ marginBottom: 14, background: "#F8F2E7", border: "1px solid #25d36644" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>💡</span>
          <span style={{ color: "#25d366", fontSize: 13, fontWeight: 600 }}>
            Solo aparecen los productos con stock disponible. Cuando se agota un sabor, desaparece automáticamente. Si se agota un modelo entero, se oculta la sección completa.
          </span>
        </div>
      </Card>

      {customTemplates.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <h4 style={{ margin: "0 0 10px", fontSize: 12, color: "#1E2B4A", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
            ⭐ Templates guardados
          </h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {customTemplates.map(t => {
              const isActive = mode === "custom" && activeTemplateId === t.id;
              return (
                <span key={t.id} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "5px 8px 5px 10px", borderRadius: 999,
                  background: isActive ? "#EAECF9" : "#F8F2E7",
                  border: `1px solid ${isActive ? "#1E2B4A" : "#E5DAC2"}`,
                }}>
                  <button onClick={() => { setActiveTemplateId(t.id); setMode("custom"); }} style={{
                    background: "transparent", border: "none", color: isActive ? "#1E2B4A" : "#1E2B4A",
                    cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0, fontFamily: "inherit",
                  }}>{t.name}</button>
                  <button onClick={() => deleteTemplate(t.id)} style={{
                    background: "transparent", border: "none", color: "#6B7794",
                    cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1,
                  }} aria-label="Eliminar template">×</button>
                </span>
              );
            })}
          </div>
          {mode === "custom" && activeTemplate && (
            <textarea
              value={activeTemplate.body}
              onChange={e => updateActiveTemplate(e.target.value)}
              rows={8}
              style={{
                width: "100%", marginTop: 10, padding: 10, borderRadius: 6,
                border: "1px solid #E5DAC2", fontSize: 13, fontFamily: "monospace",
                background: "#FFF", color: "#1E2B4A", resize: "vertical", outline: "none",
                boxSizing: "border-box",
              }}
            />
          )}
        </Card>
      )}
      <Card>
        <div style={{
          whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 13, color: "#3A4868",
          lineHeight: 1.7, maxHeight: 600, overflowY: "auto", padding: 8
        }}>
          {message.split("\n").map((line, i) => {
            const isBold = line.includes("*") && line.split("*").length >= 3;
            const isHeader = line.startsWith("🔥") || line.startsWith("*IG") || line.startsWith("📲") || line.startsWith("---");

            if (isBold) {
              const parts = line.split("*");
              return (
                <div key={i} style={{ color: isHeader ? "#1E2B4A" : "#1E2B4A" }}>
                  {parts.map((part, j) => j % 2 === 1
                    ? <strong key={j}>{part}</strong>
                    : <span key={j}>{part}</span>
                  )}
                </div>
              );
            }

            return <div key={i}>{line}</div>;
          })}
        </div>
      </Card>
    </div>
  );
};
