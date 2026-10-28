import { describe, it, expect } from "vitest"
import { isAllowedEmbedHost, normaliseEmbedUrl } from "@/lib/leaflet/embed-url"

describe("isAllowedEmbedHost", () => {
  it("accepts https embeds from the supported providers", () => {
    expect(isAllowedEmbedHost("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(true)
    expect(isAllowedEmbedHost("https://youtube.com/embed/dQw4w9WgXcQ")).toBe(true)
    expect(
      isAllowedEmbedHost("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"),
    ).toBe(true)
    expect(isAllowedEmbedHost("https://player.vimeo.com/video/123456789")).toBe(true)
  })

  it("rejects other hosts", () => {
    expect(isAllowedEmbedHost("https://evil.example/embed/x")).toBe(false)
    expect(isAllowedEmbedHost("https://youtube.com.evil.example/embed/x")).toBe(false)
    expect(isAllowedEmbedHost("https://vimeo.com/123456789")).toBe(false)
  })

  it("rejects non-https protocols even with an allowed hostname", () => {
    expect(isAllowedEmbedHost("javascript://www.youtube.com/%0aalert(1)")).toBe(false)
    expect(isAllowedEmbedHost("JavaScript://www.youtube.com/%0aalert(1)")).toBe(false)
    expect(isAllowedEmbedHost("http://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(false)
    expect(isAllowedEmbedHost("data:text/html,<script>alert(1)</script>")).toBe(false)
    expect(isAllowedEmbedHost("ftp://player.vimeo.com/video/123456789")).toBe(false)
  })

  it("rejects malformed and empty input", () => {
    expect(isAllowedEmbedHost("")).toBe(false)
    expect(isAllowedEmbedHost("not a url")).toBe(false)
  })

  it("accepts every URL normaliseEmbedUrl produces", () => {
    for (const input of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "youtu.be/dQw4w9WgXcQ",
      "https://vimeo.com/123456789",
    ]) {
      const embed = normaliseEmbedUrl(input)
      expect(embed, input).not.toBeNull()
      expect(isAllowedEmbedHost(embed!.embedUrl), input).toBe(true)
    }
  })
})
