import { test, expect } from "@playwright/test"
import { collectProblems, gotoAndSettle, seedTheme } from "./helpers"

/**
 * Tier 2 — auth-gated surfaces, no credentials.
 *
 * `/dev/preview/{surface}` mounts the REAL production components against
 * fixture data under `MockFetchProvider`, which intercepts every network
 * egress (same-origin API routes plus plc.directory and
 * public.api.bsky.app). That lets us render profile / feed / settings /
 * workspace / create / edit screens — all normally behind a session —
 * with no account, no Redis, and no ePDS.
 *
 * What this tier is for: catching render-time explosions, hydration
 * mismatches, missing providers, and crashes on empty-state data. It is
 * NOT a substitute for Tier 3 — nothing here touches a real write path.
 *
 * These routes `notFound()` when NODE_ENV === "production", so this file
 * only works against `npm run dev` (which playwright.config.ts starts).
 */

const SURFACES = [
  "profile",
  "profile-org",
  "feed",
  "settings",
  "workspace",
  "create",
  "profile-edit",
  "activity-edit",
] as const

/**
 * The preview harness mocks fetch client-side only, so the server render
 * (no fixtures) and the client render (fixtures) legitimately differ.
 * Every other error still fails the spec — see helpers.ts.
 */
const PREVIEW_OPTS = { allowHydrationMismatch: true } as const

test.describe("preview surfaces render cleanly", () => {
  for (const surface of SURFACES) {
    test(`${surface} — populated`, async ({ page }) => {
      const problems = collectProblems(page, PREVIEW_OPTS)
      await gotoAndSettle(page, `/dev/preview/${surface}`)

      // Rendered something real, not an error boundary or a 404.
      await expect(page.locator("body")).toBeVisible()
      expect(await page.locator("body").innerText()).not.toContain(
        "This page could not be found",
      )

      expect(problems.pageErrors, `${surface}: uncaught exceptions`).toEqual([])
      expect(problems.consoleErrors, `${surface}: console errors`).toEqual([])
    })
  }
})

test.describe("preview surfaces survive empty state", () => {
  // `?fixture=empty` swaps every connection for a zero-row response. This
  // is where "cannot read property of undefined" lives.
  for (const surface of SURFACES) {
    test(`${surface} — empty`, async ({ page }) => {
      const problems = collectProblems(page, PREVIEW_OPTS)
      await gotoAndSettle(page, `/dev/preview/${surface}?fixture=empty`)

      await expect(page.locator("body")).toBeVisible()
      expect(problems.pageErrors, `${surface}: uncaught exceptions`).toEqual([])
      expect(problems.consoleErrors, `${surface}: console errors`).toEqual([])
    })
  }
})

test.describe("managed (group-owned) scenario", () => {
  // `?managed=1` gives the mock session groups it owns/admins, exercising
  // the org-aggregation paths on Home and the profile tabs.
  for (const surface of ["feed", "profile", "workspace"] as const) {
    test(`${surface} — managed`, async ({ page }) => {
      const problems = collectProblems(page, PREVIEW_OPTS)
      await gotoAndSettle(page, `/dev/preview/${surface}?managed=1`)

      await expect(page.locator("body")).toBeVisible()
      expect(problems.pageErrors, `${surface}: uncaught exceptions`).toEqual([])
      expect(problems.consoleErrors, `${surface}: console errors`).toEqual([])
    })
  }
})

test.describe("dark mode", () => {
  // Hard rule #9 in CLAUDE.md: dark mode must work everywhere. A surface
  // that throws only under data-theme="dark" is a real (and easy) miss.
  for (const surface of SURFACES) {
    test(`${surface} — dark`, async ({ page }) => {
      const problems = collectProblems(page, PREVIEW_OPTS)
      await seedTheme(page, "dark")
      await gotoAndSettle(page, `/dev/preview/${surface}`)

      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
      expect(problems.pageErrors, `${surface}: uncaught exceptions`).toEqual([])
      expect(problems.consoleErrors, `${surface}: console errors`).toEqual([])
    })
  }
})
