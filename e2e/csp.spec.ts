import { test, expect } from "@playwright/test"
import { gotoAndSettle } from "./helpers"

/**
 * CSP (TECH-803).
 *
 * src/proxy.ts enforces the strict nonce-based policy with a
 * per-request nonce. Violations fire `securitypolicyviolation` events, so
 * a route that something blocks fails here: an inline script without the
 * nonce, an injected handler, a script from an untrusted loader.
 */

const ROUTES = [
  "/welcome",
  "/explore",
  "/apps",
  "/help",
  "/terms",
  "/privacy",
  "/imprint",
  "/dsa",
  // Without query params the callback page renders its error state.
  "/oauth/callback",
  // Framed by other sites; the board fetch fails for the fake record.
  "/embed/board/did:plc:csptest/csptest",
  // Real production components under the mock harness: the editor and
  // the signed-in surfaces.
  "/dev/preview/create",
  "/dev/preview/activity-edit",
  "/dev/preview/profile",
  "/dev/preview/profile-org",
  "/dev/preview/profile-edit",
  "/dev/preview/feed",
  "/dev/preview/settings",
  "/dev/preview/workspace",
] as const

test.describe("strict CSP", () => {
  for (const route of ROUTES) {
    test(`${route} has no violations`, async ({ page }) => {
      await page.addInitScript(() => {
        const w = window as unknown as { __cspViolations: string[] }
        w.__cspViolations = []
        document.addEventListener("securitypolicyviolation", (e) => {
          w.__cspViolations.push(
            `${e.effectiveDirective} blocked ${e.blockedURI || "(inline)"} at ${e.sourceFile}:${e.lineNumber}`,
          )
        })
      })

      const response = await page.goto(route, { waitUntil: "networkidle" })
      const headers = response?.headers() ?? {}
      const policy = headers["content-security-policy"]
      expect(policy, "policy header").toBeTruthy()
      expect(policy).toMatch(/'nonce-[^']+'/)
      expect(policy).toContain("'strict-dynamic'")
      expect(headers["content-security-policy-report-only"]).toBeUndefined()

      await gotoAndSettle(page, route)

      // Next.js stamped this request's nonce on its scripts. (The nonce
      // attribute is hidden from getAttribute; the property keeps it.)
      const nonced = await page.evaluate(
        () =>
          [...document.querySelectorAll("script")].filter((s) => s.nonce)
            .length,
      )
      expect(nonced, "scripts carrying a nonce").toBeGreaterThan(0)

      const violations = await page.evaluate(
        () =>
          (window as unknown as { __cspViolations: string[] }).__cspViolations,
      )
      expect(violations, `${route}: CSP violations`).toEqual([])
    })
  }

  test("an injected inline handler is blocked", async ({ page }) => {
    await gotoAndSettle(page, "/terms")
    await page.evaluate(() => {
      const div = document.createElement("div")
      div.innerHTML = '<img src="x" onerror="window.__injectedRan = true">'
      document.body.appendChild(div)
    })
    await page.waitForTimeout(500)
    expect(
      await page.evaluate(
        () => (window as unknown as { __injectedRan?: boolean }).__injectedRan,
      ),
    ).toBeUndefined()
  })

  test("a fresh nonce per request", async ({ request }) => {
    const nonceOf = async () =>
      (await request.get("/terms"))
        .headers()
        ["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1]
    const [a, b] = [await nonceOf(), await nonceOf()]
    expect(a).toBeTruthy()
    expect(a).not.toBe(b)
  })

  test("the report endpoint accepts both report formats", async ({
    request,
  }) => {
    const legacy = await request.post("/api/csp-report", {
      headers: { "content-type": "application/csp-report" },
      data: JSON.stringify({
        "csp-report": {
          "document-uri": "http://127.0.0.1:3000/welcome",
          "effective-directive": "script-src-elem",
          "blocked-uri": "inline",
        },
      }),
    })
    expect(legacy.status()).toBe(204)

    const reportingApi = await request.post("/api/csp-report", {
      headers: { "content-type": "application/reports+json" },
      data: JSON.stringify([
        {
          type: "csp-violation",
          body: {
            documentURL: "http://127.0.0.1:3000/welcome",
            effectiveDirective: "script-src-elem",
            blockedURL: "inline",
          },
        },
      ]),
    })
    expect(reportingApi.status()).toBe(204)

    const garbage = await request.post("/api/csp-report", {
      headers: { "content-type": "application/json" },
      // A Buffer goes out as raw bytes; a string would be JSON-encoded.
      data: Buffer.from("not json"),
    })
    expect(garbage.status()).toBe(400)
  })
})
