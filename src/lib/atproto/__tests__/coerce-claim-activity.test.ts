import { describe, it, expect } from "vitest"
import { coerceClaimActivityValue } from "../coerce-claim-activity"

/**
 * The normalizer guards PDS-served claim.activity values: it must blank the
 * string-declared render fields when a foreign record carries a non-string
 * shape, while preserving every other field byte-identical — the result
 * seeds the edit route's form, so a lossy rebuild would drop data on the
 * next edit-save.
 */

describe("coerceClaimActivityValue", () => {
  it("passes a well-formed value through unchanged, including non-string fields", () => {
    const value = {
      $type: "org.hypercerts.claim.activity",
      title: "Reforestation drive",
      shortDescription: "Planted 400 trees",
      createdAt: "2026-01-01T00:00:00.000Z",
      startDate: "2025-11-01",
      endDate: "2025-12-01",
      image: { $type: "blob", ref: { $link: "bafy" }, mimeType: "image/png", size: 10 },
      contributors: [{ contributorIdentity: { identity: "did:plc:abc" } }],
      workScope: { scope: "biodiversity" },
      shortDescriptionFacets: [{ index: { byteStart: 0, byteEnd: 4 } }],
      customExtension: { nested: true },
    }
    expect(coerceClaimActivityValue(value)).toEqual(value)
  })

  it("blanks non-string title / shortDescription / createdAt", () => {
    const coerced = coerceClaimActivityValue({
      title: {},
      shortDescription: ["not", "a", "string"],
      createdAt: 12345,
    })
    expect(coerced.title).toBe("")
    expect(coerced.shortDescription).toBe("")
    expect(coerced.createdAt).toBe("")
  })

  it("drops non-string startDate / endDate to undefined", () => {
    const coerced = coerceClaimActivityValue({
      title: "t",
      shortDescription: "s",
      createdAt: "2026-01-01T00:00:00.000Z",
      startDate: { year: 2025 },
      endDate: 42,
    })
    expect(coerced.startDate).toBeUndefined()
    expect(coerced.endDate).toBeUndefined()
  })

  it("preserves unknown extra fields when coercing bad render fields", () => {
    const coerced = coerceClaimActivityValue({
      title: {},
      image: { mimeType: "image/png" },
      somethingFuture: [1, 2, 3],
    }) as unknown as Record<string, unknown>
    expect(coerced.image).toEqual({ mimeType: "image/png" })
    expect(coerced.somethingFuture).toEqual([1, 2, 3])
  })

  it.each([null, undefined, "a string", 7, [1, 2]])(
    "yields a renderable skeleton for non-object input %p",
    (input) => {
      const coerced = coerceClaimActivityValue(input)
      expect(coerced.title).toBe("")
      expect(coerced.shortDescription).toBe("")
      expect(coerced.createdAt).toBe("")
    },
  )
})
