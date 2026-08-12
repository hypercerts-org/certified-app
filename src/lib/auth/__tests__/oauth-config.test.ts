import { describe, expect, it } from "vitest"
import {
  buildLoopbackRedirectUri,
  buildWebOAuthClientMetadata,
  isLoopbackOAuthMode,
  requireOAuthPublicUrl,
} from "@/lib/auth/oauth-client"

describe("OAuth URL configuration", () => {
  it("builds public-client metadata from a Vercel branch fallback", () => {
    const origin = "https://certified-git-staging.vercel.app"
    const metadata = buildWebOAuthClientMetadata(origin, false)

    expect(metadata).toMatchObject({
      client_id: `${origin}/.well-known/oauth-client-metadata`,
      client_uri: origin,
      logo_uri: `${origin}/brand/brandmark/certified_brandmark_black_512.png`,
      redirect_uris: [`${origin}/oauth/callback`],
      token_endpoint_auth_method: "none",
    })
    expect(metadata).not.toHaveProperty("jwks_uri")
  })

  it("keeps confidential-client JWKS on the same canonical origin", () => {
    const origin = "https://staging.certified.app"
    const metadata = buildWebOAuthClientMetadata(origin, true)

    expect(metadata).toMatchObject({
      client_id: `${origin}/.well-known/oauth-client-metadata`,
      redirect_uris: [`${origin}/oauth/callback`],
      token_endpoint_auth_method: "private_key_jwt",
      token_endpoint_auth_signing_alg: "ES256",
      jwks_uri: `${origin}/.well-known/jwks.json`,
    })
  })

  it("selects loopback only for HTTP canonical URLs outside production", () => {
    expect(isLoopbackOAuthMode(undefined, "development")).toBe(true)
    expect(
      isLoopbackOAuthMode("http://127.0.0.1:4000", "development"),
    ).toBe(true)
    expect(
      isLoopbackOAuthMode(
        "https://certified-git-staging.vercel.app",
        "development",
      ),
    ).toBe(false)
    expect(
      isLoopbackOAuthMode("http://127.0.0.1:4000", "production"),
    ).toBe(false)
  })

  it("preserves the configured port in the loopback callback", () => {
    expect(buildLoopbackRedirectUri("http://localhost:4567")).toBe(
      "http://127.0.0.1:4567/oauth/callback",
    )
    expect(buildLoopbackRedirectUri(undefined)).toBe(
      "http://127.0.0.1:3000/oauth/callback",
    )
  })

  it("requires a configured HTTPS origin in production", () => {
    expect(() => requireOAuthPublicUrl(undefined, "production")).toThrow(
      /PUBLIC_URL.*VERCEL_BRANCH_URL.*VERCEL_URL/,
    )
    expect(() =>
      requireOAuthPublicUrl("http://127.0.0.1:3000", "production"),
    ).toThrow(/must use HTTPS in production/)
    expect(
      requireOAuthPublicUrl(
        "https://certified-git-staging.vercel.app",
        "production",
      ),
    ).toBe("https://certified-git-staging.vercel.app")
  })
})
