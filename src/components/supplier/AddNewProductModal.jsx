import { useState, useRef } from "react";
import { uid } from "../../helpers.js";
import { Modal, Btn, Input } from "../UI.jsx";
import { BRANDS } from "../../constants.js";

// Modal para crear producto nuevo en el catálogo, precargado con datos del proveedor.
export function AddNewProductModal({ open, item, onClose, onSave, exchangeRate }) {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [flavor, setFlavor] = useState("");
  const [puffs, setPuffs] = useState("");
  const [priceUSD, setPriceUSD] = useState(0);
  const [costUSDT, setCostUSDT] = useState(0);

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
      <p style={{ color: "#6B7794", fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        Te precargamos los datos detectados del proveedor. Revisá y confirmá.
      </p>
      <div>
        <label style={{ fontSize: 11, color: "#6B7794", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Marca</label>
        <select value={brand} onChange={e => setBrand(e.target.value)}
          style={{
            width: "100%", padding: "12px 14px", marginTop: 6, marginBottom: 12,
            background: "#F8F2E7", border: "1px solid #E5DAC2", borderRadius: 10,
            color: "#1E2B4A", fontSize: 16, outline: "none", boxSizing: "border-box",
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
