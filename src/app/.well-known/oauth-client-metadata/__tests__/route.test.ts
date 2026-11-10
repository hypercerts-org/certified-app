import { describe, it, expect, vi } from "vitest"

/**
 * The ePDS reads these extension fields from our published client metadata.
 * Dropping one fails silently: without `epds_social_providers` the "Sign in
 * with Google" button just lands on the ePDS login page, and without
 * `epds_handle_login_url` the ePDS hides its AT Protocol hand-off. So pin them.
 */

vi.mock("@/lib/auth/oauth-client", () => ({
  getOAuthClient: vi.fn(async () => ({
    clientMetadata: {
      client_id: "https://app.example.test/.well-known/oauth-client-metadata",
    },
  })),
}))

describe("GET /.well-known/oauth-client-metadata", () => {
  it("publishes the ePDS extensions the login route depends on", async () => {
    const { GET } = await import("../route")

    const body = (await (await GET()).json()) as Record<string, unknown>

    expect(body.epds_social_providers).toEqual(["google"])
    expect(body.epds_handle_login_url).toBe("https://app.example.test/api/auth/login")
  })
})
