import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import pl from "./pl.json";

export const LANGUAGE_KEY = "bigfred-wizard.lang";
export const SUPPORTED_LANGUAGES = ["pl", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

function initialLanguage(): Language {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
    return stored as Language;
  }
  return navigator.language.startsWith("pl") ? "pl" : "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    pl: { translation: pl },
    en: { translation: en },
  },
  lng: initialLanguage(),
  fallbackLng: "pl",
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: Language): void {
  localStorage.setItem(LANGUAGE_KEY, lang);
  void i18n.changeLanguage(lang);
}

export default i18n;
