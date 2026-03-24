import { useState, useMemo } from "react";
import { formatMoney } from "../helpers.js";
import { Card, Btn, StatCard } from "./UI.jsx";

export const WhatsAppMessage = ({ products, exchangeRate }) => {
  const [copied, setCopied] = useState(false);

  const productsWithARS = useMemo(() => 
    products.map(p => ({ ...p, priceARS: Math.round(p.priceUSD * exchangeRate) }))
  , [products, exchangeRate]);

  const message = useMemo(() => {
    let msg = "IMPORTS ZONA NORTE\n";
    msg += "WhatsApp: 11 6872 5293\n\n";
    productsWithARS.filter(p => p.stock > 0).forEach(p => {
      msg += `${p.brand} ${p.model} - ${p.flavor}: ${p.priceUSD} USD / ${p.priceARS} ARS\n`;
    });
    return msg;
  }, [productsWithARS]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div>
      <h2 style={{ color: "#1a1a2e", margin: 0, fontSize: 22 }}>Mensaje WhatsApp</h2>
      <Btn onClick={copyToClipboard} style={{ marginTop: 16, background: copied ? "#00b894" : "#25d366" }}>
        {copied ? "Copiado!" : "Copiar mensaje"}
      </Btn>
      <Card style={{ marginTop: 20, whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 12 }}>
        {message}
      </Card>
    </div>
  );
};
