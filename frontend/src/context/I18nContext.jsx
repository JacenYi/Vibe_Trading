import React, { createContext, useContext, useState, useCallback } from "react";
import en from "../i18n/en.js";
import zh from "../i18n/zh.js";

const LOCALES = { en, zh };

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState("en");

  const t = useCallback(
    (key) => LOCALES[locale]?.[key] ?? LOCALES.en[key] ?? key,
    [locale]
  );

  const toggleLocale = useCallback(() => {
    setLocale((prev) => (prev === "en" ? "zh" : "en"));
  }, []);

  return (
    <I18nContext.Provider value={{ locale, t, toggleLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
