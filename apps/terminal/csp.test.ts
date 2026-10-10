import { describe, expect, it } from "vitest";
import { firstPaintScript } from "@ghostjima/stoa-react/first-paint";
import { PREFERENCES } from "./src/preferences";
import { REACT_ARIA_STYLES, contentSecurityPolicy, hashSource, inlineScripts, policyFor, withPolicy } from "./csp";

const page = (head: string) => `<!doctype html>\n<html lang="ru">\n  <head>\n    <meta charset="UTF-8" />\n${head}\n  </head>\n  <body></body>\n</html>\n`;

/** The policy stated in a page, by directive. */
function stated(html: string): Record<string, string[]> {
  const content = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";
  return Object.fromEntries(content.split("; ").map((directive) => [directive.split(" ")[0] ?? "", directive.split(" ").slice(1)]));
}

describe("the built page's Content Security Policy", () => {
  it("hashes a text as the browser does: SHA-256 in base64, line endings as line feeds", () => {
    // The published SHA-256 of the empty string.
    expect(hashSource("")).toBe("'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
    expect(hashSource("a\r\nb\rc")).toBe(hashSource("a\nb\nc"));
    expect(hashSource("a")).not.toBe(hashSource("a "));
  });

  it("reads the inline scripts of a page and leaves out the ones with a src", () => {
    const html = page(`    <script type="module" crossorigin src="/assets/index.js"></script>\n    <script>one();</script>\n    <SCRIPT type="module">\ntwo();\n</SCRIPT>`);
    expect(inlineScripts(html)).toEqual(["one();", "\ntwo();\n"]);
  });

  it("allows the first-paint script by the hash of its text in the page, so an edit changes the hash", () => {
    const script = firstPaintScript(PREFERENCES);
    const html = withPolicy(page(`    <script>${script}</script>`));
    expect(stated(html)["script-src"]).toEqual(["'self'", hashSource(script), "'wasm-unsafe-eval'"]);
    const edited = withPolicy(page(`    <script>${script} </script>`));
    expect(stated(edited)["script-src"]).toEqual(["'self'", hashSource(`${script} `), "'wasm-unsafe-eval'"]);
    expect(stated(edited)["script-src"]).not.toEqual(stated(html)["script-src"]);
  });

  it("states every directive, and nowhere 'unsafe-inline' or 'unsafe-eval'", () => {
    const policy = stated(withPolicy(page("")));
    expect(policy).toEqual({
      "default-src": ["'self'"],
      "script-src": ["'self'", "'wasm-unsafe-eval'"],
      "style-src": ["'self'", ...REACT_ARIA_STYLES.map(hashSource)],
      "img-src": ["'self'", "data:"],
      "font-src": ["'self'"],
      "connect-src": ["'self'"],
      "worker-src": ["'self'"],
      "base-uri": ["'self'"],
      "form-action": ["'none'"],
      "object-src": ["'none'"],
    });
    expect(policyFor(["x"])).not.toMatch(/'unsafe-inline'|'unsafe-eval'|\*/);
  });

  it("puts the policy right after the charset, before any script, style or link", () => {
    const html = withPolicy(page(`    <link rel="stylesheet" href="/a.css">\n    <script>one();</script>`));
    const lines = html.split("\n");
    expect(lines[3]).toBe(`    <meta charset="UTF-8" />`);
    expect(lines[4]).toMatch(/^ {4}<meta http-equiv="Content-Security-Policy" content="default-src 'self'; /);
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<link"));
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script"));
  });

  it("refuses a page it cannot protect", () => {
    expect(() => withPolicy("<!doctype html><html><head><title>x</title></head></html>")).toThrow(/no <meta charset>/);
    expect(() => withPolicy(`<!doctype html><html><head><script>early();</script><meta charset="utf-8"></head></html>`)).toThrow(/before <meta charset>/);
    expect(() => withPolicy(withPolicy(page("")))).toThrow(/already states/);
  });

  it("is written by the build only: the dev server's page has no policy", () => {
    expect(contentSecurityPolicy().apply).toBe("build");
  });
});
