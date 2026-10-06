import { defineConfig, devices } from "@playwright/test";

// The tests run against the production build, served by `vite preview`,
// so the WebAssembly is loaded the way a visitor gets it. The build runs
// first every time. The preview serves on 4176; E2E_PORT moves it to
// another port, which is what CI does.
const PORT = Number(process.env.E2E_PORT ?? 4176);
const URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  use: { baseURL: URL, viewport: { width: 1440, height: 900 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: { command: `pnpm build && pnpm preview --port ${PORT} --strictPort`, url: URL, reuseExistingServer: false, timeout: 180_000 },
});
