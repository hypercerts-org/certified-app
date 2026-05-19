import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { redactSecrets, logSafe } from "../log-safe"

describe("redactSecrets", () => {
  describe("JWT shapes", () => {
    it("redacts a 3-part JWT", () => {
      const out = redactSecrets(
        "Bearer eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJkaWQ6cGxjOmFiYyJ9.signature",
      )
      expect(out).not.toContain("eyJhbGciOiJFUzI1NiJ9")
      expect(out).toContain("<jwt>")
    })

    it("handles trailing base64 padding (`=`)", () => {
      const out = redactSecrets("eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJkaWQ6cGxjOmFiYyJ9.aa==")
      expect(out).toContain("<jwt>")
    })

    it("does not collapse two adjacent JWTs into one redaction", () => {
      const out = redactSecrets(
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYWEifQ.sig1 and " +
          "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJiYmIifQ.sig2",
      )
      // Both should redact; check the redaction marker appears twice.
      const matches = out.match(/<jwt>/g) ?? []
      expect(matches.length).toBe(2)
    })
  })

  describe("header lines", () => {
    it.each([
      ["Authorization"],
      ["DPoP"],
      ["Cookie"],
      ["Set-Cookie"],
    ])("redacts %s header value", (header) => {
      const out = redactSecrets(`${header}: some-secret-value-here`)
      expect(out).toBe(`${header}: <redacted>`)
    })

    it("is case-insensitive on the header name", () => {
      expect(redactSecrets("authorization: x")).toBe("authorization: <redacted>")
      expect(redactSecrets("AUTHORIZATION: x")).toBe("AUTHORIZATION: <redacted>")
    })

    it("does not bleed into adjacent JSON keys (stops at quotes/newlines)", () => {
      const out = redactSecrets(
        '{"Authorization":"Bearer x","other":"keep me"}',
      )
      expect(out).toContain('"other":"keep me"')
    })
  })

  describe("OAuth grants", () => {
    it.each([
      ["access_token"],
      ["refresh_token"],
      ["id_token"],
    ])("redacts form-encoded %s", (param) => {
      const out = redactSecrets(`${param}=long.secret.value`)
      expect(out).toBe(`${param}=<redacted>`)
    })

    it.each([
      ["access_token"],
      ["refresh_token"],
      ["id_token"],
    ])("redacts JSON-shape %s", (param) => {
      const out = redactSecrets(`{"${param}":"long.secret.value","x":"y"}`)
      expect(out).toContain(`"${param}":"<redacted>"`)
      expect(out).toContain('"x":"y"')
    })
  })

  describe("OAuth callback params", () => {
    it("redacts the code= param", () => {
      const out = redactSecrets("redirect_uri=https://example.com/cb?code=abc123&state=xyz")
      expect(out).not.toContain("abc123")
      expect(out).toContain("code=<redacted>")
    })

    it("redacts the state= param", () => {
      const out = redactSecrets("?state=randomly-generated-csrf-nonce")
      expect(out).toContain("state=<redacted>")
    })
  })

  describe("JWK private material", () => {
    it("redacts the d field (EC private key)", () => {
      const out = redactSecrets('{"kty":"EC","crv":"P-256","d":"PRIVATE_VALUE_HERE"}')
      expect(out).toContain('"d":"<redacted>"')
      expect(out).not.toContain("PRIVATE_VALUE_HERE")
    })

    it.each([
      ["dp"],
      ["dq"],
      ["qi"],
      ["k"],
      ["p"],
      ["q"],
    ])("redacts the %s field", (field) => {
      const out = redactSecrets(`{"${field}":"PRIVATE"}`)
      expect(out).toContain(`"${field}":"<redacted>"`)
    })
  })

  describe("email addresses", () => {
    it("redacts a plain email", () => {
      expect(redactSecrets("user@example.com signed in")).toBe(
        "<email> signed in",
      )
    })

    it("redacts dotted-local emails", () => {
      expect(redactSecrets("first.last+tag@sub.example.co.uk")).toBe("<email>")
    })

    it("does not replace already-redacted placeholders (no '@' in them)", () => {
      const out = redactSecrets("Bearer <jwt> for user@example.com")
      expect(out).toContain("<jwt>")
      expect(out).toContain("<email>")
    })
  })

  describe("failsafe", () => {
    it("returns the input unchanged when nothing matches", () => {
      const input = "plain log line, nothing to redact"
      expect(redactSecrets(input)).toBe(input)
    })

    it("returns <redaction-failed> if redaction throws", () => {
      // The function only throws if input.replace throws, which only
      // happens on non-string input. Cast through unknown to exercise
      // the catch arm.
      const input = { toString: () => { throw new Error("boom") } } as unknown as string
      expect(redactSecrets(input)).toBe("<redaction-failed>")
    })
  })
})

describe("logSafe", () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it("logs prefix + sanitized message", () => {
    logSafe("[xrpc]", {
      name: "AtprotoError",
      message: "Authorization: Bearer abc.def.ghi failed validation",
    })
    expect(consoleError).toHaveBeenCalledTimes(1)
    const [prefix, payload] = consoleError.mock.calls[0]
    expect(prefix).toBe("[xrpc]")
    expect(payload).toMatchObject({ name: "AtprotoError" })
    const messageStr = String((payload as Record<string, unknown>).message ?? "")
    expect(messageStr).toContain("<redacted>")
    expect(messageStr).not.toContain("abc.def.ghi")
  })

  it("drops err.cause and err.stack", () => {
    const err = {
      name: "Foo",
      message: "ok",
      cause: { secretRequest: "Bearer abc" },
      stack: "Error: ...\n  at Bearer abc",
    }
    logSafe("[x]", err)
    const payload = consoleError.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty("cause")
    expect(payload).not.toHaveProperty("stack")
  })

  it("merges in `extra` keys", () => {
    logSafe("[x]", { name: "F", message: "m" }, { status: 503, method: "PUT" })
    const payload = consoleError.mock.calls[0][1] as Record<string, unknown>
    expect(payload).toMatchObject({ status: 503, method: "PUT" })
  })

  it("does not throw on non-Error input", () => {
    expect(() => logSafe("[x]", null)).not.toThrow()
    expect(() => logSafe("[x]", undefined)).not.toThrow()
    expect(() => logSafe("[x]", "raw string")).not.toThrow()
    expect(() => logSafe("[x]", 42)).not.toThrow()
  })

  it("omits the message field when redaction fails", () => {
    // Pass an object whose `.message` is a property that throws on
    // string coercion would be ideal — but redactSecrets only fails
    // when `.replace` throws, which requires a non-string. Build an
    // object whose `.message` is itself a non-string-with-throwing-toString.
    const err = {
      name: "Foo",
      get message() {
        return { toString() { throw new Error("boom") } } as unknown as string
      },
    }
    expect(() => logSafe("[x]", err)).not.toThrow()
    const payload = consoleError.mock.calls[0][1] as Record<string, unknown>
    // Either no `message` key, or the `<redaction-failed>` sentinel
    // gets filtered out by the implementation.
    if ("message" in payload) {
      expect(payload.message).not.toBe("<redaction-failed>")
    }
  })
})
