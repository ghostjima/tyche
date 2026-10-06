import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider, applyLanguage, applyTheme, readLanguage, readThemeChoice, useLanguagePreference } from "@ghostjima/stoa-react";
import "@ghostjima/stoa-tokens/tokens.css";
import "./styles.css";
import notoArabic from "@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2?url";
import plexArabic from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2?url";
import { App } from "./App";
import { LANGS, LANG_STORE, LOCALES, THEME_STORE, type Lang } from "./i18n";

// index.html has set the theme and the language already; these apply
// Stoa's own reading of them, which is the same.
applyTheme(readThemeChoice(THEME_STORE));
applyLanguage(readLanguage(LANGS, LANG_STORE));

// An Arabic page asks for its faces now, before React draws any text, so
// they usually arrive before the first paint: IBM Plex Sans Arabic for the
// words and Noto Sans Arabic for the digits in the numeric face, whose
// width and height differ from the fallback's enough to rewrap a row of
// figures when it arrives. Only in Arabic: a preload that is not used
// costs the download.
if (document.documentElement.lang === "ar") {
  for (const href of [plexArabic, notoArabic]) {
    document.head.append(Object.assign(document.createElement("link"), { rel: "preload", as: "font", type: "font/woff2", href, crossOrigin: "anonymous" }));
  }
}

/** The language, from ?lang= or the last visit. The provider sets the
 * locale for Stoa, React Aria and the app's own formats together. */
function Root() {
  const language = useLanguagePreference({ languages: LANGS, ...LANG_STORE });
  const lang = language.language as Lang;
  return (
    <I18nProvider locale={LOCALES[lang]}>
      <App lang={lang} onLang={(next) => language.setLanguage(next)} />
    </I18nProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
