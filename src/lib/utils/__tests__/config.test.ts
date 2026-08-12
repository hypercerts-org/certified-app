import { describe, expect, it } from "vitest"
import {
  resolveAppUrlConfig,
  type AppUrlEnvironment,
} from "@/lib/utils/config"

function origins(env: AppUrlEnvironment): string[] {
  return [...resolveAppUrlConfig(env).allowedRequestOrigins]
}

describe("resolveAppUrlConfig", () => {
  it("prefers PUBLIC_URL while trusting every configured exact origin", () => {
    const config = resolveAppUrlConfig({
      NODE_ENV: "production",
      PUBLIC_URL: "https://staging.certified.app/",
      VERCEL_BRANCH_URL: "certified-git-staging.vercel.app",
      VERCEL_URL: "certified-a1b2c3.vercel.app",
    })

    expect(config.canonicalUrl).toBe("https://staging.certified.app")
    expect([...config.allowedRequestOrigins]).toEqual([
      "https://staging.certified.app",
      "https://certified-git-staging.vercel.app",
      "https://certified-a1b2c3.vercel.app",
    ])
  })

  it("uses the stable branch URL when PUBLIC_URL is absent", () => {
    const config = resolveAppUrlConfig({
      NODE_ENV: "production",
      VERCEL_BRANCH_URL: "certified-git-staging.vercel.app",
      VERCEL_URL: "certified-a1b2c3.vercel.app",
    })

    expect(config.canonicalUrl).toBe(
      "https://certified-git-staging.vercel.app",
    )
  })

  it("uses the commit deployment URL when it is the only configured URL", () => {
    const config = resolveAppUrlConfig({
      NODE_ENV: "production",
      VERCEL_URL: "certified-a1b2c3.vercel.app",
    })

    expect(config.canonicalUrl).toBe("https://certified-a1b2c3.vercel.app")
  })

  it("fails closed in production when no URL is configured", () => {
    const config = resolveAppUrlConfig({ NODE_ENV: "production" })

    expect(config.canonicalUrl).toBeUndefined()
    expect([...config.allowedRequestOrigins]).toEqual([])
  })

  it("uses localhost only when no URL is configured outside production", () => {
    expect(resolveAppUrlConfig({ NODE_ENV: "development" }).canonicalUrl).toBe(
      "http://localhost:3000",
    )
    expect(origins({ NODE_ENV: "test" })).toEqual([
      "http://localhost:3000",
    ])
  })

  it("treats empty values as absent", () => {
    const config = resolveAppUrlConfig({
      NODE_ENV: "production",
      PUBLIC_URL: "  ",
      VERCEL_BRANCH_URL: "\t",
      VERCEL_URL: "certified-a1b2c3.vercel.app",
    })

    expect(config.canonicalUrl).toBe("https://certified-a1b2c3.vercel.app")
  })

  it("allows HTTP only for loopback origins", () => {
    expect(
      resolveAppUrlConfig({
        NODE_ENV: "development",
        PUBLIC_URL: "http://127.0.0.1:4000",
      }).canonicalUrl,
    ).toBe("http://127.0.0.1:4000")

    // next build sets NODE_ENV=production while loading the documented local
    // .env value. Runtime OAuth initialization separately enforces HTTPS.
    expect(
      resolveAppUrlConfig({
        NODE_ENV: "production",
        PUBLIC_URL: "http://127.0.0.1:4000",
      }).canonicalUrl,
    ).toBe("http://127.0.0.1:4000")

    expect(() =>
      resolveAppUrlConfig({
        NODE_ENV: "development",
        PUBLIC_URL: "http://192.168.1.20:3000",
      }),
    ).toThrow(/PUBLIC_URL must be an origin/)
  })

  it.each([
    "certified.app",
    "https://user:pass@certified.app",
    "https://certified.app/oauth/callback",
    "https://certified.app?preview=true",
    "https://certified.app#preview",
  ])("rejects malformed PUBLIC_URL value %s", (PUBLIC_URL) => {
    expect(() =>
      resolveAppUrlConfig({ NODE_ENV: "production", PUBLIC_URL }),
    ).toThrow(/PUBLIC_URL must be an origin/)
  })

  it.each([
    ["VERCEL_BRANCH_URL", "https://certified-git-staging.vercel.app"],
    ["VERCEL_BRANCH_URL", "certified-git-staging.vercel.app/path"],
    ["VERCEL_URL", "certified-a1b2c3.vercel.app:443"],
    ["VERCEL_URL", "certified-a1b2c3.vercel.app@evil.example"],
    ["VERCEL_URL", "certified-a1b2c3.evil.example"],
  ] as const)("rejects malformed %s value %s", (name, value) => {
    expect(() =>
      resolveAppUrlConfig({
        NODE_ENV: "production",
        [name]: value,
      }),
    ).toThrow(new RegExp(name))
  })
})
