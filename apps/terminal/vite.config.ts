import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import { firstPaintScript } from "@ghostjima/stoa-react/first-paint";
import { PREFERENCES } from "./src/preferences";
import { contentSecurityPolicy } from "./csp";

// Served from GitHub Pages under /tyche/.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/tyche/" : "/",
  plugins: [
    react(),
    // The language, direction and theme before the first paint: Stoa's
    // script, from the same choices the app reads. At the end of the head
    // rather than its start, so the charset stays in the first 1,024 bytes
    // where the browser looks for it; it still runs before the body is
    // drawn, and before the app's module script.
    {
      name: "first-paint",
      transformIndexHtml: () => [{ tag: "script", children: firstPaintScript(PREFERENCES), injectTo: "head" }],
    },
    // The built page's Content Security Policy, with the hash of the
    // script above as it stands in the page. Last, so it sees the page as
    // it will be served; the dev server's page has none.
    contentSecurityPolicy(),
  ],
  // Stoa is linked from the sibling repository and has its own
  // node_modules: without dedupe the app would run two copies of React and
  // fail with "Invalid hook call".
  resolve: { dedupe: ["react", "react-dom", "react-aria-components"] },
  // The market worker imports tyche-market's WebAssembly glue, which finds
  // its module through import.meta.url: an ES module worker keeps it.
  worker: { format: "es" },
  server: {
    port: 5181,
    strictPort: true,
    // What the dev server may serve: this workspace (the app, the twin's
    // build and the engines' WebAssembly packages) and the linked Stoa
    // packages with their dependencies. Not the whole parent folder, which
    // would hand the other repositories' files (ignored ones included) to
    // anything that can reach the server.
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), "../../../stoa/packages", "../../../stoa/node_modules"],
    },
  },
  preview: { port: 4176, strictPort: true },
});
