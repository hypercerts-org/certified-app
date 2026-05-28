import { describe, it, expect } from "vitest"
import { resolveAttachment } from "../context-attachment"

describe("resolveAttachment — uri scheme allowlist (bug-001)", () => {
  it("rejects a javascript: uri (returns null)", () => {
    expect(
      resolveAttachment({
        $type: "org.hypercerts.defs#uri",
        uri: "javascript:alert(document.cookie)",
      }),
    ).toBeNull()
  })

  it("rejects a data: uri (returns null)", () => {
    expect(
      resolveAttachment({
        $type: "org.hypercerts.defs#uri",
        uri: "data:text/html,<script>alert(1)</script>",
      }),
    ).toBeNull()
  })

  it("resolves a normal https uri", () => {
    expect(
      resolveAttachment({
        $type: "org.hypercerts.defs#uri",
        uri: "https://example.org/post",
      }),
    ).toEqual({ kind: "uri", uri: "https://example.org/post" })
  })

  it("resolves a normal http uri", () => {
    expect(
      resolveAttachment({
        $type: "org.hypercerts.defs#uri",
        uri: "http://example.org/post",
      }),
    ).toEqual({ kind: "uri", uri: "http://example.org/post" })
  })

  it("rejects an empty / missing uri (returns null)", () => {
    expect(
      resolveAttachment({ $type: "org.hypercerts.defs#uri", uri: "" }),
    ).toBeNull()
    expect(
      resolveAttachment({ $type: "org.hypercerts.defs#uri" }),
    ).toBeNull()
  })
})
