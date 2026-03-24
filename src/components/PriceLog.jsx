import { useState, useMemo } from "react";
import { formatMoney, formatDate } from "../helpers.js";
import { Card, Btn, Input, Table, Badge } from "./UI.jsx";

export const PriceLog = ({ priceLog, products, setProducts, logPrice, exchangeRate }) => {
  const getProduct = (id) => products.find(p => p.id === id);
  const [editMode, setEditMode] = useState(false);
  const [newPrices, setNewPrices] = useState({});

  const modelPrices = useMemo(() => {
    const map = {};
    products.forEach(p => {
      const key = `${p.brand}||||${p.model}`;
      if (!map[key]) map[key] = { key, brand: p.brand, model: p.model, priceUSD: p.priceUSD, count: 0 };
      map[key].count++;
    });
    return Object.values(map);
  }, [products]);

  const startEdit = () => {
    const prices = {};
    modelPrices.forEach(m => { prices[m.key] = m.priceUSD; });
    setNewPrices(prices);
    setEditMode(true);
  };

  const saveAll = () => {
    setProducts(prev => prev.map(p => {
      const key = `${p.brand}||||${p.model}`;
      const newPrice = Number(newPrices[key]);
      return newPrice && newPrice !== p.priceUSD ? { ...p, priceUSD: newPrice } : p;
    }));
    setEditMode(false);
  };

  return (
    <div>
      <h2 style={{ color: "#1a1a2e", margin: "0 0 20px", fontSize: 22 }}>Precios</h2>
      <Btn onClick={editMode ? saveAll : startEdit}>{editMode ? "Guardar" : "Editar"}</Btn>
      <Card style={{ marginTop: 20 }}>
        {modelPrices.map(m => (
          <div key={m.key} style={{ padding: "8px 0" }}>
            {editMode ? (
              <Input type="number" value={newPrices[m.key] || m.priceUSD} 
                onChange={e => setNewPrices(p => ({...p, [m.key]: e.target.value}))} 
                placeholder={String(m.priceUSD)} />
            ) : (
              <span>{m.brand} {m.model}: {m.priceUSD} USD</span>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
};
