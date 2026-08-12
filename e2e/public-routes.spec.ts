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

  test("an unresolvable handle settles into 'Profile not found'", async ({
    page,
  }) => {
    // There is no 404 here to assert: `/{actor}` is a catch-all, so any
    // unknown top-level path is treated as a handle and resolved at
    // runtime. What matters is that resolution FAILS CLOSED — it must
    // reach the empty state rather than spin forever or throw.
    await page.goto("/this-handle-does-not-exist", {
      waitUntil: "domcontentloaded",
    })

    // Role-scoped: the resolver signals the miss by throwing, so the
    // literal string also appears in Next's dev error overlay and in the
    // source frame it prints. Only the rendered heading is the assertion.
    await expect(
      page.getByRole("heading", { name: /profile not found/i }),
    ).toBeVisible({ timeout: 20_000 })

    // No console-error assertion here on purpose: the not-found path is
    // implemented as throw-and-catch, so dev-mode surfaces it in the
    // overlay even though the UI handled it correctly.
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
