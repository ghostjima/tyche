import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider, useAppPreferences } from "@ghostjima/stoa-react";
import "@ghostjima/stoa-tokens/tokens.css";
import "./styles.css";
import { App } from "./App";
import { LOCALES, type Lang } from "./i18n";
import { PREFERENCES } from "./preferences";

/** The language and the theme, as index.html's first-paint script read
 * them. The provider sets the locale for Stoa, React Aria and the app's
 * own formats together. */
function Root() {
  const { language, theme } = useAppPreferences(PREFERENCES);
  const lang = language.language as Lang;
  return (
    <I18nProvider locale={LOCALES[lang]}>
      <App lang={lang} onLang={(next) => language.setLanguage(next)} theme={theme} />
    </I18nProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
