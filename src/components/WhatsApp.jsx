import { useState, useMemo, useCallback } from "react";
import { formatMoney } from "../helpers.js";
import { Card, Btn, StatCard } from "./UI.jsx";
import { BRAND_COLORS } from "../constants.js";

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

export const WhatsAppMessage = ({ products, exchangeRate }) => {
  const [copied, setCopied] = useState(false);

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

  const message = useMemo(() => generateMessage(), [generateMessage]);

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
        <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>📲 Mensaje WhatsApp</h2>
        <Btn onClick={copyToClipboard} style={{ background: copied ? "linear-gradient(135deg, #00b894, #00cec9)" : "linear-gradient(135deg, #25d366, #128c7e)" }}>
          {copied ? "✅ Copiado!" : "📋 Copiar mensaje"}
        </Btn>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="En el mensaje" value={inStockCount} icon="✅" color="#00b894" />
        <StatCard label="Modelos activos" value={(() => {
          const models = new Set();
          productsWithDynamicARS.filter(p => p.stock > 0).forEach(p => models.add(`${p.brand}-${p.model}`));
          return models.size;
        })()} icon="📦" color="#6366f1" />
        <StatCard label="Unidades disponibles" value={productsWithDynamicARS.reduce((s, p) => s + (p.stock || 0), 0)} icon="🔥" color="#fdcb6e" />
      </div>

      <Card style={{ marginBottom: 14, background: "#f7f8fa", border: "1px solid #25d36644" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>💡</span>
          <span style={{ color: "#25d366", fontSize: 13, fontWeight: 600 }}>
            Solo aparecen los productos con stock disponible. Cuando se agota un sabor, desaparece automáticamente. Si se agota un modelo entero, se oculta la sección completa.
          </span>
        </div>
      </Card>

      <Card>
        <div style={{
          whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 13, color: "#4b5563",
          lineHeight: 1.7, maxHeight: 600, overflowY: "auto", padding: 8
        }}>
          {message.split("\n").map((line, i) => {
            const isBold = line.includes("*") && line.split("*").length >= 3;
            const isHeader = line.startsWith("🔥") || line.startsWith("*IG") || line.startsWith("📲") || line.startsWith("---");

            if (isBold) {
              const parts = line.split("*");
              return (
                <div key={i} style={{ color: isHeader ? "#6366f1" : "#1a1a2e" }}>
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
