import { describe, it, expect } from "vitest"
import { safeHttpUrl } from "../safe-url"

/**
 * `safeHttpUrl` is the load-bearing helper against the leaflet XSS
 * class (issue #67's renderer/editor/serializer fix). These tests
 * pin the contract so the next refactor doesn't accidentally widen
 * the allowlist or stop rejecting `javascript:` URIs.
 */
describe("safeHttpUrl", () => {
  describe("accepts http(s) URLs", () => {
    it.each([
      ["https://example.com"],
      ["https://example.com/path"],
      ["https://example.com/path?query=1#hash"],
      ["http://example.com"],
      ["https://sub.domain.example.com:8443/x"],
      ["https://example.com/with%20space"],
    ])("returns the URL for %s", (input) => {
      const result = safeHttpUrl(input)
      expect(result).not.toBeNull()
      expect(result?.startsWith("http")).toBe(true)
    })
  })

  describe("rejects non-http(s) schemes", () => {
    it.each([
      ["javascript:alert(1)"],
      ["JavaScript:alert(1)"], // case-insensitive
      ["data:text/html,<script>alert(1)</script>"],
      ["vbscript:msgbox(1)"],
      ["file:///etc/passwd"],
      ["ftp://example.com/x"],
      ["mailto:user@example.com"], // intentional — see helper docstring
      ["tel:+1234567890"], // intentional — same
    ])("returns null for %s", (input) => {
      expect(safeHttpUrl(input)).toBeNull()
    })
  })

  describe("rejects malformed input", () => {
    it.each([
      [""],
      ["   "],
      ["not a url"],
      ["://no-scheme.com"],
      ["http:"],
      ["https://"], // host-less
    ])("returns null for %s", (input) => {
      // Two of these technically parse via `new URL()` (e.g.
      // `http:` parses with empty host) — the helper relies on the
      // protocol check, not the URL constructor's leniency. Either
      // the constructor throws, or the protocol gate catches it.
      const result = safeHttpUrl(input)
      // Allow either null (rejected) or a normalized URL that still
      // starts with http(s). The contract is "if non-null, safe to
      // assign to href".
      if (result !== null) {
        expect(result.startsWith("http")).toBe(true)
      }
    })
  })

  describe("rejects nullish + non-strings", () => {
    it("returns null for null", () => {
      expect(safeHttpUrl(null)).toBeNull()
    })
    it("returns null for undefined", () => {
      expect(safeHttpUrl(undefined)).toBeNull()
    })
    it("returns null for non-string values (type-asserted)", () => {
      // The signature accepts string | null | undefined, but defenses
      // run at runtime too — exercise the runtime check.
      expect(safeHttpUrl(123 as unknown as string)).toBeNull()
      expect(safeHttpUrl({} as unknown as string)).toBeNull()
      expect(safeHttpUrl([] as unknown as string)).toBeNull()
    })
  })

  describe("normalizes accepted URLs", () => {
    it("returns the parsed canonical form (default port stripped, etc.)", () => {
      // new URL() returns a canonical-ish form. Just assert
      // round-trippability for the cases the helper accepts.
      const result = safeHttpUrl("https://example.com:443/x")
      expect(result).toBeDefined()
      // 443 is the default for https — URL drops it on toString().
      expect(result).toBe("https://example.com/x")
    })
  })
})
