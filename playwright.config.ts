import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright config for the E2E tiers. See AGENTS.md §27.
 *
 * ORIGIN DISCIPLINE — the single most important thing in this file.
 * `checkCsrf` (src/lib/auth/csrf.ts) requires the request origin to equal
 * the destination origin AND be allowlisted, and the loopback exemption
 * matches on protocol *and* port. So:
 *
 *   - the host spelling must match PUBLIC_URL exactly — `127.0.0.1` and
 *     `localhost` are different origins to CSRF, and cookies don't cross
 *     between them either;
 *   - the port must be pinned. `next dev` silently falls back to 3001
 *     when 3000 is busy, which produces 403s on every POST that read as
 *     auth bugs. `--port` without `--turbo`'s auto-increment plus
 *     `reuseExistingServer` keeps this honest.
 *
 * Change BASE_URL here only together with PUBLIC_URL in .env.local.
 */

const HOST = "127.0.0.1"
const PORT = 3000
const BASE_URL = process.env.E2E_BASE_URL ?? `http://${HOST}:${PORT}`

export default defineConfig({
  testDir: "./e2e",
  // Tier 3 needs a session seeded before any spec runs; it no-ops when
  // E2E_TEST_DID is absent so the credential-free tiers still run.
  globalSetup: "./e2e/auth/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // `next dev` compiles routes on first request. Too much parallelism
  // makes every worker race the same cold compile and time out.
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],

  webServer: {
    // Pinned host + port — see ORIGIN DISCIPLINE above.
    command: `npm run dev -- --port ${PORT} --hostname ${HOST}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // A cold Next dev boot plus first compile is slow; this is startup
    // budget, not per-test budget.
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
})
