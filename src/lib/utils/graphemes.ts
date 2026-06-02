/**
 * Counts the number of grapheme clusters ("visible characters") in a string.
 *
 * Uses `Intl.Segmenter` with `granularity: "grapheme"` so that emoji and
 * combining/ZWJ sequences count as one unit (the form never overestimates).
 * Falls back to `Array.from(s).length` (code points) where `Intl.Segmenter`
 * is unavailable.
 *
 * Extracted verbatim from the create / project-new / project-edit /
 * activity-edit forms, which all used the same counter for their character
 * limits.
 */
export function countGraphemes(s: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    let count = 0
    for (const _ of seg.segment(s)) count++
    return count
  }
  return Array.from(s).length
}
