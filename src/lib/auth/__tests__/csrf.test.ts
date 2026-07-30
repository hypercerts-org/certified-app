import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

const allowedOrigins = vi.hoisted(
  () =>
    new Set([
      "https://staging.certified.app",
      "https://certified-git-staging.vercel.app",
      "https://certified-a1b2c3.vercel.app",
      "http://127.0.0.1:3000",
    ]),
)

vi.mock("@/lib/utils/config", () => ({
  ALLOWED_REQUEST_ORIGINS: allowedOrigins,
}))

import { checkCsrf } from "@/lib/auth/csrf"

function mutation(
  destination: string,
  headers: Record<string, string>,
): NextRequest {
  return new NextRequest(`${destination}/api/auth/login`, {
    method: "POST",
    headers,
  })
}

async function expectForbidden(response: Response | null, message: string) {
  expect(response?.status).toBe(403)
  await expect(response?.json()).resolves.toEqual({ error: message })
}

describe("checkCsrf", () => {
  it.each([
    "https://staging.certified.app",
    "https://certified-git-staging.vercel.app",
    "https://certified-a1b2c3.vercel.app",
  ])("accepts same-origin mutations on configured origin %s", (origin) => {
    expect(checkCsrf(mutation(origin, { origin }))).toBeNull()
  })

  it("does not make configured branch and deployment hosts cross-origin peers", async () => {
    const response = checkCsrf(
      mutation("https://certified-a1b2c3.vercel.app", {
        origin: "https://certified-git-staging.vercel.app",
      }),
    )

    await expectForbidden(response, "Forbidden: invalid origin")
  })

  it("rejects an unconfigured lookalike even when source and destination match", async () => {
    const origin = "https://certified-a1b2c3.vercel.app.evil.example"
    const response = checkCsrf(mutation(origin, { origin }))

    await expectForbidden(response, "Forbidden: invalid origin")
  })

  it("accepts a Referer with a path when Origin is absent", () => {
    const response = checkCsrf(
      mutation("https://staging.certified.app", {
        referer: "https://staging.certified.app/settings?tab=account",
      }),
    )

    expect(response).toBeNull()
  })

  it("rejects a path-bearing Origin header", async () => {
    const response = checkCsrf(
      mutation("https://staging.certified.app", {
        origin: "https://staging.certified.app/unexpected",
      }),
    )

    await expectForbidden(response, "Forbidden: invalid origin")
  })

  it("does not fall back to Referer when Origin is malformed", async () => {
    const response = checkCsrf(
      mutation("https://staging.certified.app", {
        origin: "not a URL",
        referer: "https://staging.certified.app/settings",
      }),
    )

    await expectForbidden(response, "Forbidden: invalid origin")
  })

  it("rejects literal null origins", async () => {
    const response = checkCsrf(
      mutation("https://staging.certified.app", { origin: "null" }),
    )

    await expectForbidden(response, "Forbidden: null origin")
  })

  it("rejects requests without Origin or Referer", async () => {
    const response = checkCsrf(mutation("https://staging.certified.app", {}))

    await expectForbidden(response, "Forbidden: missing origin")
  })

  it("accepts localhost as the development equivalent of configured 127.0.0.1", () => {
    const origin = "http://localhost:3000"

    expect(checkCsrf(mutation(origin, { origin }))).toBeNull()
  })

  it("does not treat a different loopback port as equivalent", async () => {
    const origin = "http://localhost:4000"
    const response = checkCsrf(mutation(origin, { origin }))

    await expectForbidden(response, "Forbidden: invalid origin")
  })
})
