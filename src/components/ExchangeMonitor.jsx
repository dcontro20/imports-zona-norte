import { useState, useEffect, useCallback } from "react";
import { Btn } from "./UI";
import { useResponsive } from "../App.jsx";

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutos

const API_SOURCES = {
  blue: "https://dolarapi.com/v1/dolares/blue",
  oficial: "https://dolarapi.com/v1/dolares/oficial",
  mep: "https://dolarapi.com/v1/dolares/bolsa",
  cripto: "https://criptoya.com/api/usdt/ars",
};

// Exchanges preferidos de Diego — los que más usa o le interesan.
// El order acá es el order en el que se muestran las cards.
const PREFERRED_EXCHANGES = [
  { key: "lemoncash", label: "Lemon", color: "#0064FF", emoji: "🍋" },
  { key: "binance", label: "Binance", color: "#F0B90B", emoji: "🟡" },
  { key: "ripio", label: "Ripio", color: "#7C3AED", emoji: "🟣" },
  { key: "buenbit", label: "Buenbit", color: "#1E2B4A", emoji: "🟦" },
  { key: "belo", label: "Belo", color: "#22C55E", emoji: "🟢" },
  { key: "fiwind", label: "Fiwind", color: "#0EA5E9", emoji: "💨" },
];

const formatARS = (n) =>
  `$${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const Arrow = ({ dir }) => (
  <span style={{ fontSize: 14, marginRight: 4 }}>
    {dir === "up" ? "↑" : dir === "down" ? "↓" : "→"}
  </span>
);

const SourceCard = ({ title, subtitle, buy, sell, spread, prev, color, updated, isMobile }) => {
  const diff = prev ? sell - prev : 0;
  const dir = diff > 0 ? "up" : diff < 0 ? "down" : "same";
  const diffColor = dir === "up" ? "#E03E3E" : dir === "down" ? "#0F7B6C" : "#9AA2B3";

  return (
    <div style={{
      background: "#FFFFFF", borderRadius: 14,
      padding: isMobile ? "16px 16px" : "18px 20px",
      border: "1px solid #E5DAC2",
      flex: "1 1 220px",
      minWidth: isMobile ? 0 : 220,
      width: isMobile ? "100%" : "auto",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        gap: 8, marginBottom: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: isMobile ? 14 : 15, color: "#1E2B4A" }}>{title}</div>
          {subtitle && (
            <div style={{
              fontSize: 11, color: "#9AA2B3", marginTop: 2,
              overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: isMobile ? "normal" : "nowrap",
              lineHeight: 1.3,
            }}>{subtitle}</div>
          )}
        </div>
        {prev > 0 && (
          <div style={{
            display: "flex", alignItems: "center", color: diffColor,
            fontSize: isMobile ? 11 : 13, fontWeight: 600,
            flexShrink: 0, whiteSpace: "nowrap",
          }}>
            <Arrow dir={dir} />
            {diff !== 0 ? `${diff > 0 ? "+" : ""}${formatARS(diff)}` : "—"}
          </div>
        )}
      </div>
      <div style={{
        display: "flex", gap: isMobile ? 10 : 16, marginBottom: 8,
        flexWrap: "wrap",
      }}>
        <div style={{ flex: "1 1 70px" }}>
          <div style={{ fontSize: 11, color: "#9AA2B3", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Compra</div>
          <div style={{
            fontSize: isMobile ? 18 : 22, fontWeight: 800,
            color: color || "#1E2B4A", lineHeight: 1.1,
          }}>{formatARS(buy)}</div>
        </div>
        <div style={{ flex: "1 1 70px" }}>
          <div style={{ fontSize: 11, color: "#9AA2B3", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Venta</div>
          <div style={{
            fontSize: isMobile ? 18 : 22, fontWeight: 800,
            color: color || "#1E2B4A", lineHeight: 1.1,
          }}>{formatARS(sell)}</div>
        </div>
        {spread > 0 && (
          <div style={{ flex: "1 1 60px" }}>
            <div style={{ fontSize: 11, color: "#9AA2B3", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Spread</div>
            <div style={{
              fontSize: isMobile ? 18 : 22, fontWeight: 800,
              color: "#CB912F", lineHeight: 1.1,
            }}>{spread.toFixed(1)}%</div>
          </div>
        )}
      </div>
      {updated && (
        <div style={{ fontSize: 11, color: "#9AA2B3" }}>
          {"Actualizado: "}{new Date(updated).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
};

// Card para exchange preferido (Lemon, Binance, etc.)
// Convención banco/casa de cambio (igual que Blue):
//   Compra = bid = lo que el exchange paga al cliente (cuando vende USDT) → MENOR
//   Venta  = ask = lo que el exchange cobra al cliente (cuando compra USDT) → MAYOR
// Mostramos ask/bid SIN fees agregados — lo que ves dentro de la app del exchange.
const ExchangeCard = ({ label, emoji, color, ask, bid, isBest, isMobile, blueRef }) => {
  const spread = bid > 0 && ask > 0 ? ((ask - bid) / bid * 100) : 0;
  // brecha vs blue: comparamos contra el ask (precio al que comprás USDT)
  // positivo = USDT más caro que blue, negativo = USDT más barato
  const gapVsBlue = blueRef && ask > 0 ? ((ask - blueRef) / blueRef * 100) : null;

  return (
    <div style={{
      background: "#FFFFFF", borderRadius: 12,
      padding: isMobile ? "12px 14px" : "14px 16px",
      border: `1px solid ${isBest ? color : "#E5DAC2"}`,
      borderLeft: `3px solid ${color}`,
      position: "relative",
      minWidth: 0,
    }}>
      {isBest && (
        <span style={{
          position: "absolute", top: 8, right: 8,
          background: "#0F7B6C", color: "#fff",
          borderRadius: 6, padding: "2px 6px",
          fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
        }}>MEJOR</span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>{emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1E2B4A" }}>{label}</span>
      </div>
      {ask > 0 ? (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: "#9AA2B3", fontWeight: 600, textTransform: "uppercase" }}>Compra</div>
              <div style={{
                fontSize: isMobile ? 15 : 17, fontWeight: 800,
                color, lineHeight: 1.2,
              }}>{formatARS(bid)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: "#9AA2B3", fontWeight: 600, textTransform: "uppercase" }}>Venta</div>
              <div style={{
                fontSize: isMobile ? 15 : 17, fontWeight: 800,
                color: "#1E2B4A", lineHeight: 1.2,
              }}>{formatARS(ask)}</div>
            </div>
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 10, color: "#6B7794",
          }}>
            <span>Spread {Math.abs(spread).toFixed(1)}%</span>
            {gapVsBlue !== null && (
              <span style={{
                color: Math.abs(gapVsBlue) < 1 ? "#0F7B6C" : "#CB912F",
                fontWeight: 600,
              }}>
                vs Blue {gapVsBlue > 0 ? "+" : ""}{gapVsBlue.toFixed(1)}%
              </span>
            )}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: "#9AA2B3", padding: "6px 0" }}>Sin datos</div>
      )}
    </div>
  );
};

export const ExchangeMonitor = ({ exchangeRate, setExchangeRate }) => {
  const { isMobile } = useResponsive();
  const [data, setData] = useState({ blue: null, oficial: null, mep: null, cripto: null });
  const [prev, setPrev] = useState({ blue: 0, oficial: 0, mep: 0, cripto: 0 });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [showAllExchanges, setShowAllExchanges] = useState(false);

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
        const skipKeys = ["time", "ask", "bid", "totalAsk", "totalBid"];
        const exchanges = Object.entries(c).filter(([k]) => !skipKeys.includes(k));
        // Usamos ask/bid SIN fees adicionales — lo que ves dentro de la app
        // del exchange (Lemon, Binance, etc). totalAsk/totalBid agregan fees
        // de transferencia estimados que CriptoYa promedia y dan números
        // distintos a los de la app real.
        let bestAsk = Infinity, bestBid = 0;
        let bestAskExchange = "", bestBidExchange = "";
        const exchangeList = [];
        const exchangeMap = {};
        for (const [name, vals] of exchanges) {
          if (vals && typeof vals === "object" && vals.ask && vals.bid) {
            if (vals.ask < bestAsk) { bestAsk = vals.ask; bestAskExchange = name; }
            if (vals.bid > bestBid) { bestBid = vals.bid; bestBidExchange = name; }
            exchangeList.push({ name, ask: vals.ask, bid: vals.bid });
            exchangeMap[name] = { ask: vals.ask, bid: vals.bid };
          }
        }
        // Convención banco/casa de cambio (igual que Blue/Oficial/MEP):
        //   buy  = lo que el exchange paga al cliente (bid) = MENOR
        //   sell = lo que el exchange cobra al cliente (ask) = MAYOR
        // Así la card muestra Compra < Venta y es consistente con el Blue.
        newData.cripto = {
          buy: bestBid,                          // mejor bid = "Compra" más alta posible
          sell: bestAsk === Infinity ? 0 : bestAsk, // mejor ask = "Venta" más baja posible
          bestAskExchange,
          bestBidExchange,
          exchanges: exchangeList.sort((a, b) => a.ask - b.ask),
          exchangeMap,
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
  // Comparamos venta con venta (lo que pagás por 1 USDT/USD en cada caso)
  const gapCriptoBlue = data.cripto && data.blue && data.blue.sell > 0
    ? ((data.cripto.sell - data.blue.sell) / data.blue.sell * 100) : 0;
  const gapMepBlue = data.mep && data.blue ? ((data.blue.sell - data.mep.sell) / data.mep.sell * 100) : 0;

  // Identificar cuál exchange tiene el mejor ask (para destacar "MEJOR")
  const exchangesSorted = data.cripto?.exchanges || [];
  const bestExchangeName = exchangesSorted[0]?.name;

  return (
    <div>
      {/* Header — stack en mobile */}
      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between",
        alignItems: isMobile ? "stretch" : "center",
        gap: 12, marginBottom: 18,
      }}>
        <div>
          <h2 style={{ fontSize: isMobile ? 20 : 22, fontWeight: 800, color: "#1E2B4A", margin: 0 }}>
            Monitor de Cotizaciones
          </h2>
          <p style={{ fontSize: isMobile ? 12 : 13, color: "#6B7794", margin: "4px 0 0" }}>
            {"Actualización automática cada 5 minutos — DolarAPI + CriptoYa"}
          </p>
        </div>
        <Btn onClick={fetchRates} disabled={loading} style={{ minHeight: 44, alignSelf: isMobile ? "stretch" : "auto" }}>
          {loading ? "Actualizando..." : "↻ Actualizar ahora"}
        </Btn>
      </div>

      {error && (
        <div style={{ background: "#FBE4E4", border: "1px solid #F1B8B6", borderRadius: 10, padding: "10px 16px", marginBottom: 16, color: "#E03E3E", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Cards principales — Blue, Oficial, MEP, USDT mejor precio */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))",
        gap: isMobile ? 12 : 14,
        marginBottom: 20,
      }}>
        {data.blue && (
          <SourceCard
            title={"Dólar Blue"}
            subtitle="Mercado informal · DolarAPI"
            buy={data.blue.buy}
            sell={data.blue.sell}
            spread={blueSpread}
            prev={prev.blue}
            color="#1E2B4A"
            updated={lastUpdate}
            isMobile={isMobile}
          />
        )}
        {data.oficial && (
          <SourceCard
            title={"Dólar Oficial"}
            subtitle={"Banco Nación · minorista"}
            buy={data.oficial.buy}
            sell={data.oficial.sell}
            spread={0}
            prev={prev.oficial}
            color="#0F7B6C"
            updated={lastUpdate}
            isMobile={isMobile}
          />
        )}
        {data.mep && (
          <SourceCard
            title={"Dólar MEP / Bolsa"}
            subtitle={"Mercado bursátil · bonos"}
            buy={data.mep.buy}
            sell={data.mep.sell}
            spread={data.mep.buy > 0 ? ((data.mep.sell - data.mep.buy) / data.mep.buy * 100) : 0}
            prev={prev.mep}
            color="#2383E2"
            updated={lastUpdate}
            isMobile={isMobile}
          />
        )}
        {data.cripto && (
          <SourceCard
            title="USDT Mejor Precio"
            subtitle={
              data.cripto.bestBidExchange && data.cripto.bestAskExchange
                ? `Vendés en ${data.cripto.bestBidExchange} · Comprás en ${data.cripto.bestAskExchange}`
                : "Mejor cotización entre exchanges"
            }
            buy={data.cripto.buy}
            sell={data.cripto.sell}
            spread={data.cripto.buy > 0 && data.cripto.sell > data.cripto.buy
              ? ((data.cripto.sell - data.cripto.buy) / data.cripto.buy * 100)
              : 0}
            prev={prev.cripto}
            color="#CB912F"
            updated={lastUpdate}
            isMobile={isMobile}
          />
        )}
      </div>

      {/* USDT por exchange — Lemon, Binance, Ripio, etc. */}
      {data.cripto?.exchangeMap && (
        <div style={{
          background: "#FFFFFF", borderRadius: 14,
          padding: isMobile ? "14px 14px" : "18px 20px",
          border: "1px solid #E5DAC2", marginBottom: 20,
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            gap: 8, marginBottom: 14, flexWrap: "wrap",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: "#1E2B4A", margin: "0 0 2px" }}>
                💱 USDT/ARS por Exchange
              </h3>
              <p style={{ fontSize: 11, color: "#9AA2B3", margin: 0 }}>
                Tus exchanges favoritos · precios con comisiones · CriptoYa
              </p>
            </div>
            {exchangesSorted.length > PREFERRED_EXCHANGES.length && (
              <button
                onClick={() => setShowAllExchanges(s => !s)}
                style={{
                  background: "transparent", border: "1px solid #E5DAC2",
                  borderRadius: 8, padding: "6px 10px",
                  fontSize: 11, fontWeight: 600, color: "#1E2B4A",
                  cursor: "pointer", fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                {showAllExchanges ? "Ver favoritos" : `Ver todos (${exchangesSorted.length})`}
              </button>
            )}
          </div>

          {/* Grid de cards: 2 cols en mobile, auto en desktop */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(220px, 1fr))",
            gap: isMobile ? 8 : 12,
            marginBottom: 8,
          }}>
            {PREFERRED_EXCHANGES.map(ex => {
              const vals = data.cripto.exchangeMap[ex.key] || {};
              return (
                <ExchangeCard
                  key={ex.key}
                  label={ex.label}
                  emoji={ex.emoji}
                  color={ex.color}
                  ask={vals.ask || 0}
                  bid={vals.bid || 0}
                  isBest={ex.key === bestExchangeName}
                  isMobile={isMobile}
                  blueRef={data.blue?.sell || 0}
                />
              );
            })}
          </div>

          {/* Tabla expandible con todos los exchanges.
              Convención: "Compra" = bid (menor) · "Venta" = ask (mayor),
              igual que las cards de Blue/Oficial/MEP. */}
          {showAllExchanges && (
            <div style={{ overflowX: "auto", marginTop: 14, paddingTop: 14, borderTop: "1px solid #EFE5CE" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: isMobile ? 11 : 13, minWidth: 480 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #E5DAC2" }}>
                    <th style={{ textAlign: "left", padding: isMobile ? "6px 8px" : "8px 12px", color: "#6B7794", fontWeight: 600 }}>Exchange</th>
                    <th style={{ textAlign: "right", padding: isMobile ? "6px 8px" : "8px 12px", color: "#6B7794", fontWeight: 600 }}>Compra</th>
                    <th style={{ textAlign: "right", padding: isMobile ? "6px 8px" : "8px 12px", color: "#6B7794", fontWeight: 600 }}>Venta</th>
                    <th style={{ textAlign: "right", padding: isMobile ? "6px 8px" : "8px 12px", color: "#6B7794", fontWeight: 600 }}>Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {exchangesSorted.map((ex, i) => {
                    const isBest = i === 0;
                    const sp = ex.bid > 0 && ex.ask > 0 ? ((ex.ask - ex.bid) / ex.bid * 100) : 0;
                    return (
                      <tr key={ex.name} style={{ borderBottom: "1px solid #EFE5CE", background: isBest ? "#DDEDEA" : "transparent" }}>
                        <td style={{ padding: isMobile ? "8px" : "10px 12px", fontWeight: isBest ? 700 : 500, color: "#1E2B4A", textTransform: "capitalize" }}>
                          {isBest && "🥇 "}{ex.name}
                        </td>
                        <td style={{ padding: isMobile ? "8px" : "10px 12px", textAlign: "right", fontWeight: 600, color: "#1E2B4A" }}>
                          {formatARS(ex.bid)}
                        </td>
                        <td style={{ padding: isMobile ? "8px" : "10px 12px", textAlign: "right", fontWeight: 600, color: isBest ? "#0F7B6C" : "#1E2B4A" }}>
                          {formatARS(ex.ask)}
                        </td>
                        <td style={{ padding: isMobile ? "8px" : "10px 12px", textAlign: "right", color: "#6B7794" }}>
                          {Math.abs(sp).toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Comparativa de brechas — grid responsive */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(180px, 1fr))",
        gap: isMobile ? 10 : 14,
        marginBottom: 20,
      }}>
        <div style={{
          background: "#FFFFFF", borderRadius: 14,
          padding: isMobile ? "14px 14px" : "16px 20px",
          border: "1px solid #E5DAC2", minWidth: 0,
        }}>
          <div style={{ fontSize: isMobile ? 10 : 12, color: "#9AA2B3", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>Blue vs Oficial</div>
          <div style={{
            fontSize: isMobile ? 22 : 28, fontWeight: 800,
            color: gapBlueOficial > 30 ? "#E03E3E" : gapBlueOficial > 15 ? "#CB912F" : "#0F7B6C",
            lineHeight: 1.1,
          }}>
            {gapBlueOficial.toFixed(1)}%
          </div>
          <div style={{ fontSize: 11, color: "#9AA2B3", marginTop: 4 }}>Brecha cambiaria</div>
        </div>
        <div style={{
          background: "#FFFFFF", borderRadius: 14,
          padding: isMobile ? "14px 14px" : "16px 20px",
          border: "1px solid #E5DAC2", minWidth: 0,
        }}>
          <div style={{ fontSize: isMobile ? 10 : 12, color: "#9AA2B3", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>Blue vs MEP</div>
          <div style={{
            fontSize: isMobile ? 22 : 28, fontWeight: 800,
            color: Math.abs(gapMepBlue) < 3 ? "#0F7B6C" : "#CB912F",
            lineHeight: 1.1,
          }}>
            {gapMepBlue > 0 ? "+" : ""}{gapMepBlue.toFixed(1)}%
          </div>
          <div style={{ fontSize: 11, color: "#9AA2B3", marginTop: 4 }}>Brecha bursátil</div>
        </div>
        <div style={{
          background: "#FFFFFF", borderRadius: 14,
          padding: isMobile ? "14px 14px" : "16px 20px",
          border: "1px solid #E5DAC2", minWidth: 0,
        }}>
          <div style={{ fontSize: isMobile ? 10 : 12, color: "#9AA2B3", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>USDT vs Blue</div>
          <div style={{
            fontSize: isMobile ? 22 : 28, fontWeight: 800,
            color: Math.abs(gapCriptoBlue) < 2 ? "#0F7B6C" : "#CB912F",
            lineHeight: 1.1,
          }}>
            {gapCriptoBlue > 0 ? "+" : ""}{gapCriptoBlue.toFixed(1)}%
          </div>
          <div style={{ fontSize: 11, color: "#9AA2B3", marginTop: 4 }}>Brecha cripto</div>
        </div>
        <div style={{
          background: "#FFFFFF", borderRadius: 14,
          padding: isMobile ? "14px 14px" : "16px 20px",
          border: "1px solid #1E2B4A44", minWidth: 0,
        }}>
          <div style={{ fontSize: isMobile ? 10 : 12, color: "#1E2B4A", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>Tu tipo de cambio</div>
          {setExchangeRate ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
              <span style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: "#1E2B4A", lineHeight: 1.1 }}>$</span>
              <input
                type="number"
                value={exchangeRate || 0}
                onChange={e => setExchangeRate(Number(e.target.value) || 0)}
                style={{
                  width: "100%", minWidth: 0, padding: "2px 4px",
                  background: "transparent", border: "none", borderBottom: "2px solid #1E2B4A",
                  color: "#1E2B4A",
                  fontSize: isMobile ? 22 : 28, fontWeight: 800,
                  fontFamily: "inherit", outline: "none",
                  lineHeight: 1.1,
                }}
              />
            </div>
          ) : (
            <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: "#1E2B4A", lineHeight: 1.1 }}>
              {formatARS(exchangeRate || 0)}
            </div>
          )}
          <div style={{ fontSize: 11, color: "#9AA2B3", marginTop: 4 }}>
            {setExchangeRate ? "Editable — override" : "Configurado en Caja"}
          </div>
        </div>
      </div>

      {/* Mini historial */}
      {history.length > 1 && (
        <div style={{
          background: "#FFFFFF", borderRadius: 14,
          padding: isMobile ? "14px 14px" : "18px 20px",
          border: "1px solid #E5DAC2",
        }}>
          <h3 style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: "#1E2B4A", margin: "0 0 14px" }}>
            {"Historial de esta sesión"}
          </h3>
          {history.length >= 2 && (() => {
            const blueValues = history.map(h => h.blue).filter(v => v > 0);
            const criptoValues = history.map(h => h.cripto).filter(v => v > 0);
            const minBlue = Math.min(...blueValues);
            const maxBlue = Math.max(...blueValues);
            const minCripto = criptoValues.length ? Math.min(...criptoValues) : 0;
            const maxCripto = criptoValues.length ? Math.max(...criptoValues) : 0;
            const w = 600, hh = 100;
            const dx = history.length > 1 ? w / (history.length - 1) : 0;
            const norm = (v, min, max) => max === min ? hh / 2 : hh - ((v - min) / (max - min)) * hh * 0.85 - hh * 0.075;
            const bluePath = blueValues.length >= 2
              ? history.map((entry, i) => `${i === 0 ? "M" : "L"} ${i * dx} ${entry.blue > 0 ? norm(entry.blue, minBlue, maxBlue) : hh / 2}`).join(" ")
              : "";
            const criptoPath = criptoValues.length >= 2
              ? history.map((entry, i) => `${i === 0 ? "M" : "L"} ${i * dx} ${entry.cripto > 0 ? norm(entry.cripto, minCripto, maxCripto) : hh / 2}`).join(" ")
              : "";
            return (
              <div style={{
                background: "#F8F2E7", borderRadius: 10, padding: 12, marginBottom: 10,
                border: "1px solid #E5DAC2", overflowX: "auto",
              }}>
                <svg viewBox={`0 0 ${w} ${hh}`} preserveAspectRatio="none" style={{ width: "100%", height: isMobile ? 90 : 120, display: "block" }}>
                  {bluePath && <path d={bluePath} stroke="#1E2B4A" strokeWidth="2" fill="none" />}
                  {criptoPath && <path d={criptoPath} stroke="#CB912F" strokeWidth="2" fill="none" strokeDasharray="4,2" />}
                  {history.map((entry, i) => (
                    <g key={i}>
                      {entry.blue > 0 && <circle cx={i * dx} cy={norm(entry.blue, minBlue, maxBlue)} r="3" fill="#1E2B4A" />}
                    </g>
                  ))}
                </svg>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#6B7794", marginTop: 6, flexWrap: "wrap" }}>
                  <span><span style={{ display: "inline-block", width: 14, height: 2, background: "#1E2B4A", marginRight: 4, verticalAlign: "middle" }} />Blue ({formatARS(minBlue)} → {formatARS(maxBlue)})</span>
                  {criptoValues.length > 0 && <span><span style={{ display: "inline-block", width: 14, height: 2, background: "#CB912F", marginRight: 4, verticalAlign: "middle" }} />USDT ({formatARS(minCripto)} → {formatARS(maxCripto)})</span>}
                </div>
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {history.map((h, i) => (
              <div key={i} style={{
                background: "#F8F2E7", borderRadius: 8, padding: "6px 10px", fontSize: 11,
                border: "1px solid #E5DAC2",
              }}>
                <span style={{ color: "#9AA2B3" }}>{new Date(h.time).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                {" "}
                <span style={{ fontWeight: 700, color: "#1E2B4A" }}>Blue {formatARS(h.blue)}</span>
                {h.cripto > 0 && <span style={{ fontWeight: 600, color: "#CB912F" }}> · USDT {formatARS(h.cripto)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
