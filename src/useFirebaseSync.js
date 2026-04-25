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
  // lastFirestoreData[key] = JSON serializado de la última data recibida de Firestore.
  // smartSave compara la data entrante contra esto: si es igual = es loop (skipear),
  // si es distinta = el usuario mutó (escribir). Reemplaza el flag boolean
  // `fromFirestore` que tenía un race fatal: si onSnapshot disparaba antes del save
  // del usuario, el flag quedaba true y el primer write del usuario se perdía
  // silenciosamente. Bug evidenciado el 2026-04-25 con persistentLocalCache N9.
  const lastFirestoreData = useRef({});
  const initialLoadDone = useRef({});
  const firestoreReady = useRef(false);
  const writeFailCount = useRef(0);
  // fromFirestore se mantiene SOLO para compat con consumers externos (ver
  // App.jsx que destructurea esto del hook). Ya no se usa internamente.
  const fromFirestore = useRef({});

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
        setDataReady(true);
        setSyncStatus("online");
        firestoreReady.current = true;
      }
    };

    const unsubscribers = DATA_KEYS.map(({ key }) => {
      const setter = setterMap[key];
      return subscribeToFirestore(key,
        // onData
        (data) => {
          // Trackear el JSON exacto que vino de Firestore. smartSave lo compara
          // contra la data entrante para decidir si es loop o mutación de usuario.
          const serialized = JSON.stringify(data);
          lastFirestoreData.current[key] = serialized;
          try { localStorage.setItem(`vapestock_${key}`, serialized); } catch {}
          setter(data);
          markKeyLoaded(key);
        },
        // onNotFound — el doc no existe todavía. lastFirestoreData queda undefined,
        // así smartSave escribirá la primera vez sin problema.
        () => { markKeyLoaded(key); },
        // onError
        (err) => {
          console.error(`[SYNC] Subscription error for ${key}:`, err.code || err.message);
          markKeyLoaded(key);
        }
      );
    });

    const unsubRate = subscribeToFirestore("exchangeRate",
      (data) => {
        if (typeof data === "number") {
          const serialized = JSON.stringify(data);
          lastFirestoreData.current["exchangeRate"] = serialized;
          try { localStorage.setItem("vapestock_exchangeRate", serialized); } catch {}
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
  // Algoritmo:
  //   1. Serializar data entrante a JSON
  //   2. Guardar en localStorage siempre (instant, offline-safe)
  //   3. Bloquear si firestoreReady es false (initial load no completó)
  //   4. Si la data serializada es IDÉNTICA a la última que vino de Firestore
  //      (lastFirestoreData[key]), es un loop del setter — skipear write
  //   5. Si es DISTINTA, es mutación del usuario — escribir + actualizar
  //      lastFirestoreData para que el próximo onSnapshot del mismo write
  //      no dispare otra escritura
  const smartSave = useCallback((key, data) => {
    const serialized = JSON.stringify(data);

    // Always save to localStorage first
    try { localStorage.setItem(`vapestock_${key}`, serialized); } catch {}

    // Block writes until initial load completes
    if (!firestoreReady.current) return;

    // Anti-loop: si la data es exactamente la que tenemos en Firestore, skipear.
    // Esto cubre tanto el primer onSnapshot del initial load como los snapshots
    // generados por nuestros propios writes (cuando Firestore confirma).
    if (lastFirestoreData.current[key] === serialized) return;

    // Es una mutación real del usuario. Actualizamos lastFirestoreData ANTES
    // de escribir, así el snapshot que vendrá como confirmación del write no
    // dispara un segundo write.
    lastFirestoreData.current[key] = serialized;

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
