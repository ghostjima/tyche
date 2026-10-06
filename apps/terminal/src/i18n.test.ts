import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "./engine/types";
import { LANGS, LANG_STORE, LOCALES, THEME_STORE, strings, type Strings } from "./i18n";

type Leaf = string | ((...a: string[]) => string);

/** Every leaf with its dotted path; arrays and records are walked. */
function leaves(value: unknown, path = ""): [string, Leaf][] {
  if (typeof value === "string" || typeof value === "function") return [[path, value as Leaf]];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  throw new Error(`${path}: unexpected ${typeof value}`);
}

const shape = (s: Strings) => leaves(s).map(([k, v]) => `${k}:${typeof v}${typeof v === "function" ? v.length : ""}`).sort();
const rendered = (s: Strings) => leaves(s).map(([k, v]) => [k, typeof v === "function" ? v("@1", "@2", "@3") : v] as const);

describe("interface strings", () => {
  it("Russian is the first language and the default, English the second, and there is no other", () => {
    expect(LANGS).toEqual(["ru", "en"]);
    expect(Object.keys(strings).sort()).toEqual(["en", "ru"]);
    expect(LOCALES).toEqual({ ru: "ru-RU", en: "en-US" });
  });

  it("the choices are kept under the product's own storage keys", () => {
    expect(LANG_STORE).toEqual({ param: "lang", storageKey: "tyche.lang" });
    expect(THEME_STORE).toEqual({ param: "theme", storageKey: "tyche.theme" });
  });

  it("Russian and English have the same keys, with the same kinds of value", () => {
    for (const lang of LANGS) expect(shape(strings[lang]), lang).toEqual(shape(strings.en));
  });

  it("every function uses each of its arguments", () => {
    for (const lang of LANGS)
      for (const [k, v] of leaves(strings[lang]))
        if (typeof v === "function") {
          const out = v("@1", "@2", "@3");
          for (let i = 1; i <= v.length; i++) expect(out, `${lang}.${k}`).toContain(`@${i}`);
        }
  });

  it("no string is empty, and none holds a digit: numbers come formatted for the locale", () => {
    for (const lang of LANGS)
      for (const [k, v] of rendered(strings[lang])) {
        expect(v.trim(), `${lang}.${k}`).not.toBe("");
        expect(v.replace(/@\d/g, ""), `${lang}.${k}`).not.toMatch(/[0-9]/);
      }
  });

  it("every engine error code has a message in each language", () => {
    for (const lang of LANGS) for (const code of ERROR_CODES) expect(strings[lang].errors[code], `${lang}.${code}`).toBeTruthy();
    expect(Object.keys(strings.en.errors).sort()).toEqual([...ERROR_CODES].sort());
  });

  it("the header's title and subtitle start with a capital and have no full stop", () => {
    for (const lang of LANGS) {
      for (const text of [strings[lang].title, strings[lang].subtitle]) {
        expect(text.endsWith("."), `${lang}: ${text}`).toBe(false);
        const first = text[0]!;
        expect(first, `${lang}: ${text}`).toBe(first.toLocaleUpperCase());
      }
    }
  });
});
