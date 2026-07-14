import { useState, useEffect, useCallback, useRef } from "react";
import { saveToFirestore, mergeIntoFirestore, subscribeToFirestore, auth } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { DEFAULT_PRODUCTS } from "./constants.js";
import { loadData, uid } from "./helpers.js";

// safeSetItem — escribe a localStorage manejando QuotaExceededError.
// Si el storage llena (típicamente 5-10MB en mobile/Safari), el setItem
// nativo falla silenciosamente. Este helper detecta esa falla y dispara
// el event "izn:storage-quota-error" para que la app muestre un toast
// pidiendo al usuario que limpie cache o exporte y resetee.
function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    const isQuota = e && (
      e.name === "QuotaExceededError" ||
      e.code === 22 ||
      e.code === 1014 // Firefox: NS_ERROR_DOM_QUOTA_REACHED
    );
    if (isQuota) {
      console.error(`[SYNC] localStorage quota exceeded saving ${key}`);
      try {
        window.dispatchEvent(new CustomEvent("izn:storage-quota-error", {
          detail: { key, size: value?.length || 0 },
        }));
      } catch {}
    } else {
      console.error(`[SYNC] localStorage error saving ${key}:`, e);
    }
    return false;
  }
}

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
  { key: "coupons", default: [] }, // S16.1 — sistema de cupones formal
  { key: "bundles", default: [] }, // S16.10 — bundles/combos preconfigurados
  { key: "supplierProfiles", default: [] }, // perfiles de proveedor con defaults y stats
  { key: "supplierAliases", default: [] },  // diccionario aprendido raw→productId
  { key: "supplierLists", default: [] },    // historial de listas procesadas
  { key: "prospects", default: [] },        // mayorista: kioscos-lead sin convertir
  { key: "visits", default: [] },           // mayorista: bitácora de visitas comerciales
  { key: "routes", default: [] },           // mayorista: rutas de reparto
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
  const [coupons, setCoupons] = useState(() => loadData("coupons", []));
  const [bundles, setBundles] = useState(() => loadData("bundles", []));
  const [supplierProfiles, setSupplierProfiles] = useState(() => loadData("supplierProfiles", []));
  const [supplierAliases, setSupplierAliases] = useState(() => loadData("supplierAliases", []));
  const [supplierLists, setSupplierLists] = useState(() => loadData("supplierLists", []));
  const [prospects, setProspects] = useState(() => loadData("prospects", []));
  const [visits, setVisits] = useState(() => loadData("visits", []));
  const [routes, setRoutes] = useState(() => loadData("routes", []));

  // ---- Sync flags ----
  // lastFirestoreData[key] = JSON serializado de la última data recibida de Firestore.
  // smartSave compara la data entrante contra esto: si es igual = es loop (skipear),
  // si es distinta = el usuario mutó (escribir). Reemplaza el flag boolean
  // `fromFirestore` que tenía un race fatal: si onSnapshot disparaba antes del save
  // del usuario, el flag quedaba true y el primer write del usuario se perdía
  // silenciosamente. Bug evidenciado el 2026-04-25 con persistentLocalCache N9.
  const lastFirestoreData = useRef({});
  // lastLocalState[key] = referencia al ÚLTIMO array que vio el sync (sea por
  // smartSave o por onSnapshot). smartSave usa esto como `prev` para calcular
  // el diff contra `next`. Sin esto no se puede mergear concurrentemente,
  // habría que hacer full-overwrite y se perdería data en concurrent edits.
  const lastLocalState = useRef({});
  // lastWriteAt[key] = timestamp ms del último smartSave hacia Firestore.
  // Se compara contra el momento en que llega un onSnapshot con data distinta:
  // si la diferencia es < 3s, hay alta chance de concurrent edit (otra pestaña o dispositivo).
  const lastWriteAt = useRef({});
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
        lastWriteAt.current = {};
        lastLocalState.current = {};
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
    auditLog: setAuditLog, coupons: setCoupons, bundles: setBundles,
    supplierProfiles: setSupplierProfiles,
    supplierAliases: setSupplierAliases,
    supplierLists: setSupplierLists,
    prospects: setProspects, visits: setVisits, routes: setRoutes,
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
          // Detector de concurrent edit: si el contenido nuevo es distinto al que
          // teníamos como lastFirestoreData Y nosotros escribimos hace <3s, es
          // probable que otra pestaña/dispositivo haya escrito en paralelo y nuestro write
          // perdió contra el suyo (o viceversa).
          const prev = lastFirestoreData.current[key];
          const lastWrite = lastWriteAt.current[key] || 0;
          const recentlyWrote = (Date.now() - lastWrite) < 3000;
          if (prev !== undefined && prev !== serialized && recentlyWrote && initialLoadDone.current[key]) {
            console.info(`[SYNC] Edición concurrente en "${key}" — el merge atómico preservó ambos cambios`);
            try {
              window.dispatchEvent(new CustomEvent("izn:concurrent-edit", {
                detail: { key, at: new Date().toISOString() },
              }));
            } catch {}
          }
          lastFirestoreData.current[key] = serialized;
          // Sincronizar lastLocalState con lo que ahora tenemos. El próximo
          // smartSave calculará el diff contra ESTO (no contra la versión
          // pre-onSnapshot), así un cambio del otro socio queda incorporado.
          lastLocalState.current[key] = data;
          safeSetItem(`vapestock_${key}`, serialized);
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
          safeSetItem("vapestock_exchangeRate", serialized);
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

  // ---- smartSave: localStorage + Firestore con merge concurrente-seguro ----
  // Algoritmo:
  //   1. Serializar data entrante a JSON y guardar en localStorage (instant)
  //   2. Bloquear si firestoreReady es false (initial load no completó)
  //   3. Anti-loop: si la data es IDÉNTICA a la última que vino de Firestore,
  //      es un setter loop — skipear
  //   4. Para arrays: usar mergeIntoFirestore (transacción atómica con diff)
  //      → resuelve concurrent edits: si Gus escribió en paralelo, su cambio
  //      sobrevive, el nuestro se agrega encima sin pisarlo.
  //   5. Para escalares (exchangeRate): saveToFirestore tradicional.
  //   6. Primer write (sin lastLocalState): también saveToFirestore — no hay
  //      "antes" contra el cual hacer diff.
  const smartSave = useCallback((key, data) => {
    const serialized = JSON.stringify(data);
    safeSetItem(`vapestock_${key}`, serialized);

    if (!firestoreReady.current) return;
    if (lastFirestoreData.current[key] === serialized) return;

    const prevLocal = lastLocalState.current[key];
    // Pinear la nueva versión local AHORA — el próximo smartSave la usará como prev.
    lastLocalState.current[key] = data;
    // Actualizar lastFirestoreData con lo que estamos por mandar evita que
    // el onSnapshot de confirmación dispare un segundo smartSave en loop.
    lastFirestoreData.current[key] = serialized;
    lastWriteAt.current[key] = Date.now();

    const handleResult = (ok) => {
      if (!ok) {
        writeFailCount.current++;
        if (writeFailCount.current >= 3) setSyncStatus("error");
      } else {
        writeFailCount.current = 0;
        setSyncStatus("online");
      }
    };

    // Camino concurrente-seguro: solo para arrays con items por id, y solo
    // cuando ya tenemos una versión previa contra la cual hacer diff.
    if (Array.isArray(data) && Array.isArray(prevLocal)) {
      mergeIntoFirestore(key, prevLocal, data).then(merged => {
        if (merged === null) {
          handleResult(false);
          return;
        }
        // Si el merge devolvió un array distinto al que mandamos (Gus había
        // agregado cosas), sincronizar lastFirestoreData con el resultado real
        // para no disparar otro write innecesario al recibir el onSnapshot.
        const mergedSerialized = JSON.stringify(merged);
        lastFirestoreData.current[key] = mergedSerialized;
        lastLocalState.current[key] = merged;
        handleResult(true);
      });
      return;
    }

    // Fallback: full-overwrite para escalares (exchangeRate) y primer write.
    saveToFirestore(key, data).then(handleResult);
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
  useEffect(() => smartSave("coupons", coupons), [coupons]); // eslint-disable-line
  useEffect(() => smartSave("bundles", bundles), [bundles]); // eslint-disable-line
  useEffect(() => smartSave("supplierProfiles", supplierProfiles), [supplierProfiles]); // eslint-disable-line
  useEffect(() => smartSave("supplierAliases", supplierAliases), [supplierAliases]); // eslint-disable-line
  useEffect(() => smartSave("supplierLists", supplierLists), [supplierLists]); // eslint-disable-line
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
    coupons, setCoupons,
    bundles, setBundles,
    supplierProfiles, setSupplierProfiles,
    supplierAliases, setSupplierAliases,
    supplierLists, setSupplierLists,
    prospects, setProspects, visits, setVisits, routes, setRoutes,
    dataReady, syncStatus, fromFirestore,
    logStock, logPrice,
  };
}
