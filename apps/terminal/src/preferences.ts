// The language and theme choices, described once: index.html's head gets
// Stoa's first-paint script built from this (vite.config.ts), which sets
// lang, dir and data-theme before anything is drawn, and the app reads and
// changes the same choices with useAppPreferences. Both read a choice the
// same way: ?lang= and ?theme= first, then the last visit's choice under
// the product's own keys, then Russian and the system theme. No React
// here, so the build config can import it.
import type { FirstPaintConfig } from "@ghostjima/stoa-react/first-paint";

export const PREFERENCES = {
  languages: ["ru", "en"],
  language: { param: "lang", storageKey: "tyche.lang" },
  theme: { param: "theme", storageKey: "tyche.theme" },
} satisfies FirstPaintConfig;
