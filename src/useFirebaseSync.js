import { useState, useEffect, useCallback, useRef } from "react";
import { saveToFirestore, subscribeToFirestore } from "./firebase.js";
import { DEFAULT_PRODUCTS } from "./constants.js";
import { loadData, uid } from "./helpers.js";

// All synced data keys with their default values
const DATA_KEYS = [
  { key: "products", default: DEFAULT_PRODUCTS },
  { key: "sales", default: [] },
  { key: "purchases", default: [] },
  { key: "clients", default: [] },
  { key: "expenses", default: [] },
  { key: "withdrawals", default: [] },
  { key: "cashMovements", default: [] },
  { key: "stockLog", default: [] },
  { key: "priceLog", default: [] },
  { key: "monthlyClosures", default: [] },
  { key: "partnerWithdrawals", default: [] },
  { key: "auditLog", default: [] },
];

export function useFirebaseSync() {
  // ---- Data state ----
  const [products, setProducts] = useState(() => loadData("products", DEFAULT_PRODUCTS));
  const [sales, setSales] = useState(() => loadData("sales", []));
  const [purchases, setPurchases] = useState(() => loadData("purchases", []));
  const [clients, setClients] = useState(() => loadData("clients", []));
  const [expenses, setExpenses] = useState(() => loadData("expenses", []));
  const [withdrawals, setWithdrawals] = useState(() => loadData("withdrawals", []));
  const [cashMovements, setCashMovements] = useState(() => loadData("cashMovements", []));
  const [stockLog, setStockLog] = useState(() => loadData("stockLog", []));
  const [priceLog, setPriceLog] = useState(() => loadData("priceLog", []));
  const [monthlyClosures, setMonthlyClosures] = useState(() => loadData("monthlyClosures", []));
  const [partnerWithdrawals, setPartnerWithdrawals] = useState(() => loadData("partnerWithdrawals", []));
  const [exchangeRate, setExchangeRate] = useState(() => loadData("exchangeRate", 1415));
  const [auditLog, setAuditLog] = useState(() => loadData("auditLog", []));

  // ---- Sync flags ----
  const fromFirestore = useRef({});
  const initialLoadDone = useRef({});
  const firestoreReady = useRef(false);

  const [dataReady, setDataReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState("syncing"); // "syncing" | "online" | "offline"

  // ---- Setter map (for Firestore subscription) ----
  const setterMap = {
    products: setProducts, sales: setSales, purchases: setPurchases,
    clients: setClients, expenses: setExpenses, withdrawals: setWithdrawals,
    cashMovements: setCashMovements, stockLog: setStockLog, priceLog: setPriceLog,
    monthlyClosures: setMonthlyClosures, partnerWithdrawals: setPartnerWithdrawals,
    auditLog: setAuditLog,
  };

  // ---- Subscribe to Firestore (runs once on mount) ----
  useEffect(() => {
    const markKeyLoaded = (key) => {
      initialLoadDone.current[key] = true;
      if (DATA_KEYS.every(k => initialLoadDone.current[k.key])) {
        setDataReady(true);
        setSyncStatus("online");
        setTimeout(() => { firestoreReady.current = true; }, 2000);
      }
    };

    const unsubscribers = DATA_KEYS.map(({ key }) => {
      const setter = setterMap[key];
      return subscribeToFirestore(key, (data) => {
        try { localStorage.setItem(`vapestock_${key}`, JSON.stringify(data)); } catch {}
        fromFirestore.current[key] = true;
        setter(data);
        markKeyLoaded(key);
      }, () => {
        markKeyLoaded(key);
      });
    });

    const unsubRate = subscribeToFirestore("exchangeRate", (data) => {
      if (typeof data === "number") {
        try { localStorage.setItem("vapestock_exchangeRate", JSON.stringify(data)); } catch {}
        fromFirestore.current["exchangeRate"] = true;
        setExchangeRate(data);
      }
    }, () => {});

    const timeout = setTimeout(() => {
      if (!firestoreReady.current) {
        setDataReady(true);
        setSyncStatus("offline");
        console.warn("[SYNC] Firebase no respondió en 8s. Datos visibles son de caché. Escrituras bloqueadas hasta sincronizar.");
      }
    }, 8000);

    return () => { unsubscribers.forEach(u => u()); unsubRate(); clearTimeout(timeout); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- smartSave: localStorage + Firestore (with guards) ----
  const smartSave = useCallback((key, data) => {
    try { localStorage.setItem(`vapestock_${key}`, JSON.stringify(data)); } catch {}
    if (!firestoreReady.current) return;
    if (fromFirestore.current[key]) {
      fromFirestore.current[key] = false;
      return;
    }
    saveToFirestore(key, data);
  }, []);

  // ---- Auto-save on state changes ----
  useEffect(() => smartSave("products", products), [products]); // eslint-disable-line
  useEffect(() => smartSave("sales", sales), [sales]); // eslint-disable-line
  useEffect(() => smartSave("purchases", purchases), [purchases]); // eslint-disable-line
  useEffect(() => smartSave("clients", clients), [clients]); // eslint-disable-line
  useEffect(() => smartSave("expenses", expenses), [expenses]); // eslint-disable-line
  useEffect(() => smartSave("withdrawals", withdrawals), [withdrawals]); // eslint-disable-line
  useEffect(() => smartSave("cashMovements", cashMovements), [cashMovements]); // eslint-disable-line
  useEffect(() => smartSave("stockLog", stockLog), [stockLog]); // eslint-disable-line
  useEffect(() => smartSave("priceLog", priceLog), [priceLog]); // eslint-disable-line
  useEffect(() => smartSave("monthlyClosures", monthlyClosures), [monthlyClosures]); // eslint-disable-line
  useEffect(() => smartSave("partnerWithdrawals", partnerWithdrawals), [partnerWithdrawals]); // eslint-disable-line
  useEffect(() => smartSave("auditLog", auditLog), [auditLog]); // eslint-disable-line
  useEffect(() => smartSave("exchangeRate", exchangeRate), [exchangeRate]); // eslint-disable-line

  // ---- Auto-fetch dolar blue (only if Firestore hasn't sent one) ----
  useEffect(() => {
    const fetchBlue = async () => {
      try {
        const res = await fetch("https://dolarapi.com/v1/dolares/blue");
        const data = await res.json();
        if (data && data.venta && !fromFirestore.current["exchangeRate"]) {
          setExchangeRate(data.venta);
        }
      } catch (e) {
        console.log("No se pudo obtener cotización automática, usando valor manual");
      }
    };
    fetchBlue();
    const interval = setInterval(fetchBlue, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // ---- Helper: log stock movement ----
  const logStock = useCallback((entries) => {
    const logs = (Array.isArray(entries) ? entries : [entries]).map(e => ({
      id: uid(), date: e.date || new Date().toISOString(), productId: e.productId,
      type: e.type, qty: e.qty, reason: e.reason || "", refId: e.refId || ""
    }));
    setStockLog(prev => [...logs, ...prev]);
  }, []);

  // ---- Helper: log price change ----
  const logPrice = useCallback((productId, oldPrice, newPrice, field) => {
    if (oldPrice === newPrice) return;
    setPriceLog(prev => [{ id: uid(), date: new Date().toISOString(), productId, field, oldPrice, newPrice }, ...prev]);
  }, []);

  return {
    // Data + setters
    products, setProducts, sales, setSales, purchases, setPurchases,
    clients, setClients, expenses, setExpenses, withdrawals, setWithdrawals,
    cashMovements, setCashMovements, stockLog, setStockLog, priceLog, setPriceLog,
    monthlyClosures, setMonthlyClosures, partnerWithdrawals, setPartnerWithdrawals,
    exchangeRate, setExchangeRate, auditLog, setAuditLog,
    // Sync state
    dataReady, syncStatus, fromFirestore,
    // Helpers
    logStock, logPrice,
  };
}
