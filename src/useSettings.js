import { useState, useEffect } from "react";
import { loadSettings } from "./settings.js";

// Hook para consumir settings configurables. Re-renderiza cuando se
// emiten cambios (event "izn:settings-changed").
export function useSettings() {
  const [settings, setSettings] = useState(() => loadSettings());

  useEffect(() => {
    const handler = (e) => setSettings(e.detail || loadSettings());
    window.addEventListener("izn:settings-changed", handler);
    return () => window.removeEventListener("izn:settings-changed", handler);
  }, []);

  return settings;
}
