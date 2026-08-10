import type { ComponentType } from "react";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { IconFlagDE, IconFlagUK } from "material-ui-flags";

import IconFlagPL from "../components/flags/IconFlagPL";
import de from "./de.json";
import en from "./en.json";
import pl from "./pl.json";

export const LANGUAGE_KEY = "bigfred-wizard.lang";
export const SUPPORTED_LANGUAGES = ["pl", "en", "de"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** Accessible name for each language (not translated — labels the locale itself). */
export const LANGUAGE_LABELS: Record<Language, string> = {
  pl: "Polski",
  en: "English",
  de: "Deutsch",
};

/**
 * Flag icons from [material-ui-flags](https://github.com/ekiziltas/material-ui-flags)
 * (DE, UK). PL is local — that package does not ship IconFlagPL.
 */
export const LANGUAGE_FLAG_ICONS: Record<Language, ComponentType<SvgIconProps>> = {
  pl: IconFlagPL,
  en: IconFlagUK,
  de: IconFlagDE,
};

function initialLanguage(): Language {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
    return stored as Language;
  }
  const nav = navigator.language.toLowerCase();
  if (nav.startsWith("pl")) return "pl";
  if (nav.startsWith("de")) return "de";
  return "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    pl: { translation: pl },
    en: { translation: en },
    de: { translation: de },
  },
  lng: initialLanguage(),
  fallbackLng: "pl",
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: Language): void {
  localStorage.setItem(LANGUAGE_KEY, lang);
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
}

document.documentElement.lang = initialLanguage();

export default i18n;
