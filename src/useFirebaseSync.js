import { useState, useEffect, useCallback, useRef } from "react";
import { saveToFirestore, subscribeToFirestore, auth } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";
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
  const writeFailCount = useRef(0);

  const [dataReady, setDataReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState("syncing"); // "syncing" | "online" | "offline" | "error"

  // ---- Auth state ----
  const [isAuthenticated, setIsAuthenticated] = useState(!!auth.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      if (!user) {
        firestoreReady.current = false;
        initialLoadDone.current = {};
        fromFirestore.current = {};
        writeFailCount.current = 0;
        setSyncStatus("syncing");
        setDataReady(false);
      }
    });
    return unsub;
  }, []);

  // ---- Setter map ----
  const setterMap = useRef({
    products: setProducts, sales: setSales, purchases: setPurchases,
    clients: setClients, expenses: setExpenses, withdrawals: setWithdrawals,
    cashMovements: setCashMovements, stockLog: setStockLog, priceLog: setPriceLog,
    monthlyClosures: setMonthlyClosures, partnerWithdrawals: setPartnerWithdrawals,
    auditLog: setAuditLog,
  }).current;

  // ---- Subscribe to Firestore ONLY when authenticated ----
  useEffect(() => {
    if (!isAuthenticated) return;

    console.log("[SYNC] Authenticated — subscribing to Firestore...");
    setSyncStatus("syncing");
    firestoreReady.current = false;
    initialLoadDone.current = {};
    writeFailCount.current = 0;

    const markKeyLoaded = (key) => {
      initialLoadDone.current[key] = true;
      const allLoaded = DATA_KEYS.every(k => initialLoadDone.current[k.key]);
      if (allLoaded && !firestoreReady.current) {
        console.log("[SYNC] All keys loaded — enabling writes");
        setDataReady(true);
        setSyncStatus("online");
        // Enable writes immediately — fromFirestore flags prevent loops
        firestoreReady.current = true;
      }
    };

    const unsubscribers = DATA_KEYS.map(({ key }) => {
      const setter = setterMap[key];
      return subscribeToFirestore(key,
        // onData
        (data) => {
          try { localStorage.setItem(`vapestock_${key}`, JSON.stringify(data)); } catch {}
          fromFirestore.current[key] = true;
          setter(data);
          markKeyLoaded(key);
        },
        // onNotFound — doc doesn't exist yet
        () => { markKeyLoaded(key); },
        // onError — subscription failed (permission denied, etc.)
        (err) => {
          console.error(`[SYNC] Subscription error for ${key}:`, err.code || err.message);
          // STILL mark as loaded so firestoreReady can activate
          // The data from localStorage will be used as fallback
          markKeyLoaded(key);
        }
      );
    });

    const unsubRate = subscribeToFirestore("exchangeRate",
      (data) => {
        if (typeof data === "number") {
          try { localStorage.setItem("vapestock_exchangeRate", JSON.stringify(data)); } catch {}
          fromFirestore.current["exchangeRate"] = true;
          setExchangeRate(data);
        }
      },
      () => {}, // not found
      (err) => { console.error("[SYNC] exchangeRate error:", err.code || err.message); }
    );

    // Timeout fallback: if nothing loaded after 15s, show cached data
    const timeout = setTimeout(() => {
      if (!firestoreReady.current) {
        console.warn("[SYNC] Timeout (15s) — showing cached data, writes blocked");
        setDataReady(true);
        setSyncStatus("offline");
      }
    }, 15000);

    return () => {
      unsubscribers.forEach(u => u());
      unsubRate();
      clearTimeout(timeout);
    };
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- smartSave: localStorage + Firestore ----
  const smartSave = useCallback((key, data) => {
    // Always save to localStorage first (instant, offline-safe)
    try { localStorage.setItem(`vapestock_${key}`, JSON.stringify(data)); } catch {}

    // Block writes until initial load completes
    if (!firestoreReady.current) {
      return;
    }

    // Don't write back data that came FROM Firestore (anti-loop)
    if (fromFirestore.current[key]) {
      fromFirestore.current[key] = false;
      return;
    }

    // Write to Firestore (with retry built into saveToFirestore)
    saveToFirestore(key, data).then(ok => {
      if (!ok) {
        writeFailCount.current++;
        if (writeFailCount.current >= 3) {
          setSyncStatus("error");
        }
      } else {
        writeFailCount.current = 0;
        setSyncStatus("online");
      }
    });
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

  // ---- Auto-fetch dolar blue ----
  useEffect(() => {
    const fetchBlue = async () => {
      try {
        const res = await fetch("https://dolarapi.com/v1/dolares/blue");
        const data = await res.json();
        if (data && data.venta && !fromFirestore.current["exchangeRate"]) {
          setExchangeRate(data.venta);
        }
      } catch (e) {
        console.log("No se pudo obtener cotización automática");
      }
    };
    fetchBlue();
    const interval = setInterval(fetchBlue, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // ---- Helpers ----
  const logStock = useCallback((entries) => {
    const logs = (Array.isArray(entries) ? entries : [entries]).map(e => ({
      id: uid(), date: e.date || new Date().toISOString(), productId: e.productId,
      type: e.type, qty: e.qty, reason: e.reason || "", refId: e.refId || ""
    }));
    setStockLog(prev => [...logs, ...prev]);
  }, []);

  const logPrice = useCallback((productId, oldPrice, newPrice, field) => {
    if (oldPrice === newPrice) return;
    setPriceLog(prev => [{ id: uid(), date: new Date().toISOString(), productId, field, oldPrice, newPrice }, ...prev]);
  }, []);

  return {
    products, setProducts, sales, setSales, purchases, setPurchases,
    clients, setClients, expenses, setExpenses, withdrawals, setWithdrawals,
    cashMovements, setCashMovements, stockLog, setStockLog, priceLog, setPriceLog,
    monthlyClosures, setMonthlyClosures, partnerWithdrawals, setPartnerWithdrawals,
    exchangeRate, setExchangeRate, auditLog, setAuditLog,
    dataReady, syncStatus, fromFirestore,
    logStock, logPrice,
  };
}
