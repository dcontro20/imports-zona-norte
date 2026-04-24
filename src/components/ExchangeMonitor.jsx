import { useState, useEffect, useCallback } from "react";
import { Card, StatCard, Badge, Btn } from "./UI";

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutos

const API_SOURCES = {
  blue: "https://dolarapi.com/v1/dolares/blue",
  oficial: "https://dolarapi.com/v1/dolares/oficial",
  mep: "https://dolarapi.com/v1/dolares/bolsa",
  cripto: "https://criptoya.com/api/usdt/ars",
};

const formatARS = (n) =>
  `$${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const Arrow = ({ dir }) => (
  <span style={{ fontSize: 14, marginRight: 4 }}>
    {dir === "up" ? "\u2191" : dir === "down" ? "\u2193" : "\u2192"}
  </span>
);

const SourceCard = ({ title, subtitle, buy, sell, spread, prev, color, updated }) => {
  const diff = prev ? sell - prev : 0;
  const dir = diff > 0 ? "up" : diff < 0 ? "down" : "same";
  const diffColor = dir === "up" ? "#E03E3E" : dir === "down" ? "#0F7B6C" : "#B1AFA7";

  return (
    <div style={{
      background: "#FFFFFF", borderRadius: 14, padding: "18px 20px",
      border: "1px solid #E8E7E3", flex: "1 1 220px", minWidth: 220,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#37352F" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: "#B1AFA7", marginTop: 1 }}>{subtitle}</div>}
        </div>
        {prev > 0 && (
          <div style={{ display: "flex", alignItems: "center", color: diffColor, fontSize: 13, fontWeight: 600 }}>
            <Arrow dir={dir} />
            {diff !== 0 ? `${diff > 0 ? "+" : ""}${formatARS(diff)}` : "Sin cambio"}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "#B1AFA7", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Compra</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: color || "#37352F" }}>{formatARS(buy)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#B1AFA7", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Venta</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: color || "#37352F" }}>{formatARS(sell)}</div>
        </div>
        {spread > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "#B1AFA7", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Spread</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#CB912F" }}>{spread.toFixed(1)}%</div>
          </div>
        )}
      </div>
      {updated && (
        <div style={{ fontSize: 11, color: "#B1AFA7" }}>
          {"Actualizado: "}{new Date(updated).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
};

export const ExchangeMonitor = ({ exchangeRate, setExchangeRate }) => {
  const [data, setData] = useState({ blue: null, oficial: null, mep: null, cripto: null });
  const [prev, setPrev] = useState({ blue: 0, oficial: 0, mep: 0, cripto: 0 });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [blueRes, oficialRes, mepRes, criptoRes] = await Promise.allSettled([
        fetch(API_SOURCES.blue).then(r => r.json()),
        fetch(API_SOURCES.oficial).then(r => r.json()),
        fetch(API_SOURCES.mep).then(r => r.json()),
        fetch(API_SOURCES.cripto).then(r => r.json()),
      ]);

      const newData = {};

      if (blueRes.status === "fulfilled") {
        newData.blue = { buy: blueRes.value.compra, sell: blueRes.value.venta };
      }
      if (oficialRes.status === "fulfilled") {
        newData.oficial = { buy: oficialRes.value.compra, sell: oficialRes.value.venta };
      }
      if (mepRes.status === "fulfilled") {
        newData.mep = { buy: mepRes.value.compra, sell: mepRes.value.venta };
      }
      if (criptoRes.status === "fulfilled") {
        const c = criptoRes.value;
        const exchanges = Object.entries(c).filter(([k]) => !["time", "ask", "bid", "totalAsk", "totalBid"].includes(k));
        let bestBuy = Infinity, bestSell = 0;
        const exchangeList = [];
        for (const [name, vals] of exchanges) {
          if (vals && typeof vals === "object" && vals.totalAsk && vals.totalBid) {
            if (vals.totalAsk < bestBuy) bestBuy = vals.totalAsk;
            if (vals.totalBid > bestSell) bestSell = vals.totalBid;
            exchangeList.push({ name, ask: vals.totalAsk, bid: vals.totalBid });
          }
        }
        newData.cripto = {
          buy: bestBuy === Infinity ? 0 : bestBuy,
          sell: bestSell,
          exchanges: exchangeList.sort((a, b) => a.ask - b.ask).slice(0, 6),
        };
      }

      setPrev({
        blue: data.blue?.sell || 0,
        oficial: data.oficial?.sell || 0,
        mep: data.mep?.sell || 0,
        cripto: data.cripto?.sell || 0,
      });
      setData(newData);
      setLastUpdate(new Date());

      if (newData.blue) {
        setHistory(h => {
          const entry = { time: new Date().toISOString(), blue: newData.blue.sell, cripto: newData.cripto?.buy || 0 };
          const updated = [...h, entry].slice(-20);
          return updated;
        });
      }
    } catch (e) {
      setError("Error al consultar cotizaciones");
      console.error(e);
    }
    setLoading(false);
  }, [data]);

  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line

  const blueSpread = data.blue ? ((data.blue.sell - data.blue.buy) / data.blue.buy * 100) : 0;
  const gapBlueOficial = data.blue && data.oficial ? ((data.blue.sell - data.oficial.sell) / data.oficial.sell * 100) : 0;
  const gapCriptoBlue = data.cripto && data.blue ? ((data.cripto.buy - data.blue.sell) / data.blue.sell * 100) : 0;
  const gapMepBlue = data.mep && data.blue ? ((data.blue.sell - data.mep.sell) / data.mep.sell * 100) : 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#37352F", margin: 0 }}>
            Monitor de Cotizaciones
          </h2>
          <p style={{ fontSize: 13, color: "#8C8A82", margin: "4px 0 0" }}>
            {"Actualizaci\u00f3n autom\u00e1tica cada 5 minutos \u2014 Fuentes: DolarAPI + CriptoYa"}
          </p>
        </div>
        <Btn onClick={fetchRates} disabled={loading}>
          {loading ? "Actualizando..." : "\u21BB Actualizar ahora"}
        </Btn>
      </div>

      {error && (
        <div style={{ background: "#FBE4E4", border: "1px solid #F1B8B6", borderRadius: 10, padding: "10px 16px", marginBottom: 16, color: "#E03E3E", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Cards principales */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        {data.blue && (
          <SourceCard
            title={"D\u00f3lar Blue"}
            subtitle="Mercado informal - Fuente: DolarAPI"
            buy={data.blue.buy}
            sell={data.blue.sell}
            spread={blueSpread}
            prev={prev.blue}
            color="#5E6AD2"
            updated={lastUpdate}
          />
        )}
        {data.oficial && (
          <SourceCard
            title={"D\u00f3lar Oficial"}
            subtitle={"Banco Naci\u00f3n - Tipo de cambio minorista"}
            buy={data.oficial.buy}
            sell={data.oficial.sell}
            spread={0}
            prev={prev.oficial}
            color="#0F7B6C"
            updated={lastUpdate}
          />
        )}
        {data.mep && (
          <SourceCard
            title={"D\u00f3lar MEP / Bolsa"}
            subtitle={"Mercado burs\u00e1til - Operaci\u00f3n con bonos"}
            buy={data.mep.buy}
            sell={data.mep.sell}
            spread={data.mep.buy > 0 ? ((data.mep.sell - data.mep.buy) / data.mep.buy * 100) : 0}
            prev={prev.mep}
            color="#2383E2"
            updated={lastUpdate}
          />
        )}
        {data.cripto && (
          <SourceCard
            title="USDT Mejor Precio"
            subtitle={"Mejor cotizaci\u00f3n entre exchanges - CriptoYa"}
            buy={data.cripto.buy}
            sell={data.cripto.sell}
            spread={data.cripto.buy > 0 ? ((data.cripto.sell - data.cripto.buy) / data.cripto.buy * 100) : 0}
            prev={prev.cripto}
            color="#CB912F"
            updated={lastUpdate}
          />
        )}
      </div>

      {/* Comparativa de brechas */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ background: "#FFFFFF", borderRadius: 14, padding: "16px 20px", border: "1px solid #E8E7E3", flex: "1 1 180px" }}>
          <div style={{ fontSize: 12, color: "#B1AFA7", fontWeight: 600, marginBottom: 6 }}>BRECHA BLUE vs OFICIAL</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: gapBlueOficial > 30 ? "#E03E3E" : gapBlueOficial > 15 ? "#CB912F" : "#0F7B6C" }}>
            {gapBlueOficial.toFixed(1)}%
          </div>
          <div style={{ fontSize: 11, color: "#B1AFA7", marginTop: 2 }}>{"Diferencia entre blue y oficial"}</div>
        </div>
        <div style={{ background: "#FFFFFF", borderRadius: 14, padding: "16px 20px", border: "1px solid #E8E7E3", flex: "1 1 180px" }}>
          <div style={{ fontSize: 12, color: "#B1AFA7", fontWeight: 600, marginBottom: 6 }}>BRECHA BLUE vs MEP</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: Math.abs(gapMepBlue) < 3 ? "#0F7B6C" : "#CB912F" }}>
            {gapMepBlue > 0 ? "+" : ""}{gapMepBlue.toFixed(1)}%
          </div>
          <div style={{ fontSize: 11, color: "#B1AFA7", marginTop: 2 }}>{"Diferencia entre blue y MEP"}</div>
        </div>
        <div style={{ background: "#FFFFFF", borderRadius: 14, padding: "16px 20px", border: "1px solid #E8E7E3", flex: "1 1 180px" }}>
          <div style={{ fontSize: 12, color: "#B1AFA7", fontWeight: 600, marginBottom: 6 }}>BRECHA USDT vs BLUE</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: Math.abs(gapCriptoBlue) < 2 ? "#0F7B6C" : "#CB912F" }}>
            {gapCriptoBlue > 0 ? "+" : ""}{gapCriptoBlue.toFixed(1)}%
          </div>
          <div style={{ fontSize: 11, color: "#B1AFA7", marginTop: 2 }}>{"Diferencia entre USDT y blue"}</div>
        </div>
        <div style={{ background: "#FFFFFF", borderRadius: 14, padding: "16px 20px", border: "1px solid #E8E7E3", flex: "1 1 180px" }}>
          <div style={{ fontSize: 12, color: "#B1AFA7", fontWeight: 600, marginBottom: 6 }}>TU TIPO DE CAMBIO</div>
          {setExchangeRate ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: "#5E6AD2" }}>$</span>
              <input type="number" value={exchangeRate || 0}
                onChange={e => setExchangeRate(Number(e.target.value) || 0)}
                style={{
                  width: "100%", maxWidth: 130, padding: "2px 4px",
                  background: "transparent", border: "none", borderBottom: "2px solid #5E6AD2",
                  color: "#5E6AD2", fontSize: 28, fontWeight: 800, fontFamily: "inherit", outline: "none",
                }} />
            </div>
          ) : (
            <div style={{ fontSize: 28, fontWeight: 800, color: "#5E6AD2" }}>
              {formatARS(exchangeRate || 0)}
            </div>
          )}
          <div style={{ fontSize: 11, color: "#B1AFA7", marginTop: 2 }}>
            {setExchangeRate ? "Editable — override manual" : "Configurado en Caja"}
          </div>
        </div>
      </div>

      {/* Tabla de exchanges USDT */}
      {data.cripto?.exchanges?.length > 0 && (
        <div style={{ background: "#FFFFFF", borderRadius: 14, padding: "18px 20px", border: "1px solid #E8E7E3", marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#37352F", margin: "0 0 4px" }}>
            Comparativa USDT/ARS por Exchange
          </h3>
          <p style={{ fontSize: 12, color: "#B1AFA7", margin: "0 0 14px" }}>
            {"Precios con comisiones incluidas \u2014 Fuente: CriptoYa"}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E8E7E3" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#8C8A82", fontWeight: 600 }}>Exchange</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#8C8A82", fontWeight: 600 }}>Compra (ask)</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#8C8A82", fontWeight: 600 }}>Venta (bid)</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#8C8A82", fontWeight: 600 }}>Spread</th>
                  <th style={{ textAlign: "center", padding: "8px 12px", color: "#8C8A82", fontWeight: 600 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.cripto.exchanges.map((ex, i) => {
                  const isBest = i === 0;
                  const sp = ex.bid > 0 ? ((ex.bid - ex.ask) / ex.ask * 100) : 0;
                  return (
                    <tr key={ex.name} style={{ borderBottom: "1px solid #E8E7E3", background: isBest ? "#DDEDEA" : "transparent" }}>
                      <td style={{ padding: "10px 12px", fontWeight: isBest ? 700 : 500, color: "#37352F", textTransform: "capitalize" }}>
                        {ex.name}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: isBest ? "#0F7B6C" : "#37352F" }}>
                        {formatARS(ex.ask)}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#37352F" }}>
                        {formatARS(ex.bid)}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", color: "#8C8A82" }}>
                        {Math.abs(sp).toFixed(1)}%
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        {isBest && <span style={{ background: "#0F7B6C", color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>MEJOR</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mini historial */}
      {history.length > 1 && (
        <div style={{ background: "#FFFFFF", borderRadius: 14, padding: "18px 20px", border: "1px solid #E8E7E3" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#37352F", margin: "0 0 14px" }}>
            {"Historial de esta sesi\u00f3n"}
          </h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {history.map((h, i) => (
              <div key={i} style={{
                background: "#FAFAF9", borderRadius: 8, padding: "6px 12px", fontSize: 12,
                border: "1px solid #E8E7E3",
              }}>
                <span style={{ color: "#B1AFA7" }}>{new Date(h.time).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                {" "}
                <span style={{ fontWeight: 700, color: "#5E6AD2" }}>Blue: {formatARS(h.blue)}</span>
                {h.cripto > 0 && <span style={{ fontWeight: 600, color: "#CB912F" }}> | USDT: {formatARS(h.cripto)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
