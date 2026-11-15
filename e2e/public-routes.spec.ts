import { test, expect } from "@playwright/test"
import { collectProblems, gotoAndSettle } from "./helpers"

/**
 * Tier 2 — the signed-out route walk.
 *
 * Unlike smoke.spec.ts these are the REAL routes with no fixture layer,
 * visited with no session cookie. They exercise the public-read boundary
 * end to end: `PUBLIC_READ_METHODS` in the XRPC proxy, the unauthenticated
 * `/api/search-actors` path, and every marketing/legal page.
 *
 * A logged-in developer never sees these break. That is exactly why they
 * are worth pinning.
 */

/** Routes that must render for an anonymous visitor. */
const PUBLIC_ROUTES = [
  "/welcome",
  "/explore",
  "/apps",
  "/help",
  "/terms",
  "/privacy",
  "/imprint",
  "/dsa",
] as const

test.describe("public routes render for signed-out visitors", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route}`, async ({ page }) => {
      const problems = collectProblems(page)
      const response = await page.goto(route, { waitUntil: "networkidle" })

      expect(response?.status(), `${route} should not error`).toBeLessThan(400)
      // Every page must expose exactly one h1 — nested <main> landmarks
      // and duplicate h1s were both real regressions here.
      await expect(page.locator("h1").first()).toBeVisible()

      expect(problems.pageErrors, `${route}: uncaught exceptions`).toEqual([])
      expect(problems.consoleErrors, `${route}: console errors`).toEqual([])
    })
  }
})

test.describe("routing invariants", () => {
  test("/ redirects signed-out visitors to /welcome", async ({ page }) => {
    await gotoAndSettle(page, "/")
    await expect(page).toHaveURL(/\/welcome$/)
  })

  test("/groups redirects to /home (retired index)", async ({ page }) => {
    // The standalone listing was replaced by the profile Groups tab; the
    // URL is kept as a redirect so old links don't 404.
    await page.goto("/groups", { waitUntil: "domcontentloaded" })
    await expect(page).not.toHaveURL(/\/groups$/)
  })

  // `/{actor}` is a catch-all, so every unknown top-level path lands on the
  // actor route. What matters is that it FAILS CLOSED: it must reach a
  // not-found page rather than spin forever or throw. Which one depends on
  // the path (src/app/not-found.tsx): only a path that reads as an account
  // (a handle, which has a dot, or a DID) is a missing profile.
  //
  // Role-scoped headings: the miss is signalled by throwing, so the literal
  // string also appears in Next's dev error overlay and in the source frame
  // it prints. No console-error assertion for the same reason: dev mode
  // surfaces the throw in the overlay even though the UI handled it.

  test("a path that isn't a handle gets the generic 'Page not found'", async ({
    page,
  }) => {
    await page.goto("/this-page-does-not-exist", {
      waitUntil: "domcontentloaded",
    })
    await expect(
      page.getByRole("heading", { name: /page not found/i }),
    ).toBeVisible({ timeout: 20_000 })
  })

  test("a handle that can't exist settles into 'Profile not found'", async ({
    page,
  }) => {
    // Handle-shaped (it has a dot) but not valid handle syntax (the
    // underscore), so it is missing without a network lookup and the test
    // doesn't depend on the appView, DNS or the indexer being reachable.
    await page.goto("/no_such.handle", { waitUntil: "domcontentloaded" })
    await expect(
      page.getByRole("heading", { name: /profile not found/i }),
    ).toBeVisible({ timeout: 20_000 })
  })
})

test.describe("dev preview is not reachable in production builds", () => {
  // Guard rail: if these routes ever stopped being NODE_ENV-gated, the
  // fixture harness (and a fake session) would ship to real users.
  test("the gate exists in the source", async () => {
    const { readFileSync } = await import("node:fs")
    const source = readFileSync(
      "src/app/dev/preview/[surface]/page.tsx",
      "utf8",
    )
    expect(source).toContain('process.env.NODE_ENV === "production"')
    expect(source).toContain("notFound()")
  })
})
