import { existsSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import type { Metadata } from "next"

import { metadata as welcomeMetadata } from "@/app/welcome/page"
import { metadata as termsMetadata } from "@/app/terms/page"
import { metadata as privacyMetadata } from "@/app/privacy/page"
import { metadata as dsaMetadata } from "@/app/dsa/page"
import { metadata as imprintMetadata } from "@/app/imprint/page"

const PUBLIC_DIR = path.resolve(__dirname, "../../../public")

type ImageEntry = NonNullable<NonNullable<Metadata["openGraph"]>["images"]>

/** Pull every image URL (string or object) out of an images field. */
function collectUrls(images: unknown): string[] {
  if (!images) return []
  const arr = Array.isArray(images) ? images : [images]
  return arr.flatMap((entry) => {
    if (typeof entry === "string") return [entry]
    if (entry instanceof URL) return [entry.toString()]
    if (entry && typeof entry === "object" && "url" in entry) {
      const url = (entry as { url: unknown }).url
      if (typeof url === "string") return [url]
      if (url instanceof URL) return [url.toString()]
    }
    return []
  })
}

/** Gather all OG + Twitter image URLs from a page's metadata export. */
function metadataImageUrls(metadata: Metadata): string[] {
  return [
    ...collectUrls(metadata.openGraph?.images as ImageEntry | undefined),
    ...collectUrls(metadata.twitter?.images as ImageEntry | undefined),
  ]
}

/** Resolve a metadata image URL (absolute or root-relative) to a public/ path. */
function publicPathFor(url: string): string {
  const pathname = url.startsWith("http")
    ? new URL(url).pathname
    : url
  return path.join(PUBLIC_DIR, pathname)
}

const PAGES: Array<{ name: string; metadata: Metadata }> = [
  { name: "welcome", metadata: welcomeMetadata },
  { name: "terms", metadata: termsMetadata },
  { name: "privacy", metadata: privacyMetadata },
  { name: "dsa", metadata: dsaMetadata },
  { name: "imprint", metadata: imprintMetadata },
]

describe("page metadata OG/Twitter share images", () => {
  for (const { name, metadata } of PAGES) {
    it(`${name}: every metadata image resolves to a file under public/`, () => {
      const urls = metadataImageUrls(metadata)
      expect(urls.length).toBeGreaterThan(0)
      for (const url of urls) {
        const filePath = publicPathFor(url)
        expect(existsSync(filePath), `${name}: missing asset for ${url} (${filePath})`).toBe(true)
      }
    })
  }
})
