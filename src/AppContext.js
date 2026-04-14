import { createContext, useContext } from "react";

// Shared context for the most commonly prop-drilled values
// Components can gradually migrate from props to useAppContext()
export const AppContext = createContext(null);

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppContext.Provider");
  return ctx;
};
